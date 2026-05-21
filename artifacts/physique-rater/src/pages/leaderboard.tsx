import { useState } from "react";
import { Link } from "wouter";
import {
  useGetLeaderboard,
  useGetShop,
  usePurchaseCosmetic,
  useEquipCosmetic,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Trophy, ChevronLeft, Crown, Shield, Swords, LogIn, ShoppingBag, X, Zap, Check } from "lucide-react";
import { COSMETICS, renderName } from "../lib/cosmetics";

const RANK_COLORS = ["text-yellow-400", "text-slate-300", "text-amber-600"];

interface TierDef {
  label: string;
  icon: string;
  textClass: string;
  borderClass: string;
  bgClass: string;
  minElo: number;
}

const TIERS: TierDef[] = [
  { label: "OVERLORD",  icon: "👑", minElo: 1600, textClass: "text-yellow-300",  borderClass: "border-yellow-400/70", bgClass: "bg-yellow-400/10" },
  { label: "CHAMPION",  icon: "⚔️", minElo: 1400, textClass: "text-yellow-400",  borderClass: "border-yellow-500/60", bgClass: "bg-yellow-500/10" },
  { label: "ELITE",     icon: "💎", minElo: 1200, textClass: "text-purple-300",  borderClass: "border-purple-400/60", bgClass: "bg-purple-500/10" },
  { label: "VETERAN",   icon: "🔱", minElo: 1050, textClass: "text-blue-300",    borderClass: "border-blue-400/60",   bgClass: "bg-blue-500/10"   },
  { label: "CONTENDER", icon: "⚡", minElo:  950, textClass: "text-green-400",   borderClass: "border-green-500/60",  bgClass: "bg-green-500/10"  },
  { label: "FIGHTER",   icon: "🥊", minElo:    0, textClass: "text-orange-400",  borderClass: "border-orange-500/50", bgClass: "bg-orange-500/10" },
];

export function getTier(elo: number): TierDef {
  return TIERS.find(t => elo >= t.minElo) ?? TIERS[TIERS.length - 1]!;
}

function EloTier({ elo, compact = false }: { elo: number; compact?: boolean }) {
  const tier = getTier(elo);
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border text-[10px] font-mono uppercase tracking-widest ${tier.textClass} ${tier.borderClass} ${tier.bgClass}`}>
        {tier.icon} {tier.label}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border font-mono text-xs uppercase tracking-widest ${tier.textClass} ${tier.borderClass} ${tier.bgClass}`}>
      {tier.icon} {tier.label}
    </span>
  );
}

function ShopModal({ onClose }: { onClose: () => void }) {
  const { isAuthenticated, login } = useAuth();
  const { data: shopData, refetch: refetchShop } = useGetShop({
    query: { enabled: isAuthenticated },
  });
  const { refetch: refetchLeaderboard } = useGetLeaderboard();

  const purchaseMutation = usePurchaseCosmetic({
    mutation: {
      onSuccess: () => {
        void refetchShop();
        void refetchLeaderboard();
      },
    },
  });
  const equipMutation = useEquipCosmetic({
    mutation: {
      onSuccess: () => {
        void refetchShop();
        void refetchLeaderboard();
      },
    },
  });

  const balance = shopData?.balance ?? 0;
  const owned = shopData?.ownedCosmetics ?? [];
  const active = shopData?.activeCosmetic ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-black border-2 border-primary/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-primary/5">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <h2 className="font-[family-name:--app-font-display] text-xl text-white tracking-widest uppercase">
              Warmup Shop
            </h2>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated && (
              <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 px-3 py-1">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="font-display text-lg text-primary leading-none">{balance}</span>
                <span className="font-mono text-xs text-muted-foreground ml-0.5">pts</span>
              </div>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!isAuthenticated ? (
          <div className="flex flex-col items-center gap-4 py-12 px-6 text-center">
            <ShoppingBag className="w-12 h-12 text-primary/40" />
            <p className="font-mono text-sm text-muted-foreground">Log in to spend your warmup points on cosmetics</p>
            <button
              onClick={login}
              className="flex items-center gap-2 border border-primary px-6 py-2 font-mono text-sm text-primary uppercase tracking-wider hover:bg-primary/10 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Log In
            </button>
          </div>
        ) : (
          <div className="p-4 max-h-[60vh] overflow-y-auto space-y-3">
            {/* Active cosmetic strip */}
            {active && (
              <div className="flex items-center justify-between bg-primary/10 border border-primary/30 px-4 py-2 mb-4">
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Active</span>
                <span className={`font-mono text-sm ${COSMETICS.find(c => c.id === active)?.nameClass ?? ""}`}>
                  {COSMETICS.find(c => c.id === active)?.name}
                </span>
                <button
                  onClick={() => equipMutation.mutate({ cosmeticId: "none" })}
                  disabled={equipMutation.isPending}
                  className="font-mono text-xs text-muted-foreground hover:text-destructive uppercase tracking-widest transition-colors"
                >
                  Remove
                </button>
              </div>
            )}

            {COSMETICS.map(cosmetic => {
              const isOwned = owned.includes(cosmetic.id);
              const isActive = active === cosmetic.id;
              const canAfford = balance >= cosmetic.cost;

              return (
                <div
                  key={cosmetic.id}
                  className={`flex items-center justify-between border px-4 py-3 transition-colors ${
                    isActive
                      ? "border-primary/60 bg-primary/10"
                      : isOwned
                      ? "border-border/60 bg-secondary/20"
                      : "border-border/30 bg-secondary/10"
                  }`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className={`font-mono text-sm font-medium ${cosmetic.nameClass}`}>
                      {cosmetic.prefix ?? ""}{cosmetic.name}{cosmetic.suffix ?? ""}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{cosmetic.description}</span>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    {isOwned ? (
                      <button
                        onClick={() => equipMutation.mutate({ cosmeticId: isActive ? "none" : cosmetic.id })}
                        disabled={equipMutation.isPending}
                        className={`flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest px-3 py-1.5 border transition-colors ${
                          isActive
                            ? "border-primary text-primary bg-primary/10 hover:bg-primary/20"
                            : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                        }`}
                      >
                        {isActive && <Check className="w-3 h-3" />}
                        {isActive ? "Equipped" : "Equip"}
                      </button>
                    ) : (
                      <button
                        onClick={() => purchaseMutation.mutate({ cosmeticId: cosmetic.id })}
                        disabled={!canAfford || purchaseMutation.isPending}
                        className={`flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest px-3 py-1.5 border transition-colors ${
                          canAfford
                            ? "border-primary text-primary hover:bg-primary hover:text-black"
                            : "border-border/30 text-muted-foreground/40 cursor-not-allowed"
                        }`}
                      >
                        <Zap className="w-3 h-3" />
                        {cosmetic.cost}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <p className="font-mono text-xs text-muted-foreground/50 text-center pt-2 pb-1">
              Earn warmup points by hitting targets while in queue
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const { data, isLoading, refetch: refetchLeaderboard } = useGetLeaderboard();
  const { user, isAuthenticated, login } = useAuth();
  const [showShop, setShowShop] = useState(false);

  const entries = data?.entries ?? [];

  return (
    <div className="min-h-screen w-full bg-black flex flex-col relative overflow-hidden scanlines">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_10%,hsl(270,85%,20%),transparent)]" />
      </div>
      <div className="absolute inset-0 vignette z-10 pointer-events-none" />

      {showShop && (
        <ShopModal
          onClose={() => {
            setShowShop(false);
            void refetchLeaderboard();
          }}
        />
      )}

      <div className="z-20 flex flex-col min-h-screen">
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
          <button
            onClick={() => setShowShop(true)}
            className="flex items-center gap-2 border border-primary/50 bg-primary/5 px-4 py-2 font-mono text-xs text-primary uppercase tracking-widest hover:bg-primary/15 transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            Shop
          </button>
        </header>

        {!isLoading && entries.length >= 3 && (
          <div className="flex items-end justify-center gap-4 px-6 pt-10 pb-6">
            {/* 2nd */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full border-2 border-slate-300 bg-slate-300/10 flex items-center justify-center overflow-hidden">
                {entries[1]?.profileImageUrl
                  ? <img src={entries[1].profileImageUrl} className="w-full h-full object-cover" alt="" />
                  : <Shield className="w-6 h-6 text-slate-300" />}
              </div>
              {(() => {
                const { name, nameClass } = renderName(entries[1]?.displayName ?? "", entries[1]?.activeCosmetic);
                return <div className={`font-mono text-xs text-center max-w-[80px] truncate ${nameClass || "text-slate-300"}`}>{name}</div>;
              })()}
              <EloTier elo={entries[1]?.eloRating ?? 0} compact />
              <div className="text-slate-300 font-display text-2xl">{entries[1]?.eloRating}</div>
              <div className="bg-slate-300/20 border border-slate-300/40 w-20 h-16 flex items-end justify-center pb-2">
                <span className="font-display text-slate-300 text-3xl">2</span>
              </div>
            </div>
            {/* 1st */}
            <div className="flex flex-col items-center gap-1.5">
              <Crown className="w-6 h-6 text-yellow-400 mb-1" />
              <div className="w-18 h-18 rounded-full border-2 border-yellow-400 bg-yellow-400/10 flex items-center justify-center overflow-hidden" style={{ width: 72, height: 72 }}>
                {entries[0]?.profileImageUrl
                  ? <img src={entries[0].profileImageUrl} className="w-full h-full object-cover" alt="" />
                  : <Shield className="w-8 h-8 text-yellow-400" />}
              </div>
              {(() => {
                const { name, nameClass } = renderName(entries[0]?.displayName ?? "", entries[0]?.activeCosmetic);
                return <div className={`font-mono text-xs text-center max-w-[90px] truncate ${nameClass || "text-yellow-400"}`}>{name}</div>;
              })()}
              <EloTier elo={entries[0]?.eloRating ?? 0} compact />
              <div className="text-yellow-400 font-display text-3xl glow-text">{entries[0]?.eloRating}</div>
              <div className="bg-yellow-400/20 border border-yellow-400/40 w-20 h-24 flex items-end justify-center pb-2">
                <span className="font-display text-yellow-400 text-4xl">1</span>
              </div>
            </div>
            {/* 3rd */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full border-2 border-amber-600 bg-amber-600/10 flex items-center justify-center overflow-hidden">
                {entries[2]?.profileImageUrl
                  ? <img src={entries[2].profileImageUrl} className="w-full h-full object-cover" alt="" />
                  : <Shield className="w-6 h-6 text-amber-600" />}
              </div>
              {(() => {
                const { name, nameClass } = renderName(entries[2]?.displayName ?? "", entries[2]?.activeCosmetic);
                return <div className={`font-mono text-xs text-center max-w-[80px] truncate ${nameClass || "text-amber-600"}`}>{name}</div>;
              })()}
              <EloTier elo={entries[2]?.eloRating ?? 0} compact />
              <div className="text-amber-600 font-display text-2xl">{entries[2]?.eloRating}</div>
              <div className="bg-amber-600/20 border border-amber-600/40 w-20 h-12 flex items-end justify-center pb-2">
                <span className="font-display text-amber-600 text-3xl">3</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 px-4 md:px-8 pb-12 max-w-3xl mx-auto w-full">
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
              <div className="grid grid-cols-[3rem_1fr_auto_auto_auto] gap-4 px-4 py-3 border-b border-border bg-secondary/30">
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest text-center">#</span>
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Fighter</span>
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest text-right">ELO</span>
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest text-right">W</span>
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest text-right">L</span>
              </div>

              {entries.map((entry, i) => {
                const isMe = user?.id === entry.userId;
                const { name: displayedName, nameClass } = renderName(entry.displayName, entry.activeCosmetic);
                return (
                  <div
                    key={entry.userId}
                    className={`grid grid-cols-[3rem_1fr_auto_auto_auto] gap-4 items-center px-4 py-3 border-b border-border/40 last:border-0 transition-colors ${isMe ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-secondary/20"}`}
                  >
                    <span className={`font-display text-xl text-center ${RANK_COLORS[i] ?? "text-muted-foreground"}`}>
                      {i < 3 ? ["①", "②", "③"][i] : entry.rank}
                    </span>

                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full border border-border flex-shrink-0 overflow-hidden bg-secondary/50">
                        {entry.profileImageUrl
                          ? <img src={entry.profileImageUrl} className="w-full h-full object-cover" alt="" />
                          : <div className="w-full h-full flex items-center justify-center text-primary font-display text-sm">{entry.displayName[0]}</div>}
                      </div>
                      <div className="min-w-0">
                        <div className={`font-mono text-sm truncate ${nameClass || "text-foreground"}`}>
                          {displayedName}
                          {isMe && <span className="ml-2 text-primary text-xs font-mono">(you)</span>}
                        </div>
                        <EloTier elo={entry.eloRating} />
                      </div>
                    </div>

                    <span className={`font-display text-lg tabular-nums ${RANK_COLORS[i] ?? "text-foreground"}`}>
                      {entry.eloRating}
                    </span>
                    <span className="font-mono text-sm text-green-400 tabular-nums text-right">{entry.wins}</span>
                    <span className="font-mono text-sm text-destructive tabular-nums text-right">{entry.losses}</span>
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
