import { Router } from "express";
import { requestController } from "../controllers/request.controller.js";
import { auth } from "../middleware/auth.js";
import { h } from "../middleware/errorHandler.js";

const router = Router();

// FR2: Worker Allocation & Add Timber Requests
router.post("/requests", auth("worker", "manager", "owner"), h(requestController.submitRequest));
router.get("/requests", auth("manager", "owner", "worker"), h(requestController.listRequests));
router.post("/requests/:id/accept", auth("manager", "owner"), h(requestController.acceptRequest));
router.post("/requests/:id/reject", auth("manager", "owner"), h(requestController.rejectRequest));

export default router;
