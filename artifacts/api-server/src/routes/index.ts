import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gameRouter from "./game";
import authRouter from "./auth";
import leaderboardRouter from "./leaderboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(leaderboardRouter);
router.use(gameRouter);

export default router;
