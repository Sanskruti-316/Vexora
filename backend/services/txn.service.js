import { txnRepo } from "../db/txn.repo.js";

export const txnService = {
  async getTransactionAuditTrail() {
    return await txnRepo.getTransactions();
  },
};
