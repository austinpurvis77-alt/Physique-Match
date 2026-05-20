import { Link } from "wouter";
import { useGetGameStats } from "@workspace/api-client-react";
import { Users, Activity } from "lucide-react";

export default function Home() {
  const { data: stats } = useGetGameStats();

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background visual texture */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/30 via-background to-background" />
        <div className="absolute w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-30 mix-blend-overlay" />
      </div>

      <div className="z-10 flex flex-col items-center max-w-4xl px-6 text-center space-y-12">
        
        {/* Brand Hero */}
        <div className="space-y-4">
          <div className="inline-block px-4 py-1.5 border-2 border-primary/50 text-primary text-sm font-mono font-bold tracking-widest bg-primary/10 uppercase mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            Live AI Physique Rating Arena
          </div>
          <h1 className="text-7xl md:text-9xl font-display text-foreground leading-[0.8] tracking-tight uppercase shadow-sm">
            Physic<span className="text-primary">Rank</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground font-mono max-w-2xl mx-auto pt-4 leading-relaxed">
            Face off against strangers in real-time. Every 5 seconds, AI judges your physique. First to 50 points takes the glory. No filters. Pure aesthetic warfare.
          </p>
        </div>

        {/* Live Stats */}
        <div className="flex flex-wrap justify-center gap-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both">
          <div className="flex items-center gap-3 bg-secondary/50 border border-border px-6 py-4 backdrop-blur-sm">
            <Users className="w-5 h-5 text-primary" />
            <div className="text-left">
              <div className="text-2xl font-display leading-none text-foreground">{stats?.playersOnline ?? "---"}</div>
              <div className="text-xs font-mono text-muted-foreground uppercase">Fighters Online</div>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-secondary/50 border border-border px-6 py-4 backdrop-blur-sm">
            <Activity className="w-5 h-5 text-primary" />
            <div className="text-left">
              <div className="text-2xl font-display leading-none text-foreground">{stats?.activeGames ?? "---"}</div>
              <div className="text-xs font-mono text-muted-foreground uppercase">Active Bouts</div>
            </div>
          </div>
        </div>

        {/* Action */}
        <div className="pt-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
          <Link href="/queue" className="group relative inline-flex items-center justify-center">
            <div className="absolute inset-0 bg-primary translate-y-2 translate-x-2 transition-transform group-hover:translate-y-1 group-hover:translate-x-1 group-active:translate-y-0 group-active:translate-x-0" />
            <div className="relative flex items-center bg-background border-4 border-primary px-12 py-5 text-3xl font-display uppercase tracking-widest text-foreground transition-colors group-hover:bg-primary/10">
              Enter the Arena
            </div>
          </Link>
        </div>

      </div>
    </div>
  );
}
