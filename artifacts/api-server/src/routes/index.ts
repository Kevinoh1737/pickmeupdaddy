import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import familyRouter from "./family";
import childrenRouter from "./children";
import placesRouter from "./places";
import timeSlotsRouter from "./time-slots";
import mobilityRouter from "./mobility";
import dashboardRouter from "./dashboard";
import sosRouter from "./sos";
import notificationsRouter from "./notifications";
import locationRouter from "./location";
import searchRouter from "./search";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(familyRouter);
router.use(childrenRouter);
router.use(placesRouter);
router.use(timeSlotsRouter);
router.use(mobilityRouter);
router.use(dashboardRouter);
router.use(sosRouter);
router.use(notificationsRouter);
router.use(locationRouter);
router.use(searchRouter);

export default router;
