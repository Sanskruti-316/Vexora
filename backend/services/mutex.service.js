import { StockMutexLock } from "../algorithms.js";

export const mutexService = {
  async simulateAllocationRace(body = {}) {
    const totalUnits = Number(body.initial_stock || 20);
    const workerRequests = Array.isArray(body.requests) && body.requests.length > 0
      ? body.requests
      : [
        { worker: "Worker 1", qty: 17 },
        { worker: "Worker 2", qty: 3 },
        { worker: "Worker 3", qty: 20 },
      ];

    const testMutex = new StockMutexLock();
    let currentStock = totalUnits;
    let allocatedTotal = 0;
    const timeline = [];

    const results = await Promise.all(
      workerRequests.map(async (reqItem, index) => {
        const workerName = reqItem.worker || `Worker ${index + 1}`;
        const requestedQty = Number(reqItem.qty || reqItem);

        const startTime = Date.now();
        timeline.push({
          time: new Date().toISOString(),
          worker: workerName,
          status: "Waiting for Mutex Lock",
          requested: requestedQty,
        });

        return await testMutex.withLock("simulated_stock_item", async () => {
          const lockAcquiredTime = Date.now();
          timeline.push({
            time: new Date().toISOString(),
            worker: workerName,
            status: "Lock Acquired",
            currentStock,
            requested: requestedQty,
          });

          await new Promise((resolve) => setTimeout(resolve, 30));

          if (requestedQty <= currentStock) {
            currentStock -= requestedQty;
            allocatedTotal += requestedQty;
            const outcome = {
              worker: workerName,
              requested: requestedQty,
              granted: true,
              allocated: requestedQty,
              stockRemaining: currentStock,
              waitTimeMs: lockAcquiredTime - startTime,
              message: `Granted ${requestedQty} units under Mutex Lock. Stock remaining: ${currentStock}.`,
            };
            timeline.push({
              time: new Date().toISOString(),
              worker: workerName,
              status: "Granted & Released Lock",
              remaining: currentStock,
            });
            return outcome;
          } else {
            const outcome = {
              worker: workerName,
              requested: requestedQty,
              granted: false,
              allocated: 0,
              stockRemaining: currentStock,
              waitTimeMs: lockAcquiredTime - startTime,
              error: `Mutex Lock Rejected: Requested ${requestedQty} units exceeds available stock of ${currentStock} units (${allocatedTotal} units already allocated out of ${totalUnits}).`,
            };
            timeline.push({
              time: new Date().toISOString(),
              worker: workerName,
              status: "Rejected & Released Lock",
              remaining: currentStock,
            });
            return outcome;
          }
        });
      })
    );

    return {
      initialStock: totalUnits,
      totalAllocated: allocatedTotal,
      finalStockRemaining: currentStock,
      maxStockLimitEnforced: allocatedTotal <= totalUnits,
      workerResults: results,
      timeline,
      summary: `Out of ${totalUnits} initial units, exactly ${allocatedTotal} units allocated. Over-allocation was prevented by Mutex Lock.`,
    };
  },
};
