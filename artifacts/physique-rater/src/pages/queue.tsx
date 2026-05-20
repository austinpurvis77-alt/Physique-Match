import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetGameStats } from "@workspace/api-client-react";

export default function Queue() {
  const [, setLocation] = useLocation();
  const { data: stats } = useGetGameStats();

  useEffect(() => {
    // In a real implementation this might wait for a socket event in the queue, 
    // but since the game component handles the socket join-queue itself according to the prompt,
    // we actually just redirect to /game immediately or let /game handle the queue.
    // The instructions say:
    // /queue - Waiting for opponent
    // /game - Main game screen.
    // "1. On mount, emit join-queue to socket" (in Game Screen)
    // Wait, if Game screen emits join-queue, then the queue logic is in Game Screen or Queue?
    // Let's redirect to /game after a brief delay so /game can mount and do join-queue,
    // OR we put the join-queue logic in /queue and redirect on match. 
    // The prompt says "The game screen is the heart of the app. It must be built as a self-contained component that manages all game state. Here's the complete logic: 1. On mount, emit join-queue to socket... 2. Listen for matched event..."
    // Okay, so /game handles the queue internally.
    // That means /queue might just be a visual pass-through, or /game is where they actually wait.
    // I will auto-redirect to /game so /game mounts and handles the real socket connection.
    const timer = setTimeout(() => {
      setLocation("/game");
    }, 1500);
    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-6">
      <div className="text-center space-y-8">
        
        <div className="relative inline-block">
          <div className="w-32 h-32 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center font-display text-4xl text-primary animate-pulse">
            VS
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-4xl font-display uppercase tracking-widest text-foreground">Matching Opponent</h2>
          <p className="text-muted-foreground font-mono">
            {stats?.playersOnline ? `${stats.playersOnline} fighters currently online` : "Connecting to arena network..."}
          </p>
        </div>

        <Link href="/" className="inline-block border-b-2 border-transparent hover:border-destructive text-destructive font-mono text-sm uppercase tracking-widest pb-1 transition-colors">
          Leave Queue
        </Link>
      </div>
    </div>
  );
}
