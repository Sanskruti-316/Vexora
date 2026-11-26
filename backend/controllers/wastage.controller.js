import { wastageService } from "../services/wastage.service.js";

export const wastageController = {
  async getMyAllocations(req, res) {
    const allocations = await wastageService.getMyAllocations(req.user);
    res.json(allocations);
  },

  async recordWastage(req, res) {
    const { qty, reason, allocation_id, timber_id } = req.body;
    const result = await wastageService.recordWastage({
      qtyInput: qty,
      reasonInput: reason,
      allocation_id,
      timber_id,
      user: req.user,
    });
    res.status(201).json(result);
  },

  async getWastageLog(req, res) {
    const logs = await wastageService.getWastageLog(req.user);
    res.json(logs);
  },
};
