import { Link, useParams } from "wouter";
import { useGetUserProfile } from "@workspace/api-client-react";
import { ChevronLeft, Trophy, Swords, User, TrendingUp, TrendingDown, Minus } from "lucide-react";

function EloTier({ elo }: { elo: number }) {
  if (elo >= 1400) return <span className="text-yellow-400 font-mono text-xs uppercase tracking-widest">Champion</span>;
  if (elo >= 1200) return <span className="text-purple-400 font-mono text-xs uppercase tracking-widest">Elite</span>;
  if (elo >= 1100) return <span className="text-blue-400 font-mono text-xs uppercase tracking-widest">Seasoned</span>;
  if (elo >= 1000) return <span className="text-green-400 font-mono text-xs uppercase tracking-widest">Contender</span>;
  return <span className="text-muted-foreground font-mono text-xs uppercase tracking-widest">Rookie</span>;
}

function StatBox({ label, value, color = "text-foreground" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 border border-border bg-secondary/10 px-6 py-4 min-w-[80px]">
      <span className={`font-display text-3xl ${color}`}>{value}</span>
      <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">{label}</span>
    </div>
  );
}

function EloBadge({ elo }: { elo: number }) {
  let color = "border-muted-foreground text-muted-foreground";
  if (elo >= 1400) color = "border-yellow-400 text-yellow-400";
  else if (elo >= 1200) color = "border-purple-400 text-purple-400";
  else if (elo >= 1100) color = "border-blue-400 text-blue-400";
  else if (elo >= 1000) color = "border-green-400 text-green-400";
  return (
    <div className={`border-2 ${color} px-4 py-1 font-display text-2xl tracking-widest`}>
      {elo} ELO
    </div>
  );
}

function MatchRow({ match }: { match: {
  id: string;
  opponentName: string;
  opponentId: string | null;
  myScore: number;
  opponentScore: number;
  won: boolean;
  eloChange: number;
  playedAt: string;
}}) {
  const date = new Date(match.playedAt);
  const timeAgo = (() => {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d ago`;
    if (hrs > 0) return `${hrs}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return "just now";
  })();

  return (
    <div className={`grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-4 py-3 border-b border-border/40 last:border-0 ${
      match.won ? "bg-green-500/5" : "bg-red-500/5"
    }`}>
      <div className={`w-2 h-8 ${match.won ? "bg-green-500" : "bg-red-500"}`} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-xs uppercase tracking-widest font-bold ${match.won ? "text-green-400" : "text-red-400"}`}>
            {match.won ? "WIN" : "LOSS"}
          </span>
          <span className="text-muted-foreground font-mono text-xs">vs</span>
          {match.opponentId ? (
            <Link href={`/profile/${match.opponentId}`} className="font-mono text-sm text-foreground hover:text-primary transition-colors truncate">
              {match.opponentName}
            </Link>
          ) : (
            <span className="font-mono text-sm text-foreground truncate">{match.opponentName}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-xs text-muted-foreground">{timeAgo}</span>
          <span className="text-muted-foreground/30">·</span>
          <span className="font-mono text-xs text-foreground">{match.myScore} — {match.opponentScore}</span>
        </div>
      </div>
      <div className={`flex items-center gap-1 font-mono text-sm font-bold ${
        match.eloChange > 0 ? "text-green-400" : match.eloChange < 0 ? "text-red-400" : "text-muted-foreground"
      }`}>
        {match.eloChange > 0 ? <TrendingUp className="w-3 h-3" /> : match.eloChange < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        {match.eloChange > 0 ? "+" : ""}{match.eloChange}
      </div>
      <div className="font-mono text-xs text-muted-foreground/50 hidden sm:block w-14 text-right">
        {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </div>
    </div>
  );
}

export default function Profile() {
  const { userId } = useParams<{ userId: string }>();
  const { data, isLoading, isError } = useGetUserProfile(userId ?? "");

  return (
    <div className="min-h-screen w-full bg-black flex flex-col relative overflow-hidden scanlines">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_10%,hsl(270,85%,20%),transparent)]" />
      </div>
      <div className="absolute inset-0 vignette z-10 pointer-events-none" />

      <div className="z-20 flex flex-col min-h-screen">
        <header className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
          <Link href="/leaderboard" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-mono text-sm uppercase tracking-widest">
            <ChevronLeft className="w-4 h-4" />
            Leaderboard
          </Link>
          <div className="flex items-center gap-3">
            <User className="w-5 h-5 text-primary" />
            <span className="font-display text-lg uppercase tracking-widest text-primary">Fighter Profile</span>
          </div>
          <div className="w-28" />
        </header>

        <div className="flex-1 px-4 md:px-8 py-8 max-w-2xl mx-auto w-full">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 pt-24">
              <Swords className="w-10 h-10 text-primary/40 animate-pulse" />
              <p className="font-mono text-muted-foreground uppercase tracking-widest text-sm">Loading fighter data...</p>
            </div>
          ) : isError || !data ? (
            <div className="flex flex-col items-center gap-4 pt-24">
              <Trophy className="w-10 h-10 text-destructive/40" />
              <p className="font-mono text-muted-foreground uppercase tracking-widest text-sm">Fighter not found</p>
              <Link href="/leaderboard" className="font-mono text-xs text-primary hover:underline">Back to leaderboard</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {/* Profile header */}
              <div className="flex flex-col items-center gap-4 pt-4">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center overflow-hidden">
                    {data.profileImageUrl ? (
                      <img src={data.profileImageUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <User className="w-10 h-10 text-primary" />
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <Swords className="w-3 h-3 text-primary-foreground" />
                  </div>
                </div>
                <div className="text-center">
                  <h1 className="font-display text-3xl uppercase tracking-widest text-foreground">{data.displayName}</h1>
                  <div className="mt-1">
                    <EloTier elo={data.eloRating} />
                  </div>
                </div>
                <EloBadge elo={data.eloRating} />
              </div>

              {/* Stats row */}
              <div className="flex justify-center gap-3 flex-wrap">
                <StatBox label="Wins" value={data.wins} color="text-green-400" />
                <StatBox label="Losses" value={data.losses} color="text-red-400" />
                <StatBox
                  label="Win Rate"
                  value={data.wins + data.losses > 0
                    ? `${Math.round((data.wins / (data.wins + data.losses)) * 100)}%`
                    : "—"}
                  color="text-primary"
                />
                <StatBox label="ELO" value={data.eloRating} color="text-foreground" />
              </div>

              {/* Recent matches */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span className="font-mono text-xs text-primary uppercase tracking-widest font-bold">Recent Matches</span>
                </div>
                {data.recentMatches.length === 0 ? (
                  <div className="border border-border px-6 py-10 flex flex-col items-center gap-2">
                    <Swords className="w-8 h-8 text-muted-foreground/30" />
                    <p className="font-mono text-sm text-muted-foreground">No matches recorded yet</p>
                    <p className="font-mono text-xs text-muted-foreground/60">Get in the arena to start building your record</p>
                  </div>
                ) : (
                  <div className="border border-border overflow-hidden">
                    {data.recentMatches.map(match => (
                      <MatchRow key={match.id} match={match} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
