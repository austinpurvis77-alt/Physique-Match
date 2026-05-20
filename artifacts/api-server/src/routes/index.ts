import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gameRouter from "./game";
import authRouter from "./auth";
import leaderboardRouter from "./leaderboard";
import profileRouter from "./profile";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(leaderboardRouter);
router.use(profileRouter);
router.use(gameRouter);

export default router;
