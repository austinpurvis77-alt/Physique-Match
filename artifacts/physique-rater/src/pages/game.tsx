import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { Link } from "wouter";
import { useRateFrame } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Loader2, CameraOff, AlertTriangle, Trophy } from "lucide-react";

type GameState = "idle" | "queue" | "matched" | "game-over" | "error";

export default function Game() {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [role, setRole] = useState<"caller" | "receiver" | null>(null);
  
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

  const cleanup = useCallback(() => {
    if (ratingIntervalRef.current) clearInterval(ratingIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
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
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  useEffect(() => {
    setGameState("queue");
    
    // 1. Connect Socket
    const socket = io({ path: "/api/socket.io", transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      // Identify user so ELO can be attributed
      if (userIdRef.current) {
        socket.emit("identify", { userId: userIdRef.current });
      }
      socket.emit("join-queue");
    });

    socket.on("matched", async (data: { roomId: string; role: "caller" | "receiver"; targetScore: number }) => {
      setGameState("matched");
      setRole(data.role);
      setTargetScore(data.targetScore);
      setMyScore(0);
      setOpponentScore(0);
      setPartnerLeft(false);
      setWon(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Setup WebRTC
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });
        pcRef.current = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("webrtc-ice", { candidate: event.candidate });
          }
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

        // Start interval
        startRatingLoop();

      } catch (err) {
        console.error("Camera error:", err);
        setGameState("error");
        setErrorMessage("Camera permission denied or camera not found. You must allow camera access to play.");
      }
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
        console.error("Error adding ice candidate", e);
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
      const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
      const base64Data = dataUrl.split(",")[1];

      try {
        const result = await rateFrameMutateRef.current({ data: { imageData: base64Data } });
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
          <video 
            ref={localVideoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover grayscale-[0.2] contrast-125"
          />
          <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] pointer-events-none" />
          
          {myFeedback && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-6 py-3 font-mono text-sm sm:text-base border-2 border-background font-bold tracking-tight uppercase max-w-[90%] text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
              AI: {myFeedback}
            </div>
          )}
        </div>
        
        <div className="flex-1 relative">
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover grayscale-[0.2] contrast-125"
          />
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
                {won ? <Trophy className="w-16 h-16 text-primary mx-auto mb-6" /> : <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center text-4xl font-display text-destructive border-4 border-destructive rounded-full">X</div>}
                <h2 className={`text-6xl font-display uppercase mb-2 ${won ? 'text-primary' : 'text-destructive'}`}>
                  {won ? 'Victory' : 'Defeat'}
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
