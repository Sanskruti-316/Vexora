import { Router } from "express";
import { notificationController } from "../controllers/notification.controller.js";
import { auth } from "../middleware/auth.js";
import { h } from "../middleware/errorHandler.js";

const router = Router();

// FR9: Automated Low-Stock Monitoring Alerts
router.get("/notifications", auth("manager", "owner"), h(notificationController.getNotifications));
router.patch("/notifications/:id/read", auth("manager", "owner"), h(notificationController.markAsRead));

export default router;
