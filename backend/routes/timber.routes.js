import { Router } from "express";
import { timberController } from "../controllers/timber.controller.js";
import { auth } from "../middleware/auth.js";
import { h } from "../middleware/errorHandler.js";

const router = Router();

// FR3: Dashboard analytics
router.get("/dashboard", auth("owner", "manager", "worker"), h(timberController.getDashboard));

// FR4: Timber Search, View, Sort, and Filter (DSA Pipeline)
router.get("/timber", auth("worker", "manager", "owner"), h(timberController.getTimber));
router.post("/timber/algorithms", auth("worker", "manager", "owner"), h(timberController.runAlgorithms));

// Min stock threshold update
router.patch("/timber/:id/min", auth("manager", "owner"), h(timberController.updateMinStock));

export default router;
