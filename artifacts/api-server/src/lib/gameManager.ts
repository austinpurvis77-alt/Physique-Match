import type { Server, Socket } from "socket.io";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export const TARGET_SCORE = 50;
export const RATING_INTERVAL_MS = 5000;

export interface Player {
  socketId: string;
  userId: string | null;
  score: number;
  lastRatedAt: number;
}

export interface Room {
  id: string;
  players: [Player, Player];
  startedAt: number;
  finished: boolean;
}

const queue: Socket[] = [];
const rooms = new Map<string, Room>();
const playerRoom = new Map<string, string>();

const socketUserMap = new Map<string, string>();

export function registerUserSocket(socketId: string, userId: string) {
  socketUserMap.set(socketId, userId);
}

export function setupGameManager(io: Server) {
  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "Client connected");

    socket.on("identify", (data: { userId: string }) => {
      if (data?.userId) {
        socketUserMap.set(socket.id, data.userId);
        logger.info({ socketId: socket.id, userId: data.userId }, "User identified");
      }
    });

    socket.on("join-queue", () => {
      if (playerRoom.has(socket.id)) {
        socket.emit("error", { message: "Already in a room" });
        return;
      }

      if (queue.find((s) => s.id === socket.id)) {
        return;
      }

      queue.push(socket);
      socket.emit("queue-joined", { position: queue.length });
      logger.info({ socketId: socket.id, queueLen: queue.length }, "Joined queue");

      tryMatch(io);
    });

    socket.on("leave-queue", () => {
      const idx = queue.findIndex((s) => s.id === socket.id);
      if (idx !== -1) {
        queue.splice(idx, 1);
        socket.emit("queue-left");
      }
    });

    socket.on("webrtc-offer", (data: { offer: RTCSessionDescriptionInit }) => {
      const roomId = playerRoom.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const partner = room.players.find((p) => p.socketId !== socket.id);
      if (!partner) return;
      io.to(partner.socketId).emit("webrtc-offer", { offer: data.offer });
    });

    socket.on("webrtc-answer", (data: { answer: RTCSessionDescriptionInit }) => {
      const roomId = playerRoom.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const partner = room.players.find((p) => p.socketId !== socket.id);
      if (!partner) return;
      io.to(partner.socketId).emit("webrtc-answer", { answer: data.answer });
    });

    socket.on("webrtc-ice", (data: { candidate: RTCIceCandidateInit }) => {
      const roomId = playerRoom.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const partner = room.players.find((p) => p.socketId !== socket.id);
      if (!partner) return;
      io.to(partner.socketId).emit("webrtc-ice", { candidate: data.candidate });
    });

    socket.on("score-update", (data: { score: number; feedback: string }) => {
      const roomId = playerRoom.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.finished) return;

      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player) return;

      player.score += data.score;
      player.lastRatedAt = Date.now();

      const [p0, p1] = room.players;
      const scorePayload = {
        myScore: socket.id === p0.socketId ? p0.score : p1.score,
        opponentScore: socket.id === p0.socketId ? p1.score : p0.score,
        targetScore: TARGET_SCORE,
        myFeedback: data.feedback,
      };

      socket.emit("score-update", scorePayload);

      const winner = room.players.find((p) => p.score >= TARGET_SCORE);
      if (winner) {
        room.finished = true;
        const loser = room.players.find((p) => p.socketId !== winner.socketId)!;
        room.players.forEach((p) => {
          io.to(p.socketId).emit("game-over", {
            won: p.socketId === winner.socketId,
            finalScores: {
              myScore: p.socketId === p0.socketId ? p0.score : p1.score,
              opponentScore: p.socketId === p0.socketId ? p1.score : p0.score,
            },
          });
        });

        updateElo(winner, loser).catch((err) =>
          logger.error({ err }, "Failed to update ELO"),
        );

        cleanupRoom(roomId);
        logger.info({ roomId, winnerId: winner.socketId }, "Game over");
      }
    });

    socket.on("leave-room", () => {
      handleDisconnect(io, socket);
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Client disconnected");
      const idx = queue.findIndex((s) => s.id === socket.id);
      if (idx !== -1) queue.splice(idx, 1);
      handleDisconnect(io, socket);
      socketUserMap.delete(socket.id);
    });
  });
}

function calcExpected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function newRating(rating: number, expected: number, actual: number, k = 32): number {
  return Math.round(rating + k * (actual - expected));
}

async function updateElo(winner: Player, loser: Player): Promise<void> {
  const winnerId = winner.userId;
  const loserId = loser.userId;

  const userIds = [winnerId, loserId].filter((id): id is string => !!id);
  if (userIds.length === 0) return;

  const fetchUser = async (id: string) => {
    const [u] = await db.select({ eloRating: usersTable.eloRating }).from(usersTable).where(eq(usersTable.id, id));
    return u?.eloRating ?? 1000;
  };

  if (winnerId && loserId) {
    const [winnerElo, loserElo] = await Promise.all([fetchUser(winnerId), fetchUser(loserId)]);
    const expectedWin = calcExpected(winnerElo, loserElo);
    const expectedLoss = calcExpected(loserElo, winnerElo);
    const newWinnerElo = newRating(winnerElo, expectedWin, 1);
    const newLoserElo = newRating(loserElo, expectedLoss, 0);

    await Promise.all([
      db.update(usersTable)
        .set({ eloRating: newWinnerElo, wins: sql`${usersTable.wins} + 1`, updatedAt: new Date() })
        .where(eq(usersTable.id, winnerId)),
      db.update(usersTable)
        .set({ eloRating: Math.max(100, newLoserElo), losses: sql`${usersTable.losses} + 1`, updatedAt: new Date() })
        .where(eq(usersTable.id, loserId)),
    ]);

    logger.info({ winnerId, newWinnerElo, loserId, newLoserElo }, "ELO updated");
  } else if (winnerId) {
    await db.update(usersTable)
      .set({ wins: sql`${usersTable.wins} + 1`, updatedAt: new Date() })
      .where(eq(usersTable.id, winnerId));
  } else if (loserId) {
    await db.update(usersTable)
      .set({ losses: sql`${usersTable.losses} + 1`, updatedAt: new Date() })
      .where(eq(usersTable.id, loserId));
  }
}

function tryMatch(io: Server) {
  if (queue.length < 2) return;

  const s1 = queue.shift()!;
  const s2 = queue.shift()!;

  const roomId = `${s1.id}-${s2.id}`;
  const now = Date.now();

  const room: Room = {
    id: roomId,
    players: [
      { socketId: s1.id, userId: socketUserMap.get(s1.id) ?? null, score: 0, lastRatedAt: now },
      { socketId: s2.id, userId: socketUserMap.get(s2.id) ?? null, score: 0, lastRatedAt: now },
    ],
    startedAt: now,
    finished: false,
  };

  rooms.set(roomId, room);
  playerRoom.set(s1.id, roomId);
  playerRoom.set(s2.id, roomId);

  s1.join(roomId);
  s2.join(roomId);

  s1.emit("matched", { roomId, role: "caller", targetScore: TARGET_SCORE });
  s2.emit("matched", { roomId, role: "receiver", targetScore: TARGET_SCORE });

  logger.info({ roomId, player1: s1.id, player2: s2.id }, "Players matched");
}

function handleDisconnect(io: Server, socket: Socket) {
  const roomId = playerRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room || room.finished) {
    playerRoom.delete(socket.id);
    return;
  }

  const partner = room.players.find((p) => p.socketId !== socket.id);
  if (partner) {
    io.to(partner.socketId).emit("partner-left");
  }

  room.finished = true;
  cleanupRoom(roomId);
}

function cleanupRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players.forEach((p) => playerRoom.delete(p.socketId));
  rooms.delete(roomId);
}

export function getStats() {
  return {
    playersOnline: queue.length + rooms.size * 2,
    activeGames: rooms.size,
  };
}
