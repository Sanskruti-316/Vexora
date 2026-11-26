import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { auth } from "../middleware/auth.js";
import { h } from "../middleware/errorHandler.js";

const router = Router();

// FR1: Authentication & Access Control
router.post("/login", h(authController.login));
router.post("/auth/login", h(authController.login));

router.post("/register-owner", h(authController.registerOwner));
router.post("/auth/register-owner", h(authController.registerOwner));

router.get("/me", auth(), h(authController.me));
router.get("/auth/me", auth(), h(authController.me));

export default router;
