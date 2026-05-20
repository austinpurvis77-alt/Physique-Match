import type { Server, Socket } from "socket.io";
import { logger } from "./logger";

export const TARGET_SCORE = 50;
export const RATING_INTERVAL_MS = 5000;

export interface Player {
  socketId: string;
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

export function setupGameManager(io: Server) {
  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "Client connected");

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
        room.players.forEach((p) => {
          io.to(p.socketId).emit("game-over", {
            won: p.socketId === winner.socketId,
            finalScores: {
              myScore: p.socketId === p0.socketId ? p0.score : p1.score,
              opponentScore: p.socketId === p0.socketId ? p1.score : p0.score,
            },
          });
        });
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
    });
  });
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
      { socketId: s1.id, score: 0, lastRatedAt: now },
      { socketId: s2.id, score: 0, lastRatedAt: now },
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
