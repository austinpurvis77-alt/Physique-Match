import { Link } from "wouter";
import { useGetLeaderboard, useGetActiveRooms } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Trophy, ChevronLeft, Crown, Shield, Swords, LogIn, Eye, Radio } from "lucide-react";

const RANK_COLORS = ["text-yellow-400", "text-slate-300", "text-amber-600"];

function EloTier({ elo }: { elo: number }) {
  if (elo >= 1400) return <span className="text-yellow-400 font-mono text-xs uppercase tracking-widest">Champion</span>;
  if (elo >= 1200) return <span className="text-purple-400 font-mono text-xs uppercase tracking-widest">Elite</span>;
  if (elo >= 1100) return <span className="text-blue-400 font-mono text-xs uppercase tracking-widest">Seasoned</span>;
  if (elo >= 1000) return <span className="text-green-400 font-mono text-xs uppercase tracking-widest">Contender</span>;
  return <span className="text-muted-foreground font-mono text-xs uppercase tracking-widest">Rookie</span>;
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-500/15 border border-red-500/40 rounded-sm">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
      </span>
      <span className="font-mono text-[9px] text-red-400 uppercase tracking-widest font-bold">Live</span>
    </span>
  );
}

export default function Leaderboard() {
  const { data, isLoading } = useGetLeaderboard();
  const { data: activeRoomsData } = useGetActiveRooms({ query: { refetchInterval: 5000 } });
  const { user, isAuthenticated, login } = useAuth();

  const entries = data?.entries ?? [];
  const activeRooms = activeRoomsData?.rooms ?? [];

  // Build lookup: userId -> roomId for players in active matches
  const liveUserRoomMap = new Map<string, string>();
  for (const room of activeRooms) {
    for (const player of room.players) {
      if (player.userId) liveUserRoomMap.set(player.userId, room.roomId);
    }
  }

  return (
    <div className="min-h-screen w-full bg-black flex flex-col relative overflow-hidden scanlines">
      {/* Background glow */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_10%,hsl(270,85%,20%),transparent)]" />
      </div>
      <div className="absolute inset-0 vignette z-10 pointer-events-none" />

      <div className="z-20 flex flex-col min-h-screen">
        {/* Header */}
        <header className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-mono text-sm uppercase tracking-widest">
            <ChevronLeft className="w-4 h-4" />
            Arena
          </Link>
          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-primary" />
            <h1 className="font-[family-name:--app-font-display] text-2xl text-white tracking-widest uppercase">
              Hall of Gains
            </h1>
          </div>
          <div className="w-24" />
        </header>

        {/* Active matches banner */}
        {activeRooms.length > 0 && (
          <div className="border-b border-red-500/20 bg-red-500/5 px-6 py-3">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                <span className="font-mono text-xs text-red-400 uppercase tracking-widest font-bold">
                  {activeRooms.length} Live {activeRooms.length === 1 ? "Match" : "Matches"}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {activeRooms.map((room) => (
                  <Link
                    key={room.roomId}
                    href={`/spectate/${encodeURIComponent(room.roomId)}`}
                    className="flex items-center gap-2 border border-red-500/30 bg-red-500/10 px-3 py-2 hover:border-red-500/60 hover:bg-red-500/20 transition-colors group"
                  >
                    <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                    </span>
                    <span className="font-mono text-xs text-foreground font-bold">
                      {room.players[0]?.name ?? "?"} <span className="text-muted-foreground font-normal">vs</span> {room.players[1]?.name ?? "?"}
                    </span>
                    <span className="font-[family-name:--app-font-display] text-xs text-red-400 tabular-nums">
                      {room.players[0]?.score} — {room.players[1]?.score}
                    </span>
                    {room.spectatorCount > 0 && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Eye className="w-3 h-3" />
                        <span className="font-mono text-[10px]">{room.spectatorCount}</span>
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-red-400 uppercase tracking-wider group-hover:text-red-300">
                      Watch →
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top 3 podium */}
        {!isLoading && entries.length >= 3 && (
          <div className="flex items-end justify-center gap-4 px-6 pt-10 pb-6">
            {/* 2nd */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative w-14 h-14 rounded-full border-2 border-slate-300 bg-slate-300/10 flex items-center justify-center overflow-hidden">
                {entries[1]?.profileImageUrl
                  ? <img src={entries[1].profileImageUrl} className="w-full h-full object-cover" alt="" />
                  : <Shield className="w-6 h-6 text-slate-300" />}
                {entries[1] && liveUserRoomMap.has(entries[1].userId) && (
                  <div className="absolute -top-1 -right-1"><LiveBadge /></div>
                )}
              </div>
              <div className="text-slate-300 font-mono text-xs">{entries[1]?.displayName}</div>
              <div className="text-slate-300 font-display text-2xl">{entries[1]?.eloRating}</div>
              {entries[1] && liveUserRoomMap.has(entries[1].userId) && (
                <Link href={`/spectate/${encodeURIComponent(liveUserRoomMap.get(entries[1].userId)!)}`}
                  className="flex items-center gap-1 border border-red-500/40 text-red-400 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider hover:bg-red-500/10 transition-colors">
                  <Eye className="w-2.5 h-2.5" /> Watch
                </Link>
              )}
              <div className="bg-slate-300/20 border border-slate-300/40 w-20 h-16 flex items-end justify-center pb-2">
                <span className="font-display text-slate-300 text-3xl">2</span>
              </div>
            </div>
            {/* 1st */}
            <div className="flex flex-col items-center gap-2">
              <Crown className="w-6 h-6 text-yellow-400 mb-1" />
              <div className="relative w-18 h-18 rounded-full border-2 border-yellow-400 bg-yellow-400/10 flex items-center justify-center overflow-hidden" style={{ width: 72, height: 72 }}>
                {entries[0]?.profileImageUrl
                  ? <img src={entries[0].profileImageUrl} className="w-full h-full object-cover" alt="" />
                  : <Shield className="w-8 h-8 text-yellow-400" />}
                {entries[0] && liveUserRoomMap.has(entries[0].userId) && (
                  <div className="absolute -top-1 -right-1"><LiveBadge /></div>
                )}
              </div>
              <div className="text-yellow-400 font-mono text-xs">{entries[0]?.displayName}</div>
              <div className="text-yellow-400 font-display text-3xl glow-text">{entries[0]?.eloRating}</div>
              {entries[0] && liveUserRoomMap.has(entries[0].userId) && (
                <Link href={`/spectate/${encodeURIComponent(liveUserRoomMap.get(entries[0].userId)!)}`}
                  className="flex items-center gap-1 border border-red-500/40 text-red-400 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider hover:bg-red-500/10 transition-colors">
                  <Eye className="w-2.5 h-2.5" /> Watch
                </Link>
              )}
              <div className="bg-yellow-400/20 border border-yellow-400/40 w-20 h-24 flex items-end justify-center pb-2">
                <span className="font-display text-yellow-400 text-4xl">1</span>
              </div>
            </div>
            {/* 3rd */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative w-14 h-14 rounded-full border-2 border-amber-600 bg-amber-600/10 flex items-center justify-center overflow-hidden">
                {entries[2]?.profileImageUrl
                  ? <img src={entries[2].profileImageUrl} className="w-full h-full object-cover" alt="" />
                  : <Shield className="w-6 h-6 text-amber-600" />}
                {entries[2] && liveUserRoomMap.has(entries[2].userId) && (
                  <div className="absolute -top-1 -right-1"><LiveBadge /></div>
                )}
              </div>
              <div className="text-amber-600 font-mono text-xs">{entries[2]?.displayName}</div>
              <div className="text-amber-600 font-display text-2xl">{entries[2]?.eloRating}</div>
              {entries[2] && liveUserRoomMap.has(entries[2].userId) && (
                <Link href={`/spectate/${encodeURIComponent(liveUserRoomMap.get(entries[2].userId)!)}`}
                  className="flex items-center gap-1 border border-red-500/40 text-red-400 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider hover:bg-red-500/10 transition-colors">
                  <Eye className="w-2.5 h-2.5" /> Watch
                </Link>
              )}
              <div className="bg-amber-600/20 border border-amber-600/40 w-20 h-12 flex items-end justify-center pb-2">
                <span className="font-display text-amber-600 text-3xl">3</span>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 px-4 md:px-8 pb-12 max-w-3xl mx-auto w-full">
          {/* Auth prompt */}
          {!isAuthenticated && (
            <div className="mb-6 flex items-center justify-between border border-primary/30 bg-primary/5 px-5 py-4">
              <div className="font-mono text-sm text-muted-foreground">
                Log in to appear on the leaderboard and track your ELO
              </div>
              <button
                onClick={login}
                className="flex items-center gap-2 border border-primary px-4 py-2 font-mono text-sm text-primary uppercase tracking-wider hover:bg-primary/10 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Log In
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center gap-4 pt-16">
              <Swords className="w-10 h-10 text-primary/40 animate-pulse" />
              <p className="font-mono text-muted-foreground uppercase tracking-widest text-sm">Loading rankings...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-4 pt-16">
              <Trophy className="w-10 h-10 text-primary/40" />
              <p className="font-mono text-muted-foreground uppercase tracking-widest text-sm">No ranked fighters yet</p>
              <p className="font-mono text-muted-foreground/60 text-xs">Be the first to claim glory</p>
            </div>
          ) : (
            <div className="border border-border">
              {/* Column headers */}
              <div className="grid grid-cols-[3rem_1fr_auto_auto_auto_auto] gap-3 px-4 py-3 border-b border-border bg-secondary/30">
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest text-center">#</span>
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Fighter</span>
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest text-right">ELO</span>
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest text-right">W</span>
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest text-right">L</span>
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest text-right">Live</span>
              </div>

              {entries.map((entry, i) => {
                const isMe = user?.id === entry.userId;
                const liveRoomId = liveUserRoomMap.get(entry.userId);
                return (
                  <div
                    key={entry.userId}
                    className={`grid grid-cols-[3rem_1fr_auto_auto_auto_auto] gap-3 items-center px-4 py-3 border-b border-border/40 last:border-0 transition-colors ${
                      liveRoomId ? "bg-red-500/5" : isMe ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/20"
                    }`}
                  >
                    {/* Rank */}
                    <span className={`font-display text-xl text-center ${RANK_COLORS[i] ?? "text-muted-foreground"}`}>
                      {i < 3 ? ["①", "②", "③"][i] : entry.rank}
                    </span>

                    {/* Fighter */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full border border-border flex-shrink-0 overflow-hidden bg-secondary/50">
                        {entry.profileImageUrl
                          ? <img src={entry.profileImageUrl} className="w-full h-full object-cover" alt="" />
                          : <div className="w-full h-full flex items-center justify-center text-primary font-display text-sm">{entry.displayName[0]}</div>}
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-sm truncate">
                          <Link href={`/profile/${entry.userId}`} className="text-foreground hover:text-primary transition-colors">
                            {entry.displayName}
                          </Link>
                          {isMe && <span className="ml-2 text-primary text-xs">(you)</span>}
                        </div>
                        <EloTier elo={entry.eloRating} />
                      </div>
                    </div>

                    {/* ELO */}
                    <span className={`font-display text-lg tabular-nums ${RANK_COLORS[i] ?? "text-foreground"}`}>
                      {entry.eloRating}
                    </span>

                    {/* Wins */}
                    <span className="font-mono text-sm text-green-400 tabular-nums text-right">{entry.wins}</span>

                    {/* Losses */}
                    <span className="font-mono text-sm text-destructive tabular-nums text-right">{entry.losses}</span>

                    {/* Watch button / Live badge */}
                    <div className="flex justify-end">
                      {liveRoomId ? (
                        <Link
                          href={`/spectate/${encodeURIComponent(liveRoomId)}`}
                          className="flex items-center gap-1 border border-red-500/50 text-red-400 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-red-500/15 transition-colors whitespace-nowrap"
                        >
                          <Eye className="w-2.5 h-2.5" />
                          Watch
                        </Link>
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground/30">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
