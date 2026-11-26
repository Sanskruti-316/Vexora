import { Router } from "express";
import authRoutes from "./auth.routes.js";
import timberRoutes from "./timber.routes.js";
import requestRoutes from "./request.routes.js";
import txnRoutes from "./txn.routes.js";
import wastageRoutes from "./wastage.routes.js";
import userRoutes from "./user.routes.js";
import notificationRoutes from "./notification.routes.js";

const apiRouter = Router();

// Health Check Endpoint
apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount Sub-routers
apiRouter.use(authRoutes);
apiRouter.use(timberRoutes);
apiRouter.use(requestRoutes);
apiRouter.use(txnRoutes);
apiRouter.use(wastageRoutes);
apiRouter.use(userRoutes);
apiRouter.use(notificationRoutes);

export default apiRouter;
