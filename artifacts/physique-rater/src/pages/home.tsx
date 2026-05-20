import { Link } from "wouter";
import { useGetGameStats } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Users, Activity, Dumbbell, Swords, Crown, Trophy, LogIn, LogOut } from "lucide-react";

export default function Home() {
  const { data: stats } = useGetGameStats();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Fighter"
    : null;

  return (
    <div className="min-h-screen w-full bg-black flex flex-col relative overflow-hidden scanlines">
      {/* Radial glow behind logo */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_50%_at_50%_25%,hsl(270,85%,30%),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_80%,hsl(270,85%,15%),transparent)] opacity-60" />
      </div>

      {/* Vignette */}
      <div className="absolute inset-0 vignette z-10 pointer-events-none" />

      {/* Top nav bar */}
      <div className="z-30 flex items-center justify-between px-6 py-4 border-b border-border/40">
        <Link href="/leaderboard" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-mono text-sm uppercase tracking-widest">
          <Trophy className="w-4 h-4" />
          Rankings
        </Link>

        <div className="flex items-center gap-3">
          {isLoading ? (
            <span className="font-mono text-xs text-muted-foreground animate-pulse">...</span>
          ) : isAuthenticated ? (
            <>
              <div className="flex items-center gap-2">
                {user?.profileImageUrl ? (
                  <img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-full border border-primary/40" />
                ) : (
                  <div className="w-7 h-7 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center text-primary font-display text-sm">
                    {displayName?.[0] ?? "F"}
                  </div>
                )}
                <span className="font-mono text-sm text-foreground">{displayName}</span>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors font-mono text-xs uppercase tracking-wider"
              >
                <LogOut className="w-3 h-3" />
                Out
              </button>
            </>
          ) : (
            <button
              onClick={login}
              className="flex items-center gap-2 border border-primary/50 hover:border-primary px-4 py-2 font-mono text-sm text-primary uppercase tracking-wider transition-all hover:bg-primary/10"
            >
              <LogIn className="w-4 h-4" />
              Log In
            </button>
          )}
        </div>
      </div>

      <div className="z-20 flex flex-col items-center px-6 text-center flex-1">

        {/* Logo Hero — pure text, no image */}
        <div className="flex flex-col items-center pt-10 pb-6 space-y-5">
          {/* Main title — bold, tight, aggressive */}
          <h1 className="font-[family-name:--app-font-display] text-[4.5rem] md:text-[7.5rem] leading-[0.9] tracking-tight select-none">
            <span className="text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]">OME</span>
            <span className="text-primary glow-text">GAINS</span>
          </h1>

          {/* Tagline */}
          <div className="flex items-center gap-4">
            <span className="h-px w-10 bg-primary/30" />
            <span className="font-mono text-sm md:text-base text-primary tracking-[0.35em] uppercase">
              Mog. Flex. Win.
            </span>
            <span className="h-px w-10 bg-primary/30" />
          </div>

          <p className="text-base md:text-lg text-muted-foreground font-mono max-w-xl leading-relaxed tracking-wide">
            Face off against strangers in real-time. Every 5 seconds, AI rates your physique.
            First to 50 points wins. No filters. Raw Gains.
          </p>
        </div>

        {/* Live Stats Bar */}
        <div className="flex flex-wrap justify-center gap-4 md:gap-8 pb-12">
          <div className="flex items-center gap-3 bg-secondary/60 border border-border px-5 py-3 backdrop-blur-sm glow-border">
            <Users className="w-5 h-5 text-primary" />
            <div className="text-left">
              <div className="text-3xl font-display leading-none text-foreground glow-text">{stats?.playersOnline ?? "0"}</div>
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Fighters Online</div>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-secondary/60 border border-border px-5 py-3 backdrop-blur-sm glow-border">
            <Activity className="w-5 h-5 text-primary" />
            <div className="text-left">
              <div className="text-3xl font-display leading-none text-foreground glow-text">{stats?.activeGames ?? "0"}</div>
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Active Bouts</div>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="w-full max-w-3xl pb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Dumbbell, title: "Enter", desc: "Hit the arena button. No signup. No BS." },
              { icon: Swords, title: "Battle", desc: "Get matched live. Show your physique on camera." },
              { icon: Crown, title: "Win", desc: "AI judges every 5s. First to 50 takes the crown." },
            ].map((step, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-3 p-5 border border-border bg-secondary/40 backdrop-blur-sm glow-border"
              >
                <step.icon className="w-8 h-8 text-primary" />
                <h3 className="text-xl font-display text-foreground tracking-widest">{step.title}</h3>
                <p className="text-sm font-mono text-muted-foreground text-center leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="pb-16">
          <Link href="/game" className="group relative inline-flex items-center justify-center pulse-glow">
            <div className="absolute inset-0 bg-primary translate-y-3 translate-x-3 transition-transform duration-200 group-hover:translate-y-2 group-hover:translate-x-2 group-active:translate-y-0 group-active:translate-x-0" />
            <div className="relative flex items-center bg-black border-4 border-primary px-14 py-6 text-4xl md:text-5xl font-display uppercase tracking-[0.2em] text-foreground transition-colors group-hover:bg-primary/10">
              Enter the Arena
            </div>
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-auto pb-6 text-center">
          <p className="font-mono text-xs text-muted-foreground tracking-wider uppercase">
            OMEGAINS &mdash; Mog. Flex. Win.
          </p>
        </div>
      </div>
    </div>
  );
}
