import { useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useGetGameStats } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Users, Activity, Dumbbell, Swords, Crown, Trophy, LogIn, LogOut, Users2, Copy, Check, ChevronRight, Hash } from "lucide-react";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
}

export default function Home() {
  const { data: stats } = useGetGameStats();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const [, navigate] = useLocation();

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || "Fighter"
    : null;

  // Friend mode UI state
  const [friendPanel, setFriendPanel] = useState<"none" | "create" | "join">("none");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState("");

  const handleCreateRoom = useCallback(() => {
    const code = generateCode();
    setGeneratedCode(code);
    setFriendPanel("create");
    setCopied(false);
  }, []);

  const handleCopyCode = useCallback(() => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [generatedCode]);

  const handleEnterAsHost = useCallback(() => {
    if (generatedCode) navigate(`/game?host=${generatedCode}`);
  }, [generatedCode, navigate]);

  const handleJoin = useCallback(() => {
    const code = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) {
      setJoinError("Code must be 6 characters.");
      return;
    }
    setJoinError("");
    navigate(`/game?join=${code}`);
  }, [joinCode, navigate]);

  const closeFriendPanel = () => {
    setFriendPanel("none");
    setGeneratedCode(null);
    setJoinCode("");
    setJoinError("");
  };

  return (
    <div className="min-h-screen w-full bg-black flex flex-col relative overflow-hidden scanlines">
      {/* Radial glow behind logo */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_50%_at_50%_25%,hsl(270,85%,30%),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_80%,hsl(270,85%,15%),transparent)] opacity-60" />
      </div>
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

        {/* Logo Hero */}
        <div className="flex flex-col items-center pt-10 pb-6 space-y-5">
          <h1 className="font-[family-name:--app-font-display] text-[4.5rem] md:text-[7.5rem] leading-[0.9] tracking-tight select-none">
            <span className="text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]">OME</span>
            <span className="text-primary glow-text">GAINS</span>
          </h1>
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
        <div className="flex flex-wrap justify-center gap-4 md:gap-8 pb-10">
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
        <div className="w-full max-w-3xl pb-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Dumbbell, title: "Enter", desc: "Hit the arena button. No signup. No BS." },
              { icon: Swords, title: "Battle", desc: "Get matched live. Show your physique on camera." },
              { icon: Crown, title: "Win", desc: "AI judges every 5s. First to 50 takes the crown." },
            ].map((step, i) => (
              <div key={i} className="flex flex-col items-center gap-3 p-5 border border-border bg-secondary/40 backdrop-blur-sm glow-border">
                <step.icon className="w-8 h-8 text-primary" />
                <h3 className="text-xl font-display text-foreground tracking-widest">{step.title}</h3>
                <p className="text-sm font-mono text-muted-foreground text-center leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA — two buttons */}
        <div className="pb-6 flex flex-col items-center gap-5 w-full max-w-lg">
          {/* Random match */}
          <Link href="/game" className="group relative inline-flex items-center justify-center pulse-glow w-full">
            <div className="absolute inset-0 bg-primary translate-y-2 translate-x-2 transition-transform duration-200 group-hover:translate-y-1 group-hover:translate-x-1 group-active:translate-y-0 group-active:translate-x-0" />
            <div className="relative flex items-center justify-center w-full bg-black border-4 border-primary px-10 py-5 text-3xl md:text-4xl font-display uppercase tracking-[0.2em] text-foreground transition-colors group-hover:bg-primary/10">
              Enter the Arena
            </div>
          </Link>

          {/* Divider */}
          <div className="flex items-center gap-3 w-full">
            <span className="flex-1 h-px bg-border/40" />
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">or</span>
            <span className="flex-1 h-px bg-border/40" />
          </div>

          {/* Play with friend */}
          {friendPanel === "none" ? (
            <button
              onClick={() => setFriendPanel("choose")}
              className="group flex items-center justify-center gap-3 w-full border border-border/60 hover:border-primary/50 bg-secondary/30 hover:bg-secondary/60 px-8 py-4 font-display text-xl uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all"
            >
              <Users2 className="w-5 h-5" />
              Play with a Friend
              <ChevronRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </button>
          ) : null}

          {/* Choose sub-mode */}
          {friendPanel === "choose" && (
            <div className="w-full border border-border/60 bg-secondary/20 divide-y divide-border/40 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users2 className="w-4 h-4 text-primary" />
                  <span className="font-mono text-xs text-primary uppercase tracking-widest font-bold">Play with a Friend</span>
                </div>
                <button onClick={closeFriendPanel} className="font-mono text-xs text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/40">
                <button
                  onClick={handleCreateRoom}
                  className="flex flex-col items-center gap-2 px-6 py-5 hover:bg-primary/5 transition-colors group"
                >
                  <Hash className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
                  <span className="font-display text-lg uppercase tracking-wider text-foreground">Create Room</span>
                  <span className="font-mono text-xs text-muted-foreground text-center leading-relaxed">
                    Generate a code and share it with your friend
                  </span>
                </button>
                <button
                  onClick={() => setFriendPanel("join")}
                  className="flex flex-col items-center gap-2 px-6 py-5 hover:bg-primary/5 transition-colors group"
                >
                  <ChevronRight className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
                  <span className="font-display text-lg uppercase tracking-wider text-foreground">Join Room</span>
                  <span className="font-mono text-xs text-muted-foreground text-center leading-relaxed">
                    Enter a code from your friend to join their room
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Create room — show code */}
          {friendPanel === "create" && generatedCode && (
            <div className="w-full border border-primary/40 bg-primary/5 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="px-5 py-3 flex items-center justify-between border-b border-primary/20">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-primary" />
                  <span className="font-mono text-xs text-primary uppercase tracking-widest font-bold">Your Room Code</span>
                </div>
                <button onClick={closeFriendPanel} className="font-mono text-xs text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <div className="px-6 py-5 flex flex-col items-center gap-4">
                <p className="font-mono text-xs text-muted-foreground">Share this code with your friend, then enter the arena:</p>

                {/* Code display */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-0.5">
                    {generatedCode.split("").map((ch, i) => (
                      <span key={i}
                        className="w-9 h-12 flex items-center justify-center bg-black border border-primary/40 font-[family-name:--app-font-display] text-2xl text-primary"
                        style={{ textShadow: "0 0 12px var(--primary)" }}>
                        {ch}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={handleCopyCode}
                    title="Copy code"
                    className="p-2 border border-border hover:border-primary/50 text-muted-foreground hover:text-primary transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {copied && (
                  <span className="font-mono text-xs text-primary animate-in fade-in duration-200">Copied to clipboard!</span>
                )}

                <button
                  onClick={handleEnterAsHost}
                  className="mt-1 w-full bg-primary text-primary-foreground px-8 py-3 font-display text-xl uppercase tracking-widest hover:bg-primary/90 transition-colors"
                >
                  Enter Arena — Host
                </button>
                <p className="font-mono text-[10px] text-muted-foreground/60">
                  Your friend joins using this code. You'll be matched when they connect.
                </p>
              </div>
            </div>
          )}

          {/* Join room — enter code */}
          {friendPanel === "join" && (
            <div className="w-full border border-border/60 bg-secondary/20 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="px-5 py-3 flex items-center justify-between border-b border-border/40">
                <div className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-primary" />
                  <span className="font-mono text-xs text-primary uppercase tracking-widest font-bold">Join a Room</span>
                </div>
                <button onClick={closeFriendPanel} className="font-mono text-xs text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <div className="px-6 py-5 flex flex-col items-center gap-3">
                <p className="font-mono text-xs text-muted-foreground">Enter the 6-character code from your friend:</p>
                <input
                  type="text"
                  value={joinCode}
                  onChange={e => {
                    setJoinError("");
                    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
                  }}
                  onKeyDown={e => { if (e.key === "Enter") handleJoin(); }}
                  placeholder="XXXXXX"
                  maxLength={6}
                  spellCheck={false}
                  className="w-48 text-center bg-black border border-primary/40 focus:border-primary outline-none px-4 py-3 font-[family-name:--app-font-display] text-3xl tracking-[0.3em] text-primary uppercase placeholder:text-muted-foreground/30"
                  style={{ textShadow: joinCode ? "0 0 10px var(--primary)" : "none" }}
                  autoFocus
                />
                {joinError && (
                  <p className="font-mono text-xs text-destructive animate-in fade-in duration-200">{joinError}</p>
                )}
                <button
                  onClick={handleJoin}
                  disabled={joinCode.length !== 6}
                  className="w-full bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed px-8 py-3 font-display text-xl uppercase tracking-widest hover:bg-primary/90 transition-colors"
                >
                  Join Match
                </button>
              </div>
            </div>
          )}
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
