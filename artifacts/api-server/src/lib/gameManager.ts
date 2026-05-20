import type { Server, Socket } from "socket.io";
import { db, usersTable, matchHistoryTable } from "@workspace/db";
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
  playerNames: [string, string];
  playerUserIds: [string | null, string | null];
  startedAt: number;
  finished: boolean;
}

const PRIVATE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const queue: Socket[] = [];
const rooms = new Map<string, Room>();
const playerRoom = new Map<string, string>();
const spectatorRoom = new Map<string, string>(); // spectator socketId -> roomId
const roomSpectators = new Map<string, Set<string>>(); // roomId -> spectator socket IDs

const socketUserMap = new Map<string, string>();
const socketDisplayNameMap = new Map<string, string>();
const privateRoomHosts = new Map<string, string>(); // code -> hostSocketId

export function registerUserSocket(socketId: string, userId: string) {
  socketUserMap.set(socketId, userId);
}

function spectatorRoomId(roomId: string) {
  return `spec:${roomId}`;
}

export function setupGameManager(io: Server) {
  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "Client connected");

    socket.on("identify", (data: { userId: string; displayName?: string }) => {
      if (data?.userId) {
        socketUserMap.set(socket.id, data.userId);
        logger.info({ socketId: socket.id, userId: data.userId }, "User identified");
      }
      if (data?.displayName) {
        socketDisplayNameMap.set(socket.id, data.displayName);
      }
    });

    socket.on("join-queue", () => {
      if (playerRoom.has(socket.id)) {
        socket.emit("error", { message: "Already in a room" });
        return;
      }
      if (queue.find((s) => s.id === socket.id)) return;
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

    // ── Private room events ──────────────────────────────────────────────────
    socket.on("host-private-room", (data: { code: string }) => {
      const code = data?.code?.toUpperCase();
      if (!code || code.length !== 6) {
        socket.emit("private-room-error", { message: "Invalid room code." });
        return;
      }
      if (privateRoomHosts.has(code)) {
        socket.emit("private-room-error", { message: "Code already in use. Please generate a new one." });
        return;
      }
      privateRoomHosts.set(code, socket.id);
      socket.emit("private-room-hosted", { code });
      logger.info({ socketId: socket.id, code }, "Private room hosted");
    });

    socket.on("join-private-room", (data: { code: string }) => {
      const code = data?.code?.toUpperCase();
      if (!code) {
        socket.emit("private-room-error", { message: "No code provided." });
        return;
      }
      const hostSocketId = privateRoomHosts.get(code);
      if (!hostSocketId) {
        socket.emit("private-room-error", { message: "Room not found. Ask your friend to create the room first." });
        return;
      }
      const hostSocket = io.sockets.sockets.get(hostSocketId);
      if (!hostSocket) {
        privateRoomHosts.delete(code);
        socket.emit("private-room-error", { message: "Host disconnected. Ask your friend to create a new room." });
        return;
      }
      privateRoomHosts.delete(code);
      directMatch(io, hostSocket, socket);
      logger.info({ hostSocketId, joinerSocketId: socket.id, code }, "Private room matched");
    });

    socket.on("cancel-private-room", () => {
      for (const [code, hostId] of privateRoomHosts) {
        if (hostId === socket.id) { privateRoomHosts.delete(code); break; }
      }
    });

    // ── Spectator events ────────────────────────────────────────────────────
    socket.on("join-spectate", (data: { roomId: string }) => {
      const roomId = data?.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.finished) {
        socket.emit("spectate-error", { message: "Match not found or already ended." });
        return;
      }
      if (!roomSpectators.has(roomId)) roomSpectators.set(roomId, new Set());
      roomSpectators.get(roomId)!.add(socket.id);
      spectatorRoom.set(socket.id, roomId);
      socket.join(spectatorRoomId(roomId));
      logger.info({ socketId: socket.id, roomId }, "Spectator joined");

      // Send current state immediately
      const [p0, p1] = room.players;
      socket.emit("spectate-state", {
        roomId,
        players: [
          { name: room.playerNames[0], userId: room.playerUserIds[0], score: p0.score },
          { name: room.playerNames[1], userId: room.playerUserIds[1], score: p1.score },
        ],
        startedAt: room.startedAt,
        targetScore: TARGET_SCORE,
      });
    });

    socket.on("leave-spectate", () => {
      leaveSpectate(socket);
    });

    // ── WebRTC relay ────────────────────────────────────────────────────────
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

    // ── Score update ────────────────────────────────────────────────────────
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
      const scoringIdx = socket.id === p0.socketId ? 0 : 1;
      const scorePayload = {
        myScore: socket.id === p0.socketId ? p0.score : p1.score,
        opponentScore: socket.id === p0.socketId ? p1.score : p0.score,
        targetScore: TARGET_SCORE,
        myFeedback: data.feedback,
      };
      socket.emit("score-update", scorePayload);

      // Broadcast to spectators
      io.to(spectatorRoomId(roomId)).emit("spectator-score-update", {
        scores: [p0.score, p1.score],
        roundScore: data.score,
        feedback: data.feedback,
        scoringPlayerIndex: scoringIdx,
        targetScore: TARGET_SCORE,
      });

      const winner = room.players.find((p) => p.score >= TARGET_SCORE);
      if (winner) {
        room.finished = true;
        const loser = room.players.find((p) => p.socketId !== winner.socketId)!;
        const winnerIdx = winner.socketId === p0.socketId ? 0 : 1;

        room.players.forEach((p) => {
          io.to(p.socketId).emit("game-over", {
            won: p.socketId === winner.socketId,
            finalScores: {
              myScore: p.socketId === p0.socketId ? p0.score : p1.score,
              opponentScore: p.socketId === p0.socketId ? p1.score : p0.score,
            },
          });
        });

        // Notify spectators
        io.to(spectatorRoomId(roomId)).emit("spectator-game-over", {
          winnerIndex: winnerIdx,
          winnerName: room.playerNames[winnerIdx],
          finalScores: [p0.score, p1.score],
        });

        updateElo(winner, loser, winner.score, loser.score).catch((err) =>
          logger.error({ err }, "Failed to update ELO"),
        );
        cleanupRoom(io, roomId);
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
      // Clean up private room hosting on disconnect
      for (const [code, hostId] of privateRoomHosts) {
        if (hostId === socket.id) { privateRoomHosts.delete(code); break; }
      }
      handleDisconnect(io, socket);
      leaveSpectate(socket);
      socketUserMap.delete(socket.id);
      socketDisplayNameMap.delete(socket.id);
    });
  });
}

function directMatch(io: Server, s1: Socket, s2: Socket) {
  const roomId = `${s1.id}-${s2.id}`;
  const now = Date.now();
  const uid1 = socketUserMap.get(s1.id) ?? null;
  const uid2 = socketUserMap.get(s2.id) ?? null;

  const room: Room = {
    id: roomId,
    players: [
      { socketId: s1.id, userId: uid1, score: 0, lastRatedAt: now },
      { socketId: s2.id, userId: uid2, score: 0, lastRatedAt: now },
    ],
    playerNames: [
      socketDisplayNameMap.get(s1.id) ?? "Fighter",
      socketDisplayNameMap.get(s2.id) ?? "Fighter",
    ],
    playerUserIds: [uid1, uid2],
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
  logger.info({ roomId, player1: s1.id, player2: s2.id }, "Direct (private) match started");
}

function leaveSpectate(socket: Socket) {
  const roomId = spectatorRoom.get(socket.id);
  if (!roomId) return;
  roomSpectators.get(roomId)?.delete(socket.id);
  spectatorRoom.delete(socket.id);
  socket.leave(spectatorRoomId(roomId));
}

function calcExpected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function newRating(rating: number, expected: number, actual: number, k = 32): number {
  return Math.round(rating + k * (actual - expected));
}

async function updateElo(winner: Player, loser: Player, winnerScore: number, loserScore: number): Promise<void> {
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
    const newLoserElo = Math.max(100, newRating(loserElo, expectedLoss, 0));
    const winnerEloChange = newWinnerElo - winnerElo;
    const loserEloChange = newLoserElo - loserElo;
    await Promise.all([
      db.update(usersTable)
        .set({ eloRating: newWinnerElo, wins: sql`${usersTable.wins} + 1`, updatedAt: new Date() })
        .where(eq(usersTable.id, winnerId)),
      db.update(usersTable)
        .set({ eloRating: newLoserElo, losses: sql`${usersTable.losses} + 1`, updatedAt: new Date() })
        .where(eq(usersTable.id, loserId)),
      db.insert(matchHistoryTable).values({
        player1Id: winnerId,
        player2Id: loserId,
        winnerId: winnerId,
        player1Score: winnerScore,
        player2Score: loserScore,
        player1EloChange: winnerEloChange,
        player2EloChange: loserEloChange,
      }),
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

  const uid1 = socketUserMap.get(s1.id) ?? null;
  const uid2 = socketUserMap.get(s2.id) ?? null;

  const room: Room = {
    id: roomId,
    players: [
      { socketId: s1.id, userId: uid1, score: 0, lastRatedAt: now },
      { socketId: s2.id, userId: uid2, score: 0, lastRatedAt: now },
    ],
    playerNames: [
      socketDisplayNameMap.get(s1.id) ?? "Fighter",
      socketDisplayNameMap.get(s2.id) ?? "Fighter",
    ],
    playerUserIds: [uid1, uid2],
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
  if (partner) io.to(partner.socketId).emit("partner-left");

  // Notify spectators
  io.to(spectatorRoomId(roomId)).emit("spectator-game-over", {
    winnerIndex: -1,
    winnerName: null,
    finalScores: [room.players[0].score, room.players[1].score],
    reason: "disconnect",
  });

  room.finished = true;
  cleanupRoom(io, roomId);
}

function cleanupRoom(io: Server, roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players.forEach((p) => playerRoom.delete(p.socketId));
  rooms.delete(roomId);
  roomSpectators.delete(roomId);
  // Spectators get removed from the socket.io room automatically on next event
}

export function getStats() {
  return {
    playersOnline: queue.length + rooms.size * 2,
    activeGames: rooms.size,
  };
}

export function getActiveRooms() {
  return Array.from(rooms.values())
    .filter((r) => !r.finished)
    .map((r) => ({
      roomId: r.id,
      players: [
        { name: r.playerNames[0], userId: r.playerUserIds[0] ?? null, score: r.players[0].score },
        { name: r.playerNames[1], userId: r.playerUserIds[1] ?? null, score: r.players[1].score },
      ] as [{ name: string; userId: string | null; score: number }, { name: string; userId: string | null; score: number }],
      startedAt: r.startedAt,
      spectatorCount: roomSpectators.get(r.id)?.size ?? 0,
    }));
}
