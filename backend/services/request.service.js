import { requestRepo } from "../db/request.repo.js";
import { timberRepo } from "../db/timber.repo.js";
import { tx } from "../db/index.js";
import { posInt } from "../middleware/validate.js";
import { stockMutex } from "../algorithms.js";
import { notificationService } from "./notification.service.js";

export const requestService = {
  async submitRequest({ kind, timber_id, type, size, price, qtyInput, user }) {
    const qty = posInt(qtyInput, "Requested quantity must be greater than zero");

    if (kind === "allocate") {
      // Enforce Mutex Lock for this timber record to serialize allocation requests and prevent race conditions
      return await stockMutex.withLock(timber_id, async () => {
        const item = await timberRepo.findTimberById(timber_id);
        if (!item) {
          const err = new Error("Timber item not found");
          err.status = 404;
          throw err;
        }

        const physicalStock = Number(item.qty ?? item.quantity ?? 0);
        const pendingQty = await requestRepo.getPendingAllocationQuantity(timber_id);
        const availableUnreserved = Math.max(0, physicalStock - pendingQty);

        if (qty > availableUnreserved) {
          const err = new Error(
            `Cannot allocate ${qty} units: Mutex Lock enforced. Only ${availableUnreserved} unreserved units available (${pendingQty} units already reserved out of ${physicalStock} in stock).`
          );
          err.status = 400;
          throw err;
        }

        await requestRepo.createAllocationRequest({
          workerId: user.id,
          timberId: timber_id,
          qty,
          type: item.type,
          size: item.size,
        });

        return {
          message: "Request submitted successfully",
          reservedQty: qty,
          remainingUnreserved: availableUnreserved - qty,
          mutexLocked: true,
        };
      });
    } else if (kind === "add") {
      const cleanType = String(type || "").trim();
      if (!cleanType) {
        throw new Error("Timber species / type is required");
      }
      if (/^\d+$/.test(cleanType)) {
        throw new Error("Timber species name cannot be numeric. Please enter a valid wood name (e.g. Teak, Rosewood, Pine, Oak, Cedar)");
      }
      if (!/^[a-zA-Z][a-zA-Z0-9\s\-]{1,49}$/.test(cleanType)) {
        throw new Error("Timber species name must start with a letter and contain valid characters (e.g. Teak, Rosewood)");
      }

      const cleanSize = String(size || "").trim();
      const sizeMatch = cleanSize.match(/^(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*(?:ft|in|m)?)?$/);
      if (!sizeMatch) {
        throw new Error("Invalid timber dimensions. Format must be Diameter x Length with positive numbers (e.g. 4x10 or 12x32)");
      }
      const diam = parseFloat(sizeMatch[1]);
      const len = parseFloat(sizeMatch[2]);
      if (isNaN(diam) || isNaN(len) || diam <= 0 || len <= 0) {
        throw new Error("Timber dimensions (diameter and length) must be positive numbers greater than zero");
      }
      const normalizedSize = `${diam}x${len} ft`;

      const cleanPrice = parseFloat(price);
      if (isNaN(cleanPrice) || cleanPrice <= 0) {
        throw new Error("Price per unit must be greater than zero");
      }

      await requestRepo.createAddTimberRequest({
        workerId: user.id,
        type: cleanType,
        size: normalizedSize,
        qty,
        price: cleanPrice,
      });

      return { message: "Request submitted successfully" };
    } else {
      const err = new Error("Invalid request kind. Must be 'allocate' or 'add'");
      err.status = 400;
      throw err;
    }
  },

  async listRequests({ user, statusFilter }) {
    const isWorker = user.role === "worker";
    return await requestRepo.getRequests({
      isWorker,
      userId: user.id,
      userRole: user.role,
      statusFilter,
    });
  },

  async acceptRequest({ requestId, user }) {
    await tx(async (client) => {
      const reqItem = await requestRepo.getRequestById(requestId, client);
      if (!reqItem) {
        const err = new Error("Request not found");
        err.status = 404;
        throw err;
      }

      // Verify workforce tenancy: 2 owners should not manage same managers and workers
      const actorOwnerId = await requestRepo.getActorOwnerId(user.id, user.role, client);
      if (actorOwnerId && reqItem.worker_owner_id && Number(actorOwnerId) !== Number(reqItem.worker_owner_id)) {
        const err = new Error("Permission denied: this request belongs to another owner's workforce.");
        err.status = 403;
        throw err;
      }

      if (reqItem.status !== "Pending") {
        throw new Error(`Request has already been ${reqItem.status.toLowerCase()}`);
      }

      if (reqItem.kind === "allocate") {
        await stockMutex.withLock(reqItem.timber_id, async () => {
          await requestRepo.executeAllocationApproval({ reqItem, user, client });
        });
      } else {
        await requestRepo.executeAddApproval({ reqItem, user, client });
      }

      await notificationService.checkLowStock(client);
    });

    return { message: "Request accepted successfully" };
  },

  async rejectRequest({ requestId, user }) {
    const reqItem = await requestRepo.getRequestById(requestId);
    if (!reqItem) {
      const err = new Error("Request not found");
      err.status = 404;
      throw err;
    }

    const actorOwnerId = await requestRepo.getActorOwnerId(user.id, user.role);
    if (actorOwnerId && reqItem.worker_owner_id && Number(actorOwnerId) !== Number(reqItem.worker_owner_id)) {
      const err = new Error("Permission denied: this request belongs to another owner's workforce.");
      err.status = 403;
      throw err;
    }

    await requestRepo.rejectRequest(requestId);
    return { message: "Request rejected successfully" };
  },
};
