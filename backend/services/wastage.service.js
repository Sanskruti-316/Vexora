import { wastageRepo } from "../db/wastage.repo.js";
import { pool, tx } from "../db/index.js";
import { posFloat } from "../middleware/validate.js";
import { notificationService } from "./notification.service.js";

export const wastageService = {
  async getMyAllocations(user) {
    return await wastageRepo.getWorkerAllocations(user.id, user.role);
  },

  async recordWastage({ qtyInput, reasonInput, allocation_id, timber_id, user }) {
    const qty = posFloat(qtyInput, "Wastage length in ft must be greater than 0");
    const reason = String(reasonInput || "").trim();

    if (!reason) {
      throw new Error("Reason for wastage is required");
    }
    if (/^\d+$/.test(reason)) {
      throw new Error("Reason must be text only. Numeric values are not allowed.");
    }
    if (!/^[a-zA-Z][a-zA-Z0-9\s,.'\-\/]{1,199}$/.test(reason) || /^\d/.test(reason) || !/[a-zA-Z]{2,}/.test(reason)) {
      throw new Error("Reason must be descriptive text only (e.g. End grain split, deep rot, knots, saw blade defect)");
    }

    const allocId = allocation_id ? Number(allocation_id) : null;
    const timbId = timber_id ? Number(timber_id) : null;

    if (!allocId && !timbId) {
      throw new Error("Please select the allocated timber item to record wastage");
    }

    await tx(async (client) => {
      if (pool.hasEnterpriseSchema) {
        let resolvedAllocId = allocId;
        let resolvedTimberId = timbId;

        if (allocId) {
          const allocItem = await wastageRepo.getAllocationItem({
            allocationId: allocId,
            workerId: user.id,
            role: user.role,
            client,
          });
          if (!allocItem) {
            throw new Error("Allocated timber record not found or not allocated to you");
          }
          resolvedTimberId = allocItem.timber_id;
          if (Number(allocItem.already_wasted || 0) > 0) {
            throw new Error(`Wastage has already been recorded for this allocated wood (Allocation #${resolvedAllocId}). A worker cannot allot wastage for a certain wood more than once.`);
          }
          const remainingUsable = Number(allocItem.allocated_qty) - Number(allocItem.already_wasted);
          if (qty > remainingUsable) {
            throw new Error(`Wastage quantity (${qty} ft) exceeds remaining allocated timber (${remainingUsable} ft)`);
          }
        } else {
          resolvedAllocId = await wastageRepo.findAvailableAllocationForTimber({
            timberId: timbId,
            workerId: user.id,
            role: user.role,
            client,
          });

          if (!resolvedAllocId) {
            const hasPrev = await wastageRepo.checkPreviousWastageAllocated({
              timberId: timbId,
              workerId: user.id,
              role: user.role,
              client,
            });
            if (hasPrev) {
              throw new Error("Wastage has already been recorded for this wood. A worker cannot allot wastage for a certain wood more than once.");
            }

            resolvedAllocId = await wastageRepo.createAutoAllocationForWastage({
              timberId: timbId,
              workerId: user.id,
              qty,
              role: user.role,
              client,
            });
          }
        }

        await wastageRepo.recordEnterpriseWastage({
          resolvedTimberId,
          resolvedAllocId,
          qty,
          reason,
          user,
          client,
        });

        await notificationService.checkLowStock(client);
      } else {
        await wastageRepo.recordStandardWastage({
          timberId: timbId,
          qty,
          reason,
          user,
          client,
        });

        await notificationService.checkLowStock(client);
      }
    });

    return { message: "Timber wastage recorded and accounted for successfully" };
  },

  async getWastageLog(user) {
    const isWorker = user.role === "worker";
    let targetOwnerId = null;
    if (user.role === "owner") {
      targetOwnerId = user.id;
    } else if (user.role === "manager") {
      targetOwnerId = await userRepo.getActiveOwnerId(user);
    }

    return await wastageRepo.getWastageLogs({
      isWorker,
      userId: user.id,
      targetOwnerId,
    });
  },
};
