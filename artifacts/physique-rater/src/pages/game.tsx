import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { Link } from "wouter";
import { useRateFrame } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { CameraOff, AlertTriangle, Trophy } from "lucide-react";

type GameState = "idle" | "queue" | "matched" | "game-over" | "error";

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

interface RoundResult {
  score: number;
  feedback: string;
}

const NODES: [number, number][] = [
  [50, 7],[50, 13],[50, 20],[32, 28],[68, 28],[50, 36],
  [22, 46],[78, 46],[16, 60],[84, 60],[38, 62],[62, 62],
  [36, 79],[64, 79],[34, 96],[66, 96],
];

const EDGES: [number, number][] = [
  [0,1],[1,2],[2,3],[2,4],[3,5],[4,5],[3,6],[6,8],[4,7],[7,9],
  [5,10],[5,11],[3,10],[4,11],[10,11],[10,12],[12,14],[11,13],[13,15],
];

function PhysiqueScanOverlay({ burst }: { burst: boolean }) {
  return (
    <>
      <style>{`
        @keyframes scan-sweep {
          0%   { transform: translateY(-4px); opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { transform: translateY(100%); opacity: 0; }
        }
        @keyframes node-pulse {
          0%, 100% { r: 3; opacity: 0.7; }
          50%       { r: 5; opacity: 1; }
        }
        @keyframes node-burst {
          0%   { r: 3; opacity: 0.7; }
          20%  { r: 8; opacity: 1; }
          60%  { r: 5; opacity: 1; }
          100% { r: 3; opacity: 0.7; }
        }
        @keyframes edge-march { to { stroke-dashoffset: -24; } }
        @keyframes edge-burst {
          0%   { opacity: 0.35; stroke-width: 1; }
          20%  { opacity: 1;    stroke-width: 2; }
          100% { opacity: 0.35; stroke-width: 1; }
        }
        @keyframes scan-label-blink {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
      `}</style>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ mixBlendMode: "screen" }}>
        <defs>
          <filter id="glow-green">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-burst">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="scanGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#00ff88" stopOpacity="0" />
            <stop offset="40%"  stopColor="#00ff88" stopOpacity="0.6" />
            <stop offset="50%"  stopColor="#aaffdd" stopOpacity="1" />
            <stop offset="60%"  stopColor="#00ff88" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#00ff88" stopOpacity="0" />
          </linearGradient>
        </defs>

        {EDGES.map(([a, b], i) => {
          const [x1, y1] = NODES[a];
          const [x2, y2] = NODES[b];
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={burst ? "#ffffff" : "#00ff88"}
              strokeOpacity={burst ? 0.9 : 0.35}
              strokeWidth={burst ? 1.5 : 1}
              filter={burst ? "url(#glow-burst)" : "url(#glow-green)"}
              strokeDasharray="6 3"
              style={{
                animation: burst ? `edge-burst 1.4s ease-out forwards` : `edge-march 1.2s linear infinite`,
                animationDelay: burst ? `${i * 0.03}s` : `${i * 0.05}s`,
              }} />
          );
        })}

        {NODES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3}
            fill={burst ? "#ffffff" : "#00ff88"}
            filter={burst ? "url(#glow-burst)" : "url(#glow-green)"}
            style={{
              animation: burst ? `node-burst 1.4s ease-out forwards` : `node-pulse 2s ease-in-out infinite`,
              animationDelay: burst ? `${i * 0.04}s` : `${(i * 137) % 2000}ms`,
            }} />
        ))}

        {!burst && (
          <rect x="0" y="0" width="100" height="1.5" fill="url(#scanGrad)"
            style={{ animation: "scan-sweep 3s ease-in-out infinite" }} />
        )}

        {[
          { x: 2, y: 2, rx: 1, ry: 1 }, { x: 98, y: 2, rx: -1, ry: 1 },
          { x: 2, y: 98, rx: 1, ry: -1 }, { x: 98, y: 98, rx: -1, ry: -1 },
        ].map((c, i) => (
          <g key={i} stroke={burst ? "#ffffff" : "#00ff88"} strokeWidth="0.8" fill="none"
            opacity={burst ? 1 : 0.7} filter="url(#glow-green)">
            <line x1={c.x} y1={c.y} x2={c.x + c.rx * 5} y2={c.y} />
            <line x1={c.x} y1={c.y} x2={c.x} y2={c.y + c.ry * 5} />
          </g>
        ))}

        <text x="50" y="99" textAnchor="middle" fontSize="2.5"
          fill={burst ? "#ffffff" : "#00ff88"} fontFamily="monospace"
          style={{ animation: "scan-label-blink 1s ease-in-out infinite" }}>
          {burst ? "ANALYZING..." : "SCANNING"}
        </text>
      </svg>
    </>
  );
}

function TierBadge({ score }: { score: number | null }) {
  if (!score || !TIER_MAP[score]) return null;
  const tier = TIER_MAP[score];
  return (
    <div className="mt-1 font-mono text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm w-fit"
      style={{
        color: tier.color,
        border: `1px solid ${tier.color}44`,
        background: `${tier.color}18`,
        textShadow: `0 0 8px ${tier.color}99`,
      }}>
      {tier.label}
    </div>
  );
}

function ScoreBreakdown({ history }: { history: RoundResult[] }) {
  if (history.length === 0) return null;
  const avg = Math.round(history.reduce((s, r) => s + r.score, 0) / history.length);
  const lastFeedback = history[history.length - 1]?.feedback;
  const dots = history.slice(-10);

  return (
    <div className="mt-4 border border-border bg-secondary/30 p-4 text-left space-y-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Avg Score</span>
        <span className="font-display text-2xl" style={{ color: TIER_MAP[avg]?.color ?? "#fff" }}>{avg}/10</span>
        <TierBadge score={avg} />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest mr-1">Rounds</span>
        {dots.map((r, i) => (
          <div key={i} title={`Round ${history.length - dots.length + i + 1}: ${r.score}/10`}
            className="w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-mono font-bold"
            style={{
              background: `${TIER_MAP[r.score]?.color ?? "#888"}33`,
              border: `1px solid ${TIER_MAP[r.score]?.color ?? "#888"}`,
              color: TIER_MAP[r.score]?.color ?? "#888",
            }}>
            {r.score}
          </div>
        ))}
      </div>

      {lastFeedback && (
        <p className="font-mono text-xs text-muted-foreground italic leading-relaxed">
          "{lastFeedback}"
        </p>
      )}
    </div>
  );
}

interface GameArenaProps {
  onRematch: () => void;
}

function GameArena({ onRematch }: GameArenaProps) {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [targetScore, setTargetScore] = useState(50);
  const [myFeedback, setMyFeedback] = useState<string | null>(null);
  const [lastRoundScore, setLastRoundScore] = useState<number | null>(null);
  const [opponentLastRoundScore, setOpponentLastRoundScore] = useState<number | null>(null);
  const [scoreHistory, setScoreHistory] = useState<RoundResult[]>([]);
  const [won, setWon] = useState<boolean | null>(null);
  const [partnerLeft, setPartnerLeft] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [scanBurst, setScanBurst] = useState(false);

  const prevOpponentScoreRef = useRef(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const ratingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const burstTimerRef = useRef<NodeJS.Timeout | null>(null);

  const rateFrame = useRateFrame();
  const rateFrameMutateRef = useRef(rateFrame.mutateAsync);
  rateFrameMutateRef.current = rateFrame.mutateAsync;

  const { user } = useAuth();
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  const cleanup = useCallback(() => {
    if (ratingIntervalRef.current) clearInterval(ratingIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
  }, []);

  useEffect(() => { return () => cleanup(); }, [cleanup]);

  useEffect(() => {
    setGameState("queue");
    const socket = io({ path: "/api/socket.io", transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (userIdRef.current) socket.emit("identify", { userId: userIdRef.current });
      socket.emit("join-queue");
    });

    socket.on("matched", async (data: { roomId: string; role: "caller" | "receiver"; targetScore: number }) => {
      setGameState("matched");
      setTargetScore(data.targetScore);
      setMyScore(0); setOpponentScore(0);
      setLastRoundScore(null); setOpponentLastRoundScore(null);
      setScoreHistory([]);
      setPartnerLeft(false); setWon(null);
      prevOpponentScoreRef.current = 0;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        pcRef.current = pc;
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
        pc.onicecandidate = e => { if (e.candidate) socket.emit("webrtc-ice", { candidate: e.candidate }); };
        pc.ontrack = e => { if (remoteVideoRef.current && e.streams[0]) remoteVideoRef.current.srcObject = e.streams[0]; };

        if (data.role === "caller") {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("webrtc-offer", { offer });
        }
        startRatingLoop();
      } catch (err) {
        console.error("Camera error:", err);
        setGameState("error");
        setErrorMessage("Camera permission denied or camera not found. You must allow camera access to play.");
      }
    });

    socket.on("webrtc-offer", async (data: { offer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current; if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { answer });
    });

    socket.on("webrtc-answer", async (data: { answer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current; if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on("webrtc-ice", async (data: { candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current; if (!pc) return;
      try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) { console.error(e); }
    });

    socket.on("score-update", (data: { myScore: number; opponentScore: number; myFeedback: string }) => {
      setMyScore(data.myScore);
      setOpponentScore(prev => {
        const delta = data.opponentScore - prevOpponentScoreRef.current;
        prevOpponentScoreRef.current = data.opponentScore;
        if (delta > 0 && delta <= 10) setOpponentLastRoundScore(delta);
        return data.opponentScore;
      });
      if (data.myFeedback) setMyFeedback(data.myFeedback);
      setCountdown(5);
    });

    socket.on("game-over", (data: { won: boolean; finalScores: { myScore: number; opponentScore: number } }) => {
      setGameState("game-over");
      setWon(data.won);
      setMyScore(data.finalScores.myScore);
      setOpponentScore(data.finalScores.opponentScore);
      if (ratingIntervalRef.current) clearInterval(ratingIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    });

    socket.on("partner-left", () => {
      setPartnerLeft(true);
      setGameState("game-over");
      if (ratingIntervalRef.current) clearInterval(ratingIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    });

    return () => cleanup();
  }, [cleanup]);

  const triggerBurst = () => {
    setScanBurst(true);
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => setScanBurst(false), 1500);
  };

  const startRatingLoop = () => {
    if (ratingIntervalRef.current) clearInterval(ratingIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(5);

    countdownIntervalRef.current = setInterval(() => {
      setCountdown(c => (c > 1 ? c - 1 : 5));
    }, 1000);

    ratingIntervalRef.current = setInterval(async () => {
      if (!localVideoRef.current || !canvasRef.current || !socketRef.current) return;
      const video = localVideoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Data = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

      triggerBurst();

      try {
        const result = await rateFrameMutateRef.current({ data: { imageData: base64Data } });
        setLastRoundScore(result.score);
        setScoreHistory(prev => [...prev, { score: result.score, feedback: result.feedback }]);
        socketRef.current.emit("score-update", { score: result.score, feedback: result.feedback });
      } catch (err) {
        console.error("Failed to rate frame", err);
      }
    }, 5000);
  };

  if (gameState === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <CameraOff className="w-24 h-24 text-destructive mx-auto" />
          <h1 className="text-4xl font-display text-destructive uppercase">Camera Required</h1>
          <p className="text-muted-foreground font-mono">{errorMessage}</p>
          <Link href="/" className="inline-block bg-primary text-primary-foreground px-8 py-3 font-display uppercase tracking-widest text-xl">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  if (gameState === "queue") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="relative">
          <div className="w-32 h-32 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-3xl text-primary animate-pulse">VS</span>
          </div>
        </div>
        <h2 className="mt-8 text-3xl font-display uppercase tracking-widest text-foreground">Awaiting Challenger</h2>
        <Link href="/" className="mt-8 text-muted-foreground hover:text-destructive font-mono uppercase text-sm border-b border-transparent hover:border-destructive transition-colors pb-1">
          Back Out
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden relative">
      <canvas ref={canvasRef} className="hidden" />

      {/* Scores */}
      <header className="absolute top-0 left-0 right-0 z-20 bg-background/90 border-b border-border backdrop-blur p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex-1 flex flex-col">
            <span className="text-primary font-display text-xl uppercase tracking-wider">You</span>
            <div className="text-5xl md:text-7xl font-display leading-none text-foreground">{myScore}</div>
            <TierBadge score={lastRoundScore} />
            <div className="w-full bg-secondary h-2 mt-2 relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 bg-primary transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, (myScore / targetScore) * 100)}%` }} />
            </div>
          </div>

          <div className="flex-shrink-0 px-8 text-center flex flex-col items-center">
            <span className="text-muted-foreground font-mono text-xs uppercase mb-1">Target</span>
            <div className="text-3xl font-display text-muted-foreground">{targetScore}</div>
            <div className="mt-2 w-12 h-12 rounded-full border-2 border-primary flex items-center justify-center text-primary font-display text-2xl relative">
              {countdown}
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="22" cy="22" r="22" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
                <circle cx="22" cy="22" r="22" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeDasharray="138" strokeDashoffset={138 - (138 * countdown) / 5}
                  className="transition-all duration-1000 linear" />
              </svg>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-end">
            <span className="text-destructive font-display text-xl uppercase tracking-wider">Opponent</span>
            <div className="text-5xl md:text-7xl font-display leading-none text-foreground">{opponentScore}</div>
            <div className="flex justify-end">
              <TierBadge score={opponentLastRoundScore} />
            </div>
            <div className="w-full bg-secondary h-2 mt-2 relative overflow-hidden flex justify-end">
              <div className="absolute top-0 right-0 bottom-0 bg-destructive transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, (opponentScore / targetScore) * 100)}%` }} />
            </div>
          </div>
        </div>
      </header>

      {/* Videos */}
      <div className="flex-1 flex flex-col md:flex-row relative pt-32 pb-4">
        <div className="flex-1 relative border-r border-border md:border-r-4 md:border-background overflow-hidden">
          <video ref={localVideoRef} autoPlay playsInline muted
            className="w-full h-full object-cover grayscale-[0.2] contrast-125" />
          <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] pointer-events-none" />
          {gameState === "matched" && <PhysiqueScanOverlay burst={scanBurst} />}
          {myFeedback && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-6 py-3 font-mono text-sm sm:text-base border-2 border-background font-bold tracking-tight uppercase max-w-[90%] text-center animate-in fade-in slide-in-from-bottom-4 duration-300 z-20">
              AI: {myFeedback}
            </div>
          )}
        </div>
        <div className="flex-1 relative">
          <video ref={remoteVideoRef} autoPlay playsInline
            className="w-full h-full object-cover grayscale-[0.2] contrast-125" />
          <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] pointer-events-none" />
        </div>
      </div>

      {/* Game Over Overlay */}
      {gameState === "game-over" && (
        <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in duration-500 overflow-y-auto">
          <div className="max-w-xl w-full bg-card border border-border p-8 text-center shadow-2xl">
            {partnerLeft ? (
              <>
                <AlertTriangle className="w-16 h-16 text-primary mx-auto mb-4" />
                <h2 className="text-5xl font-display uppercase text-foreground mb-2">Rage Quit</h2>
                <p className="text-muted-foreground font-mono mb-6">Opponent disconnected from the arena.</p>
              </>
            ) : (
              <>
                {won
                  ? <Trophy className="w-16 h-16 text-primary mx-auto mb-4" />
                  : <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center text-4xl font-display text-destructive border-4 border-destructive rounded-full">X</div>
                }
                <h2 className={`text-6xl font-display uppercase mb-2 ${won ? 'text-primary' : 'text-destructive'}`}>
                  {won ? 'Victory' : 'Defeat'}
                </h2>
                <div className="flex items-center justify-center gap-6 font-display text-4xl mb-1">
                  <div className="text-primary">{myScore}</div>
                  <div className="text-muted-foreground text-2xl">-</div>
                  <div className="text-destructive">{opponentScore}</div>
                </div>
                <p className="font-mono text-xs text-muted-foreground mb-4">
                  {won ? "ELO gained! Check the leaderboard." : "ELO adjusted. Come back stronger."}
                </p>
                <ScoreBreakdown history={scoreHistory} />
              </>
            )}
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => { cleanup(); onRematch(); }}
                className="bg-primary text-primary-foreground px-8 py-4 font-display text-2xl uppercase tracking-widest hover:bg-primary/90 transition-colors"
              >
                Rematch
              </button>
              <Link href="/leaderboard" className="inline-block border border-primary text-primary px-6 py-4 font-display text-xl uppercase tracking-widest hover:bg-primary/10 transition-colors">
                Rankings
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Game() {
  const [sessionKey, setSessionKey] = useState(0);
  return <GameArena key={sessionKey} onRematch={() => setSessionKey(k => k + 1)} />;
}
