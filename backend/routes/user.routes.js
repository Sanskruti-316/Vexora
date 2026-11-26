import { Router } from "express";
import { userController } from "../controllers/user.controller.js";
import { auth } from "../middleware/auth.js";
import { h } from "../middleware/errorHandler.js";

const router = Router();

// FR7 & FR8: Account Management (Owners manage Managers & Workers; Managers manage Workers)
router.get("/users", auth("owner", "manager"), h(userController.listUsers));
router.post("/users", auth("owner", "manager"), h(userController.createUser));
router.delete("/users/:id", auth("owner", "manager"), h(userController.deleteUser));

export default router;
