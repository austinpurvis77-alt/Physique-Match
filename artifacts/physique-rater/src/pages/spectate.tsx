import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import { io, Socket } from "socket.io-client";
import { ChevronLeft, Eye, Trophy, Zap, Clock } from "lucide-react";

const TARGET_SCORE = 50;

const TIER_MAP: Record<number, { label: string; color: string }> = {
  1:  { label: "VERY OVERWEIGHT",  color: "#ff2222" },
  2:  { label: "OVERWEIGHT",       color: "#ff5500" },
  3:  { label: "FAT",              color: "#ff8800" },
  4:  { label: "BELOW AVERAGE",    color: "#ffaa00" },
  5:  { label: "AVERAGE",          color: "#ffdd00" },
  6:  { label: "ABOVE AVERAGE",    color: "#aadd00" },
  7:  { label: "FIT",              color: "#66cc00" },
  8:  { label: "VERY FIT",         color: "#00cc66" },
  9:  { label: "EXTREMELY FIT",    color: "#00bbff" },
  10: { label: "PEAK PHYSIQUE",    color: "#aa44ff" },
};

interface SpectatePlayer {
  name: string;
  userId: string | null;
  score: number;
}

interface FeedEvent {
  id: number;
  playerIndex: number;
  playerName: string;
  roundScore: number;
  feedback: string;
  timestamp: number;
}

let eventIdCounter = 0;

function LivePulse() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
      <span className="font-mono text-xs text-red-400 uppercase tracking-widest">Live</span>
    </span>
  );
}

function ScoreBar({ score, targetScore, side }: { score: number; targetScore: number; side: "left" | "right" }) {
  const pct = Math.min(100, (score / targetScore) * 100);
  return (
    <div className="w-full h-2 bg-secondary relative overflow-hidden">
      <div
        className={`absolute top-0 bottom-0 transition-all duration-700 ease-out ${side === "left" ? "left-0 bg-primary" : "right-0 bg-destructive"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PlayerCard({
  player,
  side,
  targetScore,
  isWinner,
  lastRoundScore,
  pulseRound,
}: {
  player: SpectatePlayer;
  side: "left" | "right";
  targetScore: number;
  isWinner: boolean | null;
  lastRoundScore: number | null;
  pulseRound: boolean;
}) {
  const tierEntry = lastRoundScore ? TIER_MAP[lastRoundScore] : null;
  const accentColor = side === "left" ? "#00ff88" : "#ff3366";
  const textAlign = side === "left" ? "text-left" : "text-right";
  const flexDir = side === "left" ? "flex-row" : "flex-row-reverse";

  return (
    <div
      className={`flex-1 flex flex-col ${side === "left" ? "items-start border-r border-border/40" : "items-end"} px-4 md:px-8 py-6 relative`}
      style={{ borderLeft: side === "left" ? `3px solid ${accentColor}33` : undefined, borderRight: side === "right" ? `3px solid ${accentColor}33` : undefined }}
    >
      {isWinner === true && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at ${side === "left" ? "left" : "right"}, ${accentColor}18, transparent 70%)` }} />
      )}

      {/* Name row */}
      <div className={`flex items-center gap-2 mb-1 ${flexDir}`}>
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Player</span>
        {isWinner === true && <Trophy className="w-3 h-3" style={{ color: accentColor }} />}
      </div>
      <div className={`font-[family-name:--app-font-display] text-xl md:text-2xl uppercase tracking-wider truncate max-w-[180px] ${textAlign}`}
        style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}55` }}>
        {player.name}
      </div>

      {/* Score */}
      <div className={`font-[family-name:--app-font-display] leading-none mt-3 mb-2 transition-all duration-300 ${pulseRound ? "scale-110" : "scale-100"}`}
        style={{ fontSize: "clamp(3rem, 8vw, 5rem)", color: accentColor, textShadow: `0 0 30px ${accentColor}88` }}>
        {player.score}
      </div>

      {/* Tier */}
      {tierEntry && (
        <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border"
          style={{ color: tierEntry.color, borderColor: `${tierEntry.color}44`, background: `${tierEntry.color}18`, textShadow: `0 0 6px ${tierEntry.color}77` }}>
          {tierEntry.label}
        </div>
      )}

      {/* Progress bar */}
      <div className="w-full mt-auto">
        <ScoreBar score={player.score} targetScore={targetScore} side={side} />
        <div className={`font-mono text-[10px] text-muted-foreground mt-1 ${textAlign}`}>
          {player.score} / {targetScore}
        </div>
      </div>
    </div>
  );
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = startedAt;
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <span className="font-mono text-xs text-muted-foreground tabular-nums">{m}:{s.toString().padStart(2, "0")}</span>;
}

function FeedItem({ event }: { event: FeedEvent }) {
  const tier = TIER_MAP[event.roundScore];
  const accentColor = event.playerIndex === 0 ? "#00ff88" : "#ff3366";
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0 animate-in slide-in-from-bottom-2 fade-in duration-300">
      <div className="flex-shrink-0 w-7 h-7 rounded-sm flex items-center justify-center font-mono text-sm font-bold"
        style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}55`, color: accentColor }}>
        {event.roundScore}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-xs font-bold truncate" style={{ color: accentColor }}>{event.playerName}</span>
          {tier && (
            <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-px border"
              style={{ color: tier.color, borderColor: `${tier.color}44`, background: `${tier.color}15` }}>
              {tier.label}
            </span>
          )}
        </div>
        <p className="font-mono text-xs text-muted-foreground italic leading-relaxed truncate">"{event.feedback}"</p>
      </div>
      <span className="flex-shrink-0 font-mono text-[10px] text-muted-foreground/50 pt-0.5">
        {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    </div>
  );
}

export default function Spectate() {
  const params = useParams<{ roomId: string }>();
  const roomId = decodeURIComponent(params.roomId ?? "");

  const [players, setPlayers] = useState<[SpectatePlayer, SpectatePlayer] | null>(null);
  const [targetScore, setTargetScore] = useState(TARGET_SCORE);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [gameOver, setGameOver] = useState<{ winnerIndex: number; winnerName: string | null; finalScores: [number, number]; reason?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [spectatorCount, setSpectatorCount] = useState<number | null>(null);
  const [pulseIdx, setPulseIdx] = useState<number | null>(null);
  const [lastRoundScores, setLastRoundScores] = useState<[number | null, number | null]>([null, null]);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedBottomRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io({ path: "/api/socket.io", transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-spectate", { roomId });
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("spectate-state", (data: {
      roomId: string;
      players: [SpectatePlayer, SpectatePlayer];
      startedAt: number;
      targetScore: number;
    }) => {
      setPlayers(data.players);
      setStartedAt(data.startedAt);
      setTargetScore(data.targetScore);
    });

    socket.on("spectator-score-update", (data: {
      scores: [number, number];
      roundScore: number;
      feedback: string;
      scoringPlayerIndex: number;
      targetScore: number;
    }) => {
      setPlayers(prev => {
        if (!prev) return prev;
        const updated: [SpectatePlayer, SpectatePlayer] = [
          { ...prev[0], score: data.scores[0] },
          { ...prev[1], score: data.scores[1] },
        ];
        return updated;
      });
      setLastRoundScores(prev => {
        const updated: [number | null, number | null] = [...prev] as [number | null, number | null];
        updated[data.scoringPlayerIndex] = data.roundScore;
        return updated;
      });

      // Pulse the scoring player
      setPulseIdx(data.scoringPlayerIndex);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = setTimeout(() => setPulseIdx(null), 800);

      setFeedEvents(prev => {
        const newEvent: FeedEvent = {
          id: ++eventIdCounter,
          playerIndex: data.scoringPlayerIndex,
          playerName: "?",
          roundScore: data.roundScore,
          feedback: data.feedback,
          timestamp: Date.now(),
        };
        return [newEvent, ...prev].slice(0, 50);
      });

      // Fill in player name once we have it
      setPlayers(prev => {
        if (!prev) return prev;
        setFeedEvents(evs => evs.map(e => e.id === eventIdCounter
          ? { ...e, playerName: prev[data.scoringPlayerIndex]?.name ?? "?" }
          : e));
        return prev;
      });
    });

    socket.on("spectator-game-over", (data: {
      winnerIndex: number;
      winnerName: string | null;
      finalScores: [number, number];
      reason?: string;
    }) => {
      setGameOver(data);
    });

    socket.on("spectate-error", (data: { message: string }) => {
      setError(data.message);
    });

    return () => {
      socket.emit("leave-spectate");
      socket.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    feedBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feedEvents.length]);

  if (error) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 text-center p-6">
        <Zap className="w-12 h-12 text-primary/40" />
        <h2 className="font-[family-name:--app-font-display] text-3xl uppercase text-foreground">Match Not Found</h2>
        <p className="font-mono text-sm text-muted-foreground max-w-xs">{error}</p>
        <Link href="/leaderboard"
          className="border border-primary/40 text-primary px-6 py-2 font-mono text-sm uppercase tracking-wider hover:bg-primary/10 transition-colors">
          Back to Leaderboard
        </Link>
      </div>
    );
  }

  if (!connected || !players) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest animate-pulse">Connecting to match...</p>
      </div>
    );
  }

  const leadIdx = players[0].score >= players[1].score ? 0 : 1;

  return (
    <div className="min-h-screen bg-black flex flex-col overflow-hidden relative scanlines">
      {/* Background ambiance */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,hsl(270,60%,12%),transparent)]" />
      </div>
      <div className="absolute inset-0 vignette z-0 pointer-events-none" />

      <div className="relative z-10 flex flex-col h-screen">
        {/* Header */}
        <header className="border-b border-border/40 px-4 py-3 flex items-center justify-between flex-shrink-0 backdrop-blur-sm bg-black/60">
          <Link href="/leaderboard"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors font-mono text-xs uppercase tracking-widest">
            <ChevronLeft className="w-3.5 h-3.5" /> Leaderboard
          </Link>

          <div className="flex items-center gap-3">
            <LivePulse />
            <span className="font-[family-name:--app-font-display] text-lg uppercase tracking-widest text-white">Spectating</span>
          </div>

          <div className="flex items-center gap-3 text-muted-foreground">
            {startedAt && <div className="flex items-center gap-1"><Clock className="w-3 h-3" /><ElapsedTimer startedAt={startedAt} /></div>}
            {spectatorCount !== null && (
              <div className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                <span className="font-mono text-xs">{spectatorCount}</span>
              </div>
            )}
          </div>
        </header>

        {/* Main arena */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Player 0 */}
          <PlayerCard
            player={players[0]}
            side="left"
            targetScore={targetScore}
            isWinner={gameOver ? gameOver.winnerIndex === 0 : null}
            lastRoundScore={lastRoundScores[0]}
            pulseRound={pulseIdx === 0}
          />

          {/* Center divider */}
          <div className="hidden md:flex flex-col items-center justify-center px-4 py-6 border-x border-border/20 bg-secondary/10">
            <div className="font-[family-name:--app-font-display] text-muted-foreground text-3xl mb-2">VS</div>
            <div className="w-px flex-1 bg-border/20 mx-auto" />
            <div className="font-mono text-[10px] text-muted-foreground/40 uppercase mt-2">First to {targetScore}</div>
          </div>

          {/* Mobile center label */}
          <div className="flex md:hidden items-center justify-center py-2 border-y border-border/20 bg-secondary/10">
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">vs — First to {targetScore}</span>
          </div>

          {/* Player 1 */}
          <PlayerCard
            player={players[1]}
            side="right"
            targetScore={targetScore}
            isWinner={gameOver ? gameOver.winnerIndex === 1 : null}
            lastRoundScore={lastRoundScores[1]}
            pulseRound={pulseIdx === 1}
          />
        </div>

        {/* Feed */}
        <div className="flex-shrink-0 border-t border-border/40 bg-black/80 flex flex-col" style={{ maxHeight: "35vh" }}>
          <div className="px-4 py-2 border-b border-border/30 flex items-center gap-2">
            <Zap className="w-3 h-3 text-primary" />
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">AI Judgements</span>
            <span className="font-mono text-xs text-muted-foreground/40">— live feed</span>
          </div>
          <div className="overflow-y-auto flex-1 px-4 py-1">
            {feedEvents.length === 0 ? (
              <div className="flex items-center justify-center h-12">
                <span className="font-mono text-xs text-muted-foreground/40 animate-pulse">Waiting for first AI judgement...</span>
              </div>
            ) : (
              feedEvents.map(ev => <FeedItem key={ev.id} event={ev} />)
            )}
            <div ref={feedBottomRef} />
          </div>
        </div>
      </div>

      {/* Game Over Overlay */}
      {gameOver && (
        <div className="absolute inset-0 z-50 bg-black/92 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in duration-500">
          <div className="max-w-md w-full border border-border bg-card p-8 text-center shadow-2xl space-y-4">
            {gameOver.reason === "disconnect" ? (
              <>
                <div className="font-mono text-sm text-muted-foreground uppercase tracking-widest">Match Ended</div>
                <h2 className="font-[family-name:--app-font-display] text-4xl uppercase text-foreground">Disconnected</h2>
                <p className="font-mono text-xs text-muted-foreground">A player left the arena.</p>
              </>
            ) : gameOver.winnerIndex === -1 ? (
              <>
                <h2 className="font-[family-name:--app-font-display] text-4xl uppercase text-muted-foreground">Match Over</h2>
              </>
            ) : (
              <>
                <Trophy className="w-14 h-14 text-primary mx-auto" />
                <div className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Winner</div>
                <h2 className="font-[family-name:--app-font-display] text-5xl uppercase"
                  style={{ color: gameOver.winnerIndex === 0 ? "#00ff88" : "#ff3366" }}>
                  {gameOver.winnerName ?? players[gameOver.winnerIndex]?.name ?? "—"}
                </h2>
                <div className="flex items-center justify-center gap-6 font-[family-name:--app-font-display] text-4xl mt-2">
                  <span style={{ color: "#00ff88" }}>{gameOver.finalScores[0]}</span>
                  <span className="text-muted-foreground text-2xl">—</span>
                  <span style={{ color: "#ff3366" }}>{gameOver.finalScores[1]}</span>
                </div>
              </>
            )}
            <Link href="/leaderboard"
              className="inline-block mt-4 border border-primary/40 text-primary px-8 py-3 font-mono text-sm uppercase tracking-wider hover:bg-primary/10 transition-colors">
              Back to Leaderboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
