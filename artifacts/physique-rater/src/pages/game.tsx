import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { Link } from "wouter";
import { useRateFrame } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { CameraOff, AlertTriangle, Trophy } from "lucide-react";
import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";

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

const POSE_CONNECTIONS: [number, number][] = [
  [5, 6],
  [5, 7], [7, 9],
  [6, 8], [8, 10],
  [5, 11], [6, 12],
  [11, 12],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [0, 1], [0, 2],
  [1, 3], [2, 4],
];

function PoseScanOverlay({
  videoRef,
  burst,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  burst: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      try {
        const { setBackend, ready } = await import("@tensorflow/tfjs-core");
        await setBackend("webgl");
        await ready();

        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          }
        );
        if (!mountedRef.current) { detector.dispose(); return; }
        detectorRef.current = detector;
        drawLoop();
      } catch (err) {
        console.error("Pose detection init failed:", err);
        drawFallbackLoop();
      }
    }

    function drawFallbackLoop() {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || !mountedRef.current) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      rafRef.current = requestAnimationFrame(drawFallbackLoop);
    }

    function drawLoop() {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const detector = detectorRef.current;

      if (!canvas || !video || !detector || !mountedRef.current) return;
      if (video.readyState < 2 || video.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(drawLoop);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      detector.estimatePoses(video, { flipHorizontal: false })
        .then((poses) => {
          if (!mountedRef.current || !canvas) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (poses.length === 0) {
            rafRef.current = requestAnimationFrame(drawLoop);
            return;
          }

          const kp = poses[0].keypoints;
          const MIN_SCORE = 0.3;

          const dotColor = burst ? "#ffffff" : "#00ff88";
          const edgeColor = burst ? "rgba(255,255,255,0.8)" : "rgba(0,255,136,0.6)";
          const glowColor = burst ? "rgba(255,255,255,0.9)" : "rgba(0,255,136,0.9)";

          ctx.save();
          ctx.shadowBlur = burst ? 18 : 10;
          ctx.shadowColor = glowColor;
          ctx.lineWidth = burst ? 2.5 : 1.5;
          ctx.strokeStyle = edgeColor;

          for (const [a, b] of POSE_CONNECTIONS) {
            const kpA = kp[a];
            const kpB = kp[b];
            if (
              kpA && kpB &&
              (kpA.score ?? 0) >= MIN_SCORE &&
              (kpB.score ?? 0) >= MIN_SCORE
            ) {
              ctx.beginPath();
              ctx.moveTo(kpA.x, kpA.y);
              ctx.lineTo(kpB.x, kpB.y);
              ctx.stroke();
            }
          }

          ctx.shadowBlur = burst ? 24 : 14;
          ctx.shadowColor = glowColor;
          ctx.fillStyle = dotColor;

          for (const point of kp) {
            if ((point.score ?? 0) >= MIN_SCORE) {
              ctx.beginPath();
              ctx.arc(point.x, point.y, burst ? 7 : 5, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          ctx.restore();
          rafRef.current = requestAnimationFrame(drawLoop);
        })
        .catch(() => {
          rafRef.current = requestAnimationFrame(drawLoop);
        });
    }

    init();

    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (detectorRef.current) { detectorRef.current.dispose(); detectorRef.current = null; }
    };
  }, [videoRef]);

  return (
    <>
      <style>{`
        @keyframes scan-sweep {
          0%   { top: 0; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes scan-label-blink {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 1; }
        }
        @keyframes corner-pulse {
          0%, 100% { opacity: 0.7; }
          50%       { opacity: 1; }
        }
        .scan-sweep-bar {
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent 0%, rgba(0,255,136,0.6) 40%, rgba(170,255,221,1) 50%, rgba(0,255,136,0.6) 60%, transparent 100%);
          animation: scan-sweep 3s ease-in-out infinite;
          pointer-events: none;
        }
        .corner-tl, .corner-tr, .corner-bl, .corner-br {
          position: absolute;
          width: 18px;
          height: 18px;
          animation: corner-pulse 2s ease-in-out infinite;
          pointer-events: none;
        }
        .corner-tl { top: 8px; left: 8px; border-top: 2px solid #00ff88; border-left: 2px solid #00ff88; }
        .corner-tr { top: 8px; right: 8px; border-top: 2px solid #00ff88; border-right: 2px solid #00ff88; }
        .corner-bl { bottom: 8px; left: 8px; border-bottom: 2px solid #00ff88; border-left: 2px solid #00ff88; }
        .corner-br { bottom: 8px; right: 8px; border-bottom: 2px solid #00ff88; border-right: 2px solid #00ff88; }
        .scan-label {
          position: absolute;
          bottom: 4px;
          left: 50%;
          transform: translateX(-50%);
          font-family: monospace;
          font-size: 10px;
          color: #00ff88;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          animation: scan-label-blink 1s ease-in-out infinite;
          pointer-events: none;
          text-shadow: 0 0 8px #00ff8899;
        }
      `}</style>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ mixBlendMode: "screen" }}
      />
      {!burst && <div className="scan-sweep-bar" />}
      <div className="corner-tl" />
      <div className="corner-tr" />
      <div className="corner-bl" />
      <div className="corner-br" />
      <div className="scan-label">{burst ? "ANALYZING..." : "SCANNING"}</div>
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
  const [cameraReady, setCameraReady] = useState(false);

  const prevOpponentScoreRef = useRef(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
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
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.onloadedmetadata = () => setCameraReady(true);
        }
        setCameraReady(true);
      } catch (err) {
        console.error("Camera error:", err);
        setGameState("error");
        setErrorMessage("Camera permission denied or camera not found. You must allow camera access to play.");
        return;
      }
    }

    startCamera().then(() => {
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
          const stream = localStreamRef.current;
          if (!stream) throw new Error("No camera stream");

          const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
          pcRef.current = pc;
          stream.getTracks().forEach(t => pc.addTrack(t, stream));
          pc.onicecandidate = e => { if (e.candidate) socket.emit("webrtc-ice", { candidate: e.candidate }); };
          pc.ontrack = e => {
            if (remoteVideoRef.current && e.streams[0]) {
              remoteVideoRef.current.srcObject = e.streams[0];
              remoteVideoRef.current.play().catch(console.error);
            }
          };

          if (data.role === "caller") {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("webrtc-offer", { offer });
          }
          startRatingLoop();
        } catch (err) {
          console.error("WebRTC error:", err);
          setGameState("error");
          setErrorMessage("Failed to set up connection. Please try again.");
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
    });
  }, []);

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
      if (!localVideoRef.current || !captureCanvasRef.current || !socketRef.current) return;
      const video = localVideoRef.current;
      const canvas = captureCanvasRef.current;
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

  if (gameState === "idle") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (gameState === "queue") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-8">
        <div className="relative w-64 h-48 md:w-96 md:h-72 overflow-hidden border border-border">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover grayscale-[0.2] contrast-125"
          />
          {cameraReady && (
            <PoseScanOverlay videoRef={localVideoRef} burst={false} />
          )}
          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <span className="font-mono text-xs text-primary animate-pulse">Initializing camera...</span>
            </div>
          )}
        </div>
        <div className="relative">
          <div className="w-32 h-32 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-3xl text-primary animate-pulse">VS</span>
          </div>
        </div>
        <h2 className="text-3xl font-display uppercase tracking-widest text-foreground">Awaiting Challenger</h2>
        <Link href="/" className="text-muted-foreground hover:text-destructive font-mono uppercase text-sm border-b border-transparent hover:border-destructive transition-colors pb-1">
          Back Out
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden relative">
      <canvas ref={captureCanvasRef} className="hidden" />

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
          {gameState === "matched" && cameraReady && (
            <PoseScanOverlay videoRef={localVideoRef} burst={scanBurst} />
          )}
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
          {!remoteVideoRef.current?.srcObject && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-xs text-muted-foreground animate-pulse uppercase tracking-widest">Connecting opponent...</span>
            </div>
          )}
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
              <Link href="/" className="border border-border px-8 py-4 font-display text-2xl uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
                Exit
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Game() {
  const [key, setKey] = useState(0);
  return <GameArena key={key} onRematch={() => setKey(k => k + 1)} />;
}
