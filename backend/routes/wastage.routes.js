import { Router } from "express";
import { wastageController } from "../controllers/wastage.controller.js";
import { auth } from "../middleware/auth.js";
import { h } from "../middleware/errorHandler.js";

const router = Router();

// FR6: Timber Wastage Management
router.get("/allocations/mine", auth("worker", "manager", "owner"), h(wastageController.getMyAllocations));
router.post("/wastage", auth("worker", "manager", "owner"), h(wastageController.recordWastage));
router.get("/wastage", auth("manager", "owner", "worker"), h(wastageController.getWastageLog));

export default router;
