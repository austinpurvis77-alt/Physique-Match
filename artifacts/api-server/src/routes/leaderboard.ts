import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/leaderboard", async (_req: Request, res: Response): Promise<void> => {
  const users = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      profileImageUrl: usersTable.profileImageUrl,
      eloRating: usersTable.eloRating,
      wins: usersTable.wins,
      losses: usersTable.losses,
      activeCosmetic: usersTable.activeCosmetic,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.eloRating))
    .limit(50);

  const entries = users.map((u, i) => ({
    rank: i + 1,
    userId: u.id,
    displayName: [u.firstName, u.lastName].filter(Boolean).join(" ") || "Fighter",
    profileImageUrl: u.profileImageUrl ?? null,
    eloRating: u.eloRating,
    wins: u.wins,
    losses: u.losses,
    activeCosmetic: u.activeCosmetic ?? null,
  }));

  res.json({ entries });
});

export default router;
