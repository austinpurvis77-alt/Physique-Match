import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetGameStats } from "@workspace/api-client-react";

export default function Queue() {
  const [, setLocation] = useLocation();
  const { data: stats } = useGetGameStats();

  useEffect(() => {
    const timer = setTimeout(() => {
      setLocation("/game");
    }, 2500);
    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center relative overflow-hidden scanlines">
      {/* Radial glow */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,hsl(270,85%,20%),transparent)]" />
      </div>
      <div className="absolute inset-0 vignette z-10 pointer-events-none" />

      <div className="z-20 text-center space-y-10">
        {/* Spinner */}
        <div className="relative inline-block">
          <div className="w-36 h-36 border-[3px] border-primary/15 border-t-primary rounded-full animate-spin" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-5xl text-primary glow-text">VS</span>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-5xl md:text-6xl font-display uppercase tracking-[0.15em] text-foreground glow-text">
            Matching Opponent
          </h2>
          <p className="text-muted-foreground font-mono tracking-wide">
            {stats?.playersOnline ? `${stats.playersOnline} fighters in the arena` : "Connecting to arena network..."}
          </p>
        </div>

        <Link
          href="/"
          className="inline-block text-muted-foreground hover:text-destructive font-mono uppercase text-sm tracking-[0.2em] border-b border-transparent hover:border-destructive transition-colors pb-1"
        >
          Leave Queue
        </Link>
      </div>
    </div>
  );
}
