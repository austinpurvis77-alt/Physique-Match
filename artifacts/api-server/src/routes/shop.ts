import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const COSMETIC_COSTS: Record<string, number> = {
  challenger: 100,
  flash: 150,
  beast: 200,
  golden: 300,
  inferno: 400,
  king: 600,
};

const COSMETIC_IDS = Object.keys(COSMETIC_COSTS);

const router: IRouter = Router();

router.get("/shop", async (req: Request, res: Response): Promise<void> => {
  const sessionUser = (req.session as Record<string, unknown>)?.user as { id: string } | undefined;
  if (!sessionUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [dbUser] = await db
    .select({
      warmupPoints: usersTable.warmupPoints,
      ownedCosmetics: usersTable.ownedCosmetics,
      activeCosmetic: usersTable.activeCosmetic,
    })
    .from(usersTable)
    .where(eq(usersTable.id, sessionUser.id));

  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    balance: dbUser.warmupPoints,
    items: COSMETIC_IDS.map(id => ({
      id,
      name: id,
      cost: COSMETIC_COSTS[id]!,
      description: "",
    })),
    ownedCosmetics: dbUser.ownedCosmetics ?? [],
    activeCosmetic: dbUser.activeCosmetic ?? null,
  });
});

router.post("/shop/save-points", async (req: Request, res: Response): Promise<void> => {
  const sessionUser = (req.session as Record<string, unknown>)?.user as { id: string } | undefined;
  if (!sessionUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { points } = req.body as { points?: unknown };
  if (typeof points !== "number" || points < 0 || !Number.isFinite(points)) {
    res.status(400).json({ error: "Invalid points value" });
    return;
  }

  const earnedPoints = Math.floor(points);
  const [updated] = await db
    .update(usersTable)
    .set({ warmupPoints: sql`${usersTable.warmupPoints} + ${earnedPoints}` })
    .where(eq(usersTable.id, sessionUser.id))
    .returning({ warmupPoints: usersTable.warmupPoints });

  res.json({ balance: updated?.warmupPoints ?? 0 });
});

router.post("/shop/purchase/:cosmeticId", async (req: Request, res: Response): Promise<void> => {
  const sessionUser = (req.session as Record<string, unknown>)?.user as { id: string } | undefined;
  if (!sessionUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { cosmeticId } = req.params;
  const cost = COSMETIC_COSTS[cosmeticId];
  if (cost === undefined) {
    res.status(404).json({ error: "Cosmetic not found" });
    return;
  }

  const [dbUser] = await db
    .select({ warmupPoints: usersTable.warmupPoints, ownedCosmetics: usersTable.ownedCosmetics })
    .from(usersTable)
    .where(eq(usersTable.id, sessionUser.id));

  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if ((dbUser.ownedCosmetics ?? []).includes(cosmeticId)) {
    res.status(400).json({ error: "Already owned" });
    return;
  }

  if (dbUser.warmupPoints < cost) {
    res.status(400).json({ error: "Not enough warmup points" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      warmupPoints: sql`${usersTable.warmupPoints} - ${cost}`,
      ownedCosmetics: sql`array_append(${usersTable.ownedCosmetics}, ${cosmeticId}::text)`,
    })
    .where(eq(usersTable.id, sessionUser.id))
    .returning({ warmupPoints: usersTable.warmupPoints });

  res.json({ balance: updated?.warmupPoints ?? 0 });
});

router.post("/shop/equip/:cosmeticId", async (req: Request, res: Response): Promise<void> => {
  const sessionUser = (req.session as Record<string, unknown>)?.user as { id: string } | undefined;
  if (!sessionUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { cosmeticId } = req.params;

  if (cosmeticId !== "none") {
    const [dbUser] = await db
      .select({ ownedCosmetics: usersTable.ownedCosmetics })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUser.id));

    if (!dbUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (!(dbUser.ownedCosmetics ?? []).includes(cosmeticId)) {
      res.status(400).json({ error: "Cosmetic not owned" });
      return;
    }
  }

  const newActive = cosmeticId === "none" ? null : cosmeticId;
  await db
    .update(usersTable)
    .set({ activeCosmetic: newActive })
    .where(eq(usersTable.id, sessionUser.id));

  res.json({ activeCosmetic: newActive });
});

export default router;
