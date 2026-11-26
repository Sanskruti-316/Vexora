import { txnService } from "../services/txn.service.js";
import { mutexService } from "../services/mutex.service.js";

export const txnController = {
  async listTransactions(req, res) {
    const txns = await txnService.getTransactionAuditTrail();
    res.json(txns);
  },

  async simulateMutex(req, res) {
    const outcome = await mutexService.simulateAllocationRace(req.body);
    res.json(outcome);
  },
};
