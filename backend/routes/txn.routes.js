import { Router } from "express";
import { txnController } from "../controllers/txn.controller.js";
import { auth } from "../middleware/auth.js";
import { h } from "../middleware/errorHandler.js";

const router = Router();

// FR5: Transaction History (Audit Trail)
router.get("/txns", auth("manager", "owner"), h(txnController.listTransactions));
router.get("/transactions", auth("manager", "owner"), h(txnController.listTransactions));

// Mutex Lock Simulation
router.post("/mutex/simulate", h(txnController.simulateMutex));

export default router;
