import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { Link, useSearch } from "wouter";
import { useRateFrame } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { CameraOff, AlertTriangle, Trophy, Mic, MicOff, Copy, Check, Users2, BarChart2, X } from "lucide-react";
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

type Breakdown = { muscleDef?: number; leanness?: number; vascularity?: number; vTaper?: number; posture?: number };

const BD_METRICS: { key: keyof Breakdown; label: string }[] = [
  { key: "muscleDef",  label: "Muscle Def" },
  { key: "leanness",  label: "Leanness"   },
  { key: "vascularity", label: "Vascularity" },
  { key: "vTaper",    label: "V-Taper"    },
  { key: "posture",   label: "Posture"    },
];

function RadarChart({ breakdown }: { breakdown: Breakdown }) {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 52;
  const n = BD_METRICS.length;

  const angleOf = (i: number) => (i * 2 * Math.PI / n) - Math.PI / 2;

  const pts = BD_METRICS.map((m, i) => {
    const val = breakdown[m.key] ?? 5;
    const r = (val / 10) * maxR;
    const a = angleOf(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), val, label: m.label };
  });

  const outerPts = BD_METRICS.map((_, i) => {
    const a = angleOf(i);
    return { x: cx + maxR * Math.cos(a), y: cy + maxR * Math.sin(a) };
  });

  const labelPts = BD_METRICS.map((m, i) => {
    const a = angleOf(i);
    const lr = maxR + 22;
    return { x: cx + lr * Math.cos(a), y: cy + lr * Math.sin(a), label: m.label, val: breakdown[m.key] ?? "?" };
  });

  const gridRings = [2, 4, 6, 8, 10].map(v => {
    const r = (v / 10) * maxR;
    return BD_METRICS.map((_, i) => {
      const a = angleOf(i);
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(" ");
  });

  const fillPoints = pts.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <svg width={size} height={size} className="overflow-visible">
      {gridRings.map((ringPts, i) => (
        <polygon key={i} points={ringPts} fill="none" stroke="rgba(0,255,136,0.08)" strokeWidth="1" />
      ))}
      {outerPts.map((op, i) => (
        <line key={i} x1={cx} y1={cy} x2={op.x} y2={op.y} stroke="rgba(0,255,136,0.12)" strokeWidth="1" />
      ))}
      <polygon points={fillPoints} fill="rgba(0,255,136,0.12)" stroke="#00ff88" strokeWidth="1.5" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#00ff88" />
      ))}
      {labelPts.map((lp, i) => (
        <g key={i}>
          <text x={lp.x} y={lp.y - 5} textAnchor="middle" fill="rgba(0,255,136,0.55)" style={{ fontSize: 7, fontFamily: "monospace" }}>
            {lp.label}
          </text>
          <text x={lp.x} y={lp.y + 6} textAnchor="middle" fill="#00ff88" style={{ fontSize: 9, fontFamily: "monospace", fontWeight: "bold" }}>
            {lp.val}
          </text>
        </g>
      ))}
    </svg>
  );
}

function MetricBar({ label, value }: { label: string; value?: number }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-secondary/50 relative overflow-hidden">
        <div className="absolute top-0 left-0 bottom-0 bg-primary transition-all duration-700"
          style={{ width: `${(v / 10) * 100}%` }} />
      </div>
      <span className="font-mono text-xs text-primary w-4 text-right">{value ?? "—"}</span>
    </div>
  );
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

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function fmtHex(n: number) {
  return n.toString(16).toUpperCase().padStart(4, "0");
}

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
  const startTimeRef = useRef(performance.now());
  const scanLinesRef = useRef([
    { speed: 0.22, phase: 0.0, opacity: 0.9, thickness: 3 },
    { speed: 0.13, phase: 0.4, opacity: 0.4, thickness: 1 },
    { speed: 0.33, phase: 0.7, opacity: 0.6, thickness: 2 },
  ]);
  const dataReadoutsRef = useRef<{ label: string; value: string; x: number; y: number }[]>([]);
  const lastDataUpdateRef = useRef(0);
  const pulsePhaseRef = useRef(0);
  const burstRef = useRef(burst);
  burstRef.current = burst;

  useEffect(() => {
    mountedRef.current = true;
    startTimeRef.current = performance.now();

    async function init() {
      try {
        const { setBackend, ready } = await import("@tensorflow/tfjs-core");
        await setBackend("webgl");
        await ready();
        const detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
        );
        if (!mountedRef.current) { detector.dispose(); return; }
        detectorRef.current = detector;
        drawLoop();
      } catch {
        drawFallback();
      }
    }

    function drawFallback() {
      if (!mountedRef.current) return;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawHUD(ctx, canvas.width, canvas.height, [], false);
      }
      rafRef.current = requestAnimationFrame(drawFallback);
    }

    function drawHUD(
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      kp: poseDetection.Keypoint[],
      hasBody: boolean
    ) {
      const now = performance.now();
      const t = (now - startTimeRef.current) / 1000;
      const isBurst = burstRef.current;
      const PRIMARY = isBurst ? "#ffffff" : "#00ff88";
      const DIM = isBurst ? "rgba(255,255,255,0.4)" : "rgba(0,255,136,0.35)";
      const GLOW = isBurst ? "rgba(255,255,255,0.9)" : "rgba(0,255,136,0.8)";

      ctx.clearRect(0, 0, w, h);

      // === Scan lines ===
      for (const sl of scanLinesRef.current) {
        const y = ((t * sl.speed + sl.phase) % 1) * h;
        const gradient = ctx.createLinearGradient(0, y - 40, 0, y + 40);
        gradient.addColorStop(0, "transparent");
        gradient.addColorStop(0.3, isBurst ? `rgba(255,255,255,${sl.opacity * 0.3})` : `rgba(0,255,136,${sl.opacity * 0.3})`);
        gradient.addColorStop(0.5, isBurst ? `rgba(255,255,255,${sl.opacity})` : `rgba(0,255,136,${sl.opacity})`);
        gradient.addColorStop(0.7, isBurst ? `rgba(255,255,255,${sl.opacity * 0.3})` : `rgba(0,255,136,${sl.opacity * 0.3})`);
        gradient.addColorStop(1, "transparent");
        ctx.save();
        ctx.shadowBlur = isBurst ? 20 : 12;
        ctx.shadowColor = GLOW;
        ctx.fillStyle = gradient;
        ctx.fillRect(0, y - 40, w, 80);
        ctx.restore();

        // Bright center line
        ctx.save();
        ctx.shadowBlur = isBurst ? 15 : 8;
        ctx.shadowColor = GLOW;
        ctx.strokeStyle = isBurst ? `rgba(255,255,255,${sl.opacity})` : `rgba(0,255,136,${sl.opacity})`;
        ctx.lineWidth = sl.thickness;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.restore();
      }

      // === Corner brackets (large) ===
      const cornerSize = Math.min(w, h) * 0.08;
      const cornerWidth = 2.5;
      const pulse = 0.7 + 0.3 * Math.sin(t * 3);
      const corners = [
        { x: 0, y: 0, dx: 1, dy: 1 },
        { x: w, y: 0, dx: -1, dy: 1 },
        { x: 0, y: h, dx: 1, dy: -1 },
        { x: w, y: h, dx: -1, dy: -1 },
      ];
      for (const c of corners) {
        ctx.save();
        ctx.strokeStyle = PRIMARY;
        ctx.lineWidth = cornerWidth;
        ctx.shadowBlur = isBurst ? 20 : 12;
        ctx.shadowColor = GLOW;
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.moveTo(c.x + c.dx * cornerSize, c.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(c.x, c.y + c.dy * cornerSize);
        ctx.stroke();
        ctx.restore();

        // Inner tick
        ctx.save();
        ctx.strokeStyle = DIM;
        ctx.lineWidth = 1;
        ctx.globalAlpha = pulse * 0.6;
        ctx.beginPath();
        ctx.moveTo(c.x + c.dx * cornerSize * 0.5, c.y + c.dy * 4);
        ctx.lineTo(c.x + c.dx * cornerSize * 0.5, c.y);
        ctx.stroke();
        ctx.restore();
      }

      // === Body bounding box ===
      if (hasBody && kp.length > 0) {
        const visible = kp.filter(k => (k.score ?? 0) > 0.3);
        if (visible.length >= 3) {
          const xs = visible.map(k => k.x);
          const ys = visible.map(k => k.y);
          const bx = Math.min(...xs) - 20;
          const by = Math.min(...ys) - 20;
          const bw = Math.max(...xs) - bx + 20;
          const bh = Math.max(...ys) - by + 20;
          const boxPulse = 0.5 + 0.5 * Math.abs(Math.sin(t * 4));

          ctx.save();
          ctx.strokeStyle = isBurst ? "rgba(255,255,255,0.25)" : "rgba(0,255,136,0.18)";
          ctx.lineWidth = 1;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(bx, by, bw, bh);
          ctx.restore();

          // Box corners (inner lock-on style)
          const bc = Math.min(bw, bh) * 0.15;
          const boxCorners = [
            { x: bx, y: by, dx: 1, dy: 1 },
            { x: bx + bw, y: by, dx: -1, dy: 1 },
            { x: bx, y: by + bh, dx: 1, dy: -1 },
            { x: bx + bw, y: by + bh, dx: -1, dy: -1 },
          ];
          for (const bc2 of boxCorners) {
            ctx.save();
            ctx.strokeStyle = isBurst ? "#ffffff" : "#00ff88";
            ctx.lineWidth = 2;
            ctx.shadowBlur = 10;
            ctx.shadowColor = GLOW;
            ctx.globalAlpha = 0.7 + 0.3 * boxPulse;
            ctx.beginPath();
            ctx.moveTo(bc2.x + bc2.dx * bc, bc2.y);
            ctx.lineTo(bc2.x, bc2.y);
            ctx.lineTo(bc2.x, bc2.y + bc2.dy * bc);
            ctx.stroke();
            ctx.restore();
          }

          // "SUBJECT DETECTED" label near bounding box top
          ctx.save();
          ctx.font = "bold 9px monospace";
          ctx.fillStyle = PRIMARY;
          ctx.globalAlpha = 0.8 + 0.2 * boxPulse;
          ctx.shadowBlur = 8;
          ctx.shadowColor = GLOW;
          ctx.fillText(isBurst ? "█ ANALYZING PHYSIQUE █" : "▶ SUBJECT DETECTED", bx + 2, by - 6);
          ctx.restore();
        }
      } else {
        // No body — "searching" indicator
        const searchPulse = 0.5 + 0.5 * Math.sin(t * 2);
        ctx.save();
        ctx.font = "bold 10px monospace";
        ctx.fillStyle = `rgba(0,255,136,${searchPulse * 0.7})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = "rgba(0,255,136,0.5)";
        ctx.fillText("◌ SEARCHING FOR SUBJECT...", w / 2 - 85, h / 2);
        ctx.restore();
      }

      // === Skeleton ===
      const MIN_SCORE = 0.3;
      pulsePhaseRef.current = t;

      ctx.save();
      for (const [a, b] of POSE_CONNECTIONS) {
        const kpA = kp[a];
        const kpB = kp[b];
        if (!kpA || !kpB) continue;
        const scoreA = kpA.score ?? 0;
        const scoreB = kpB.score ?? 0;
        if (scoreA < MIN_SCORE || scoreB < MIN_SCORE) continue;
        const conf = (scoreA + scoreB) / 2;

        ctx.shadowBlur = isBurst ? 18 : 8;
        ctx.shadowColor = GLOW;
        ctx.lineWidth = isBurst ? 2.5 : 1.5;

        if (isBurst) {
          ctx.strokeStyle = `rgba(255,255,255,${0.6 + conf * 0.4})`;
        } else {
          const green = Math.floor(200 + conf * 55);
          ctx.strokeStyle = `rgba(0,${green},100,${0.4 + conf * 0.5})`;
        }

        ctx.setLineDash([8, 3]);
        ctx.lineDashOffset = -(t * 30) % 11;
        ctx.beginPath();
        ctx.moveTo(kpA.x, kpA.y);
        ctx.lineTo(kpB.x, kpB.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // === Keypoints with pulse rings ===
      for (let i = 0; i < kp.length; i++) {
        const point = kp[i];
        const score = point.score ?? 0;
        if (score < MIN_SCORE) continue;

        const phase = (t * 2 + i * 0.4) % (Math.PI * 2);
        const pulseRadius = 6 + 4 * Math.abs(Math.sin(phase));
        const ringOpacity = 0.3 + 0.4 * Math.abs(Math.sin(phase));

        // Outer expanding ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(point.x, point.y, pulseRadius + (isBurst ? 6 : 0), 0, Math.PI * 2);
        ctx.strokeStyle = isBurst ? `rgba(255,255,255,${ringOpacity * 0.5})` : `rgba(0,255,136,${ringOpacity * 0.4})`;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 6;
        ctx.shadowColor = GLOW;
        ctx.stroke();
        ctx.restore();

        // Core dot
        const dotRadius = isBurst ? 6 : 4;
        const green = Math.floor(180 + score * 75);
        ctx.save();
        ctx.beginPath();
        ctx.arc(point.x, point.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = isBurst ? "#ffffff" : `rgb(0,${green},80)`;
        ctx.shadowBlur = isBurst ? 20 : 12;
        ctx.shadowColor = GLOW;
        ctx.fill();
        ctx.restore();

        // Confidence score micro-label for key joints
        if (score > 0.6 && [5, 6, 11, 12].includes(i)) {
          ctx.save();
          ctx.font = "7px monospace";
          ctx.fillStyle = isBurst ? "rgba(255,255,255,0.7)" : "rgba(0,255,136,0.6)";
          ctx.fillText(`${Math.round(score * 100)}%`, point.x + 6, point.y - 4);
          ctx.restore();
        }
      }

      // === Flickering data readouts ===
      if (now - lastDataUpdateRef.current > 400 || dataReadoutsRef.current.length === 0) {
        lastDataUpdateRef.current = now;
        dataReadoutsRef.current = [
          { label: "SYS", value: fmtHex(Math.floor(rand(0x4000, 0xFFFF))), x: 8, y: 0 },
          { label: "BIO", value: fmtHex(Math.floor(rand(0x1000, 0x9FFF))), x: 8, y: 0 },
          { label: "CNF", value: `${Math.floor(rand(72, 99))}%`, x: 8, y: 0 },
          { label: "FRM", value: fmtHex(Math.floor(rand(0x0010, 0x00FF))), x: 8, y: 0 },
        ];
      }

      // Left side data panel
      ctx.save();
      ctx.font = "8px monospace";
      const panelY = h - 12 - dataReadoutsRef.current.length * 14;
      for (let i = 0; i < dataReadoutsRef.current.length; i++) {
        const d = dataReadoutsRef.current[i];
        const y = panelY + i * 14;
        ctx.fillStyle = DIM;
        ctx.fillText(`${d.label}:`, 10, y);
        ctx.fillStyle = isBurst ? "rgba(255,255,255,0.85)" : "rgba(0,255,136,0.75)";
        ctx.shadowBlur = 4;
        ctx.shadowColor = GLOW;
        ctx.fillText(d.value, 34, y);
      }
      ctx.restore();

      // Right side: status
      const statusText = isBurst ? "ANALYZING..." : hasBody ? "SCANNING" : "SEEKING";
      const statusPulse = 0.6 + 0.4 * Math.abs(Math.sin(t * (isBurst ? 8 : 2)));
      ctx.save();
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = isBurst ? `rgba(255,255,255,${statusPulse})` : `rgba(0,255,136,${statusPulse})`;
      ctx.shadowBlur = isBurst ? 14 : 6;
      ctx.shadowColor = GLOW;
      ctx.textAlign = "right";
      ctx.fillText(`[ ${statusText} ]`, w - 10, h - 10);
      ctx.restore();

      // Top right: grid ref
      ctx.save();
      ctx.font = "7px monospace";
      ctx.fillStyle = DIM;
      ctx.textAlign = "right";
      ctx.fillText(`REF:${fmtHex(Math.floor(t * 100) & 0xFFFF)}`, w - 10, 14);
      ctx.restore();
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
          const kp = poses[0]?.keypoints ?? [];
          const hasBody = kp.some(k => (k.score ?? 0) > 0.3);
          drawHUD(ctx, canvas.width, canvas.height, kp, hasBody);
          rafRef.current = requestAnimationFrame(drawLoop);
        })
        .catch(() => { rafRef.current = requestAnimationFrame(drawLoop); });
    }

    init();
    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (detectorRef.current) { detectorRef.current.dispose(); detectorRef.current = null; }
    };
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
      style={{ mixBlendMode: "screen" }}
    />
  );
}

function AudioMeter({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream) return;
    const audioCtx = new AudioContext();
    ctxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      const canvas = canvasRef.current;
      const an = analyserRef.current;
      if (!canvas || !an) return;
      an.getByteFrequencyData(data);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const level = Math.min(1, avg / 60);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = level > 0.05 ? `rgba(0,255,136,${0.4 + level * 0.6})` : "rgba(0,255,136,0.2)";
      ctx.shadowBlur = level > 0.05 ? 8 : 0;
      ctx.shadowColor = "#00ff88";
      const bars = 5;
      for (let i = 0; i < bars; i++) {
        const h = canvas.height * (0.2 + (i < Math.round(level * bars) ? 0.6 : 0));
        ctx.fillRect(i * 5, (canvas.height - h) / 2, 3, h);
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      analyser.disconnect();
      source.disconnect();
      audioCtx.close();
    };
  }, [stream]);

  return <canvas ref={canvasRef} width={28} height={16} className="inline-block" />;
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
        <p className="font-mono text-xs text-muted-foreground italic leading-relaxed">"{lastFeedback}"</p>
      )}
    </div>
  );
}

function GameArena({ onRematch, initialHostCode, initialJoinCode }: {
  onRematch: () => void;
  initialHostCode?: string;
  initialJoinCode?: string;
}) {
  // Private room mode
  const privateMode: "host" | "join" | null = initialHostCode ? "host" : initialJoinCode ? "join" : null;
  const privateCode = initialHostCode ?? initialJoinCode ?? null;

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
  const [muted, setMuted] = useState(false);
  const [privateRoomError, setPrivateRoomError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [breakdown, setBreakdown] = useState<{ muscleDef?: number; leanness?: number; vascularity?: number; vTaper?: number; posture?: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const prevOpponentScoreRef = useRef(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const ratingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Toggle mute on local audio track
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = muted;
    setMuted(m => !m);
  }, [muted]);

  useEffect(() => {
    async function init() {
      try {
        // Request camera + mic upfront so there's no permission prompt mid-game
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.onloadedmetadata = () => setCameraReady(true);
        }
        setCameraReady(true);
      } catch (err) {
        console.error("Media error:", err);
        setGameState("error");
        setErrorMessage("Camera and microphone access is required to play. Please allow both permissions and try again.");
        return;
      }

      setGameState("queue");
      const socket = io({ path: "/api/socket.io", transports: ["websocket"] });
      socketRef.current = socket;

      socket.on("connect", () => {
        if (userIdRef.current) {
          const u = user;
          const displayName = u
            ? ([u.firstName, u.lastName].filter(Boolean).join(" ").trim() || "Fighter")
            : "Fighter";
          socket.emit("identify", { userId: userIdRef.current, displayName });
        }
        if (privateMode === "host" && privateCode) {
          socket.emit("host-private-room", { code: privateCode });
        } else if (privateMode === "join" && privateCode) {
          socket.emit("join-private-room", { code: privateCode });
        } else {
          socket.emit("join-queue");
        }
      });

      socket.on("private-room-hosted", () => {
        // Confirmed — now waiting for friend to join
        // gameState already "queue" — UI will show code
      });

      socket.on("private-room-error", (data: { message: string }) => {
        setPrivateRoomError(data.message);
        setGameState("error");
        setErrorMessage(data.message);
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
          if (!stream) throw new Error("No stream");

          const pc = new RTCPeerConnection({
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
            ],
          });
          pcRef.current = pc;

          // Add all tracks (video + audio) to the peer connection
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
    }

    init();
  }, []);

  const triggerBurst = () => {
    setScanBurst(true);
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => setScanBurst(false), 1800);
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
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Data = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

      triggerBurst();

      try {
        const result = await rateFrameMutateRef.current({ data: { imageData: base64Data } });
        setLastRoundScore(result.score);
        setScoreHistory(prev => [...prev, { score: result.score, feedback: result.feedback }]);
        if (result.breakdown) setBreakdown(result.breakdown);
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
          <h1 className="text-4xl font-display text-destructive uppercase">Permissions Required</h1>
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-6">
        {/* Camera preview */}
        <div className="relative w-64 h-48 md:w-96 md:h-72 overflow-hidden border border-border bg-black">
          <video ref={localVideoRef} autoPlay playsInline muted
            className="w-full h-full object-cover grayscale-[0.2] contrast-125" />
          {cameraReady && <PoseScanOverlay videoRef={localVideoRef} burst={false} />}
          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <span className="font-mono text-xs text-primary animate-pulse">Initializing camera &amp; mic...</span>
            </div>
          )}
          {cameraReady && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 px-2 py-1 rounded-sm border border-primary/20">
              <Mic className="w-3 h-3 text-primary" />
              <AudioMeter stream={localStreamRef.current} />
            </div>
          )}
        </div>

        {/* Private room host — show the code */}
        {privateMode === "host" && privateCode ? (
          <div className="flex flex-col items-center gap-4 border border-primary/40 bg-primary/5 px-8 py-6 max-w-xs w-full">
            <div className="flex items-center gap-2">
              <Users2 className="w-4 h-4 text-primary" />
              <span className="font-mono text-xs text-primary uppercase tracking-widest font-bold">Private Room</span>
            </div>
            <p className="font-mono text-xs text-muted-foreground text-center">Share this code with your friend:</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-0.5">
                {privateCode.split("").map((ch, i) => (
                  <span key={i}
                    className="w-9 h-12 flex items-center justify-center bg-black border border-primary/40 font-[family-name:--app-font-display] text-2xl text-primary"
                    style={{ textShadow: "0 0 12px var(--primary)" }}>
                    {ch}
                  </span>
                ))}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(privateCode).then(() => {
                    setCodeCopied(true);
                    setTimeout(() => setCodeCopied(false), 2000);
                  });
                }}
                className="p-2 border border-border hover:border-primary/50 text-muted-foreground hover:text-primary transition-colors"
              >
                {codeCopied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-2 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="font-mono text-xs text-muted-foreground">Waiting for your friend to join...</span>
            </div>
          </div>
        ) : privateMode === "join" ? (
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="w-24 h-24 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Users2 className="w-6 h-6 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl font-display uppercase tracking-widest text-foreground">Joining Room</h2>
            <p className="font-mono text-xs text-muted-foreground">Connecting to your friend's room...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="w-32 h-32 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display text-3xl text-primary animate-pulse">VS</span>
              </div>
            </div>
            <h2 className="text-3xl font-display uppercase tracking-widest text-foreground">Awaiting Challenger</h2>
            <p className="text-muted-foreground font-mono text-xs uppercase tracking-wider">Voice chat will connect automatically when matched</p>
          </div>
        )}

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
      <header className="absolute top-0 left-0 right-0 z-20 bg-background/90 border-b border-border backdrop-blur p-3 md:p-4">
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

          <div className="flex-shrink-0 px-4 md:px-8 text-center flex flex-col items-center gap-1">
            <span className="text-muted-foreground font-mono text-xs uppercase mb-1">Target</span>
            <div className="text-3xl font-display text-muted-foreground">{targetScore}</div>
            <div className="w-12 h-12 rounded-full border-2 border-primary flex items-center justify-center text-primary font-display text-2xl relative">
              {countdown}
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="22" cy="22" r="22" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
                <circle cx="22" cy="22" r="22" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeDasharray="138" strokeDashoffset={138 - (138 * countdown) / 5}
                  className="transition-all duration-1000 linear" />
              </svg>
            </div>
            {/* Mute button */}
            <button
              onClick={toggleMute}
              title={muted ? "Unmute mic" : "Mute mic"}
              className={`mt-1 flex items-center gap-1 px-2 py-1 border text-xs font-mono uppercase transition-colors ${
                muted
                  ? "border-destructive/50 text-destructive hover:border-destructive"
                  : "border-primary/30 text-primary hover:border-primary"
              }`}
            >
              {muted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              {muted ? "Muted" : "Mic On"}
            </button>
            {/* Analysis sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(o => !o)}
              title="Toggle AI breakdown"
              className={`mt-1 flex items-center gap-1 px-2 py-1 border text-xs font-mono uppercase transition-colors ${
                sidebarOpen
                  ? "border-primary text-primary bg-primary/10"
                  : "border-primary/30 text-primary/60 hover:border-primary hover:text-primary"
              }`}
            >
              <BarChart2 className="w-3 h-3" />
              Analysis
            </button>
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

      {/* AI Breakdown Sidebar */}
      {sidebarOpen && (
        <div className="absolute top-0 right-0 bottom-0 z-30 w-64 bg-black/95 border-l border-border backdrop-blur-sm flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              <span className="font-mono text-xs text-primary uppercase tracking-widest font-bold">AI Analysis</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {breakdown ? (
            <div className="flex flex-col items-center gap-5 px-4 py-5">
              {/* Radar chart */}
              <div className="flex items-center justify-center py-2">
                <RadarChart breakdown={breakdown} />
              </div>

              {/* Metric bars */}
              <div className="w-full flex flex-col gap-2.5">
                {BD_METRICS.map(m => (
                  <MetricBar key={m.key} label={m.label} value={breakdown[m.key]} />
                ))}
              </div>

              <p className="font-mono text-[10px] text-muted-foreground/50 text-center leading-relaxed">
                Updated every round based on your live camera feed
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <BarChart2 className="w-8 h-8 text-primary/20 animate-pulse" />
              <p className="font-mono text-xs text-muted-foreground">Waiting for first AI rating...</p>
              <p className="font-mono text-[10px] text-muted-foreground/50">Analysis will appear after the first round</p>
            </div>
          )}
        </div>
      )}

      {/* Videos */}
      <div className="flex-1 flex flex-col md:flex-row relative pt-36 md:pt-32 pb-4">
        {/* Local video */}
        <div className="flex-1 relative overflow-hidden border-b border-border md:border-b-0 md:border-r md:border-r-2 md:border-background">
          <video ref={localVideoRef} autoPlay playsInline muted
            className="w-full h-full object-cover grayscale-[0.2] contrast-125" />
          <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] pointer-events-none" />
          {gameState === "matched" && cameraReady && (
            <PoseScanOverlay videoRef={localVideoRef} burst={scanBurst} />
          )}
          {/* Mic indicator */}
          <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-black/60 px-2 py-1 border border-primary/20">
            {muted
              ? <MicOff className="w-3 h-3 text-destructive" />
              : <><Mic className="w-3 h-3 text-primary" /><AudioMeter stream={localStreamRef.current} /></>
            }
          </div>
          {myFeedback && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-6 py-3 font-mono text-sm sm:text-base border-2 border-background font-bold tracking-tight uppercase max-w-[90%] text-center animate-in fade-in slide-in-from-bottom-4 duration-300 z-20">
              AI: {myFeedback}
            </div>
          )}
        </div>

        {/* Remote video */}
        <div className="flex-1 relative">
          <video ref={remoteVideoRef} autoPlay playsInline
            className="w-full h-full object-cover grayscale-[0.2] contrast-125" />
          <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] pointer-events-none" />
          <div className="absolute top-2 right-2 z-20 bg-black/60 px-2 py-1 border border-destructive/20">
            <span className="font-mono text-xs text-destructive uppercase tracking-wider">Opponent</span>
          </div>
        </div>
      </div>

      {/* Game Over */}
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
                <h2 className={`text-6xl font-display uppercase mb-2 ${won ? "text-primary" : "text-destructive"}`}>
                  {won ? "Victory" : "Defeat"}
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
              <Link href="/"
                className="border border-border px-8 py-4 font-display text-2xl uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
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
  const search = useSearch();
  const params = new URLSearchParams(search);
  const hostCode = params.get("host")?.toUpperCase() ?? undefined;
  const joinCode = params.get("join")?.toUpperCase() ?? undefined;
  const [key, setKey] = useState(0);
  return (
    <GameArena
      key={key}
      onRematch={() => setKey(k => k + 1)}
      initialHostCode={hostCode}
      initialJoinCode={joinCode}
    />
  );
}
