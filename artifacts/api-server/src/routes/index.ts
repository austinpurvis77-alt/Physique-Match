import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gameRouter from "./game";
import authRouter from "./auth";
import leaderboardRouter from "./leaderboard";
<<<<<<< HEAD
import shopRouter from "./shop";
=======
import profileRouter from "./profile";
>>>>>>> 90b1df41547601588f4525bd0ecfb8d42d0c5ea3

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(leaderboardRouter);
<<<<<<< HEAD
router.use(shopRouter);
=======
router.use(profileRouter);
>>>>>>> 90b1df41547601588f4525bd0ecfb8d42d0c5ea3
router.use(gameRouter);

export default router;
