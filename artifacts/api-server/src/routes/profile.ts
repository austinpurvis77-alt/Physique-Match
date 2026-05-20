import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, matchHistoryTable } from "@workspace/db";
import { eq, or, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/profile/:userId", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.params;

  const [user] = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
      eloRating: usersTable.eloRating,
      wins: usersTable.wins,
      losses: usersTable.losses,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const matches = await db
    .select({
      id: matchHistoryTable.id,
      player1Id: matchHistoryTable.player1Id,
      player2Id: matchHistoryTable.player2Id,
      winnerId: matchHistoryTable.winnerId,
      player1Score: matchHistoryTable.player1Score,
      player2Score: matchHistoryTable.player2Score,
      player1EloChange: matchHistoryTable.player1EloChange,
      player2EloChange: matchHistoryTable.player2EloChange,
      playedAt: matchHistoryTable.playedAt,
    })
    .from(matchHistoryTable)
    .where(or(
      eq(matchHistoryTable.player1Id, userId),
      eq(matchHistoryTable.player2Id, userId),
    ))
    .orderBy(desc(matchHistoryTable.playedAt))
    .limit(20);

  // Gather all opponent IDs to fetch names
  const opponentIds = matches
    .map(m => m.player1Id === userId ? m.player2Id : m.player1Id)
    .filter((id): id is string => !!id);
  const uniqueOpponentIds = [...new Set(opponentIds)];

  const opponentMap = new Map<string, string>();
  if (uniqueOpponentIds.length > 0) {
    const opponents = await db
      .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable)
      .where(or(...uniqueOpponentIds.map(id => eq(usersTable.id, id))));
    for (const opp of opponents) {
      opponentMap.set(opp.id, [opp.firstName, opp.lastName].filter(Boolean).join(" ") || "Fighter");
    }
  }

  const recentMatches = matches.map(m => {
    const isPlayer1 = m.player1Id === userId;
    const opponentId = isPlayer1 ? m.player2Id : m.player1Id;
    const myScore = isPlayer1 ? m.player1Score : m.player2Score;
    const opponentScore = isPlayer1 ? m.player2Score : m.player1Score;
    const eloChange = isPlayer1 ? m.player1EloChange : m.player2EloChange;
    return {
      id: m.id,
      opponentId: opponentId ?? null,
      opponentName: (opponentId ? opponentMap.get(opponentId) : null) ?? "Unknown Fighter",
      myScore,
      opponentScore,
      won: m.winnerId === userId,
      eloChange,
      playedAt: m.playedAt.toISOString(),
    };
  });

  res.json({
    userId: user.id,
    displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Fighter",
    profileImageUrl: user.profileImageUrl ?? null,
    eloRating: user.eloRating,
    wins: user.wins,
    losses: user.losses,
    recentMatches,
  });
});

export default router;
