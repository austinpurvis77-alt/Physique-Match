import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { Link } from "wouter";
import { useRateFrame } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { CameraOff, AlertTriangle, Trophy, Zap } from "lucide-react";

type GameState = "idle" | "queue" | "matched" | "game-over" | "error";

interface WarmupTarget {
  id: number;
  x: number;
  label: string;
  points: number;
  size: number;
  speed: number;
  startY: number;
  createdAt: number;
}

const WARMUP_LABELS = ["FLEX", "GAINS", "MOG", "PUMP", "REP", "MAX"];

let targetIdCounter = 0;

function makeTarget(): WarmupTarget {
  const labels = WARMUP_LABELS;
  return {
    id: targetIdCounter++,
    x: 8 + Math.random() * 84, // 8–92% from left
    label: labels[Math.floor(Math.random() * labels.length)]!,
    points: Math.random() < 0.15 ? 3 : 1,
    size: 54 + Math.random() * 24,
    speed: 6 + Math.random() * 5, // seconds to cross the screen
    startY: 90,
    createdAt: Date.now(),
  };
}

// Floating target button
function Target({
  target,
  elapsed,
  onClick,
}: {
  target: WarmupTarget;
  elapsed: number;
  onClick: () => void;
}) {
  const progress = elapsed / (target.speed * 1000); // 0→1
  const y = target.startY - progress * 110; // moves up past top
  const opacity = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1;

  if (y < -15) return null;

  const isBonus = target.points > 1;

  return (
    <button
      onClick={onClick}
      style={{
        position: "absolute",
        left: `${target.x}%`,
        top: `${y}%`,
        width: target.size,
        height: target.size,
        opacity,
        transform: "translate(-50%, -50%)",
        transition: "transform 0.05s",
        cursor: "pointer",
        zIndex: 10,
        border: "none",
        background: "transparent",
        padding: 0,
      }}
      className="group"
    >
      <div
        className={`w-full h-full rounded-full flex flex-col items-center justify-center font-display text-xs leading-none border-2 transition-transform duration-100 group-active:scale-90 select-none ${
          isBonus
            ? "bg-yellow-400/20 border-yellow-400 text-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]"
            : "bg-primary/20 border-primary text-primary shadow-[0_0_16px_rgba(139,92,246,0.4)]"
        }`}
      >
        <span className="text-[10px] tracking-widest uppercase">{target.label}</span>
        <span className="text-sm font-display">{isBonus ? "×3" : "+1"}</span>
      </div>
    </button>
  );
}

// Queue / warmup screen
function WarmupScreen({
  localVideoRef,
  onBack,
}: {
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  onBack: () => void;
}) {
  const [targets, setTargets] = useState<WarmupTarget[]>([]);
  const [warmupScore, setWarmupScore] = useState(0);
  const [tick, setTick] = useState(0);
  const [pops, setPops] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const popIdRef = useRef(0);
  const scoreRef = useRef(0);

  // Tick every 50ms to update target positions
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 50);
    return () => clearInterval(t);
  }, []);

  // Spawn new targets
  useEffect(() => {
    const spawnInterval = setInterval(() => {
      setTargets(prev => {
        const now = Date.now();
        // Remove expired
        const alive = prev.filter(t => now - t.createdAt < t.speed * 1000 + 200);
        if (alive.length >= 6) return alive;
        return [...alive, makeTarget()];
      });
    }, 1000);
    return () => clearInterval(spawnInterval);
  }, []);

  const handleHit = useCallback((target: WarmupTarget, e: React.MouseEvent) => {
    e.stopPropagation();
    scoreRef.current += target.points;
    setWarmupScore(scoreRef.current);
    setTargets(prev => prev.filter(t => t.id !== target.id));

    // Show pop text
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const parentRect = (e.currentTarget as HTMLElement).closest(".warmup-area")?.getBoundingClientRect();
    const px = parentRect ? ((rect.left + rect.width / 2 - parentRect.left) / parentRect.width) * 100 : 50;
    const py = parentRect ? ((rect.top + rect.height / 2 - parentRect.top) / parentRect.height) * 100 : 50;

    const popId = popIdRef.current++;
    setPops(prev => [...prev, { id: popId, x: px, y: py, text: target.points > 1 ? "×3 BONUS!" : "+1" }]);
    setTimeout(() => setPops(prev => prev.filter(p => p.id !== popId)), 700);
  }, []);

  const now = Date.now();

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden scanlines">
      {/* Camera feed — full screen */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover grayscale-[0.3] contrast-110"
        style={{ filter: "grayscale(0.25) contrast(1.15) brightness(0.7)" }}
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Scan lines / vignette */}
      <div className="absolute inset-0 vignette pointer-events-none z-5" />

      {/* Mini game area — captures clicks on targets */}
      <div className="warmup-area absolute inset-0" style={{ zIndex: 6 }}>
        {targets.map(target => (
          <Target
            key={target.id}
            target={target}
            elapsed={now - target.createdAt}
            onClick={(e: React.MouseEvent) => handleHit(target, e)}
          />
        ))}

        {/* Score pops */}
        {pops.map(pop => (
          <div
            key={pop.id}
            className="absolute pointer-events-none font-display text-lg text-primary animate-pop"
            style={{ left: `${pop.x}%`, top: `${pop.y}%`, transform: "translate(-50%,-50%)", zIndex: 20 }}
          >
            {pop.text}
          </div>
        ))}
      </div>

      {/* HUD */}
      <div className="relative z-20 flex flex-col min-h-screen pointer-events-none">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          {/* Warm-up score */}
          <div className="flex items-center gap-2 bg-black/60 border border-primary/40 px-4 py-2 backdrop-blur-sm">
            <Zap className="w-4 h-4 text-primary" />
            <span className="font-display text-2xl text-primary leading-none">{warmupScore}</span>
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest ml-1">Warm-up pts</span>
          </div>

          {/* Back button — re-enable pointer events */}
          <div className="pointer-events-auto">
            <button
              onClick={onBack}
              className="font-mono text-xs text-muted-foreground hover:text-destructive uppercase tracking-widest border-b border-transparent hover:border-destructive transition-colors pb-0.5"
            >
              Back Out
            </button>
          </div>
        </div>

        {/* Center status */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 pb-24 text-center px-4">
          {/* Pulsing VS spinner */}
          <div className="relative">
            <div className="w-24 h-24 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-display text-3xl text-primary">VS</span>
            </div>
          </div>

          <h2 className="font-[family-name:--app-font-display] text-4xl md:text-5xl text-white tracking-widest uppercase">
            Awaiting Challenger
          </h2>
          <p className="font-mono text-sm text-muted-foreground uppercase tracking-widest animate-pulse">
            Hit the targets to warm up while you wait
          </p>
        </div>

        {/* Bottom tip */}
        <div className="pb-8 text-center">
          <p className="font-mono text-xs text-muted-foreground/50 uppercase tracking-wider">
            Tap the floating targets to score warm-up points
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Game() {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [targetScore, setTargetScore] = useState(50);
  const [myFeedback, setMyFeedback] = useState<string | null>(null);
  const [won, setWon] = useState<boolean | null>(null);
  const [partnerLeft, setPartnerLeft] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const ratingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const rateFrame = useRateFrame();
  const rateFrameMutateRef = useRef(rateFrame.mutateAsync);
  rateFrameMutateRef.current = rateFrame.mutateAsync;

  const { user } = useAuth();
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  // Start camera as soon as we enter the queue
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch {
      setGameState("error");
      setErrorMessage("Camera permission denied or camera not found. You must allow camera access to play.");
    }
  }, []);

  const stopRating = useCallback(() => {
    if (ratingIntervalRef.current) clearInterval(ratingIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  }, []);

  const cleanup = useCallback(() => {
    stopRating();
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, [stopRating]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  useEffect(() => {
    setGameState("queue");
    // Start camera immediately so user sees themselves while queuing
    startCamera();

    const socket = io({ path: "/api/socket.io", transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (userIdRef.current) {
        socket.emit("identify", { userId: userIdRef.current });
      }
      socket.emit("join-queue");
    });

    socket.on("matched", async (data: { roomId: string; role: "caller" | "receiver"; targetScore: number }) => {
      setGameState("matched");
      setTargetScore(data.targetScore);
      setMyScore(0);
      setOpponentScore(0);
      setPartnerLeft(false);
      setWon(null);

      // Camera is already running — just attach stream to game video element
      const stream = localStreamRef.current;
      if (!stream) {
        // Fallback: try to get camera if something went wrong
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          localStreamRef.current = s;
          if (localVideoRef.current) localVideoRef.current.srcObject = s;
        } catch {
          setGameState("error");
          setErrorMessage("Camera permission denied.");
          return;
        }
      } else if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Setup WebRTC
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;

      (localStreamRef.current!).getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));

      pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit("webrtc-ice", { candidate: event.candidate });
      };

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      if (data.role === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc-offer", { offer });
      }

      startRatingLoop();
    });

    socket.on("webrtc-offer", async (data: { offer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { answer });
    });

    socket.on("webrtc-answer", async (data: { answer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on("webrtc-ice", async (data: { candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error("ICE candidate error", e);
      }
    });

    socket.on("score-update", (data: { myScore: number; opponentScore: number; targetScore: number; myFeedback: string }) => {
      setMyScore(data.myScore);
      setOpponentScore(data.opponentScore);
      if (data.myFeedback) setMyFeedback(data.myFeedback);
      setCountdown(5);
    });

    socket.on("game-over", (data: { won: boolean; finalScores: { myScore: number; opponentScore: number } }) => {
      setGameState("game-over");
      setWon(data.won);
      setMyScore(data.finalScores.myScore);
      setOpponentScore(data.finalScores.opponentScore);
      stopRating();
    });

    socket.on("partner-left", () => {
      setPartnerLeft(true);
      setGameState("game-over");
      stopRating();
    });

    return () => cleanup();
  }, [cleanup, startCamera, stopRating]);

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
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
      const base64Data = dataUrl.split(",")[1];
      try {
        const result = await rateFrameMutateRef.current({ data: { imageData: base64Data } });
        socketRef.current?.emit("score-update", { score: result.score, feedback: result.feedback });
      } catch {
        // silent
      }
    }, 5000);
  };

  // ─── Error ────────────────────────────────────────────────
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

  // ─── Queue / Warmup ───────────────────────────────────────
  if (gameState === "queue") {
    return (
      <>
        <canvas ref={canvasRef} className="hidden" />
        <WarmupScreen
          localVideoRef={localVideoRef}
          onBack={() => {
            cleanup();
            window.location.href = "/";
          }}
        />
      </>
    );
  }

  // ─── Active Game ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden relative">
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Bar - Scores */}
      <header className="absolute top-0 left-0 right-0 z-20 bg-background/90 border-b border-border backdrop-blur p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex-1 flex flex-col">
            <span className="text-primary font-display text-xl uppercase tracking-wider">You</span>
            <div className="text-5xl md:text-7xl font-display leading-none text-foreground">{myScore}</div>
            <div className="w-full bg-secondary h-2 mt-2 relative overflow-hidden">
              <div
                className="absolute top-0 left-0 bottom-0 bg-primary transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, (myScore / targetScore) * 100)}%` }}
              />
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
            <div className="w-full bg-secondary h-2 mt-2 relative overflow-hidden flex justify-end">
              <div
                className="absolute top-0 right-0 bottom-0 bg-destructive transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, (opponentScore / targetScore) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Videos */}
      <div className="flex-1 flex flex-col md:flex-row relative pt-32 pb-4">
        <div className="flex-1 relative border-r border-border md:border-r-4 md:border-background">
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover grayscale-[0.2] contrast-125" />
          <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] pointer-events-none" />
          {myFeedback && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-6 py-3 font-mono text-sm sm:text-base border-2 border-background font-bold tracking-tight uppercase max-w-[90%] text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
              AI: {myFeedback}
            </div>
          )}
        </div>
        <div className="flex-1 relative">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover grayscale-[0.2] contrast-125" />
          <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] pointer-events-none" />
        </div>
      </div>

      {/* Game Over Overlay */}
      {gameState === "game-over" && (
        <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in duration-500">
          <div className="max-w-xl w-full bg-card border border-border p-8 text-center shadow-2xl relative overflow-hidden">
            {partnerLeft ? (
              <>
                <AlertTriangle className="w-16 h-16 text-primary mx-auto mb-6" />
                <h2 className="text-5xl font-display uppercase text-foreground mb-4">Rage Quit</h2>
                <p className="text-muted-foreground font-mono mb-8">Opponent disconnected from the arena.</p>
              </>
            ) : (
              <>
                {won
                  ? <Trophy className="w-16 h-16 text-primary mx-auto mb-6" />
                  : <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center text-4xl font-display text-destructive border-4 border-destructive rounded-full">X</div>
                }
                <h2 className={`text-6xl font-display uppercase mb-2 ${won ? "text-primary" : "text-destructive"}`}>
                  {won ? "Victory" : "Defeat"}
                </h2>
                <div className="flex items-center justify-center gap-6 font-display text-4xl mb-4">
                  <div className="text-primary">{myScore}</div>
                  <div className="text-muted-foreground text-2xl">-</div>
                  <div className="text-destructive">{opponentScore}</div>
                </div>
                <p className="font-mono text-xs text-muted-foreground mb-8">
                  {won ? "ELO gained! Check the leaderboard." : "ELO adjusted. Come back stronger."}
                </p>
              </>
            )}
            <div className="flex items-center justify-center gap-4">
              <Link href="/game" className="inline-block bg-primary text-primary-foreground px-8 py-4 font-display text-2xl uppercase tracking-widest hover:bg-primary/90 transition-colors">
                Rematch
              </Link>
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
