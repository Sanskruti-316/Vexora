import { timberService } from "../services/timber.service.js";

export const timberController = {
  async getTimber(req, res) {
    const records = await timberService.getTimberInventory(req.query);
    res.json(records);
  },

  async runAlgorithms(req, res) {
    const result = await timberService.runAlgorithmBenchmark(req.body);
    res.json(result);
  },

  async updateMinStock(req, res) {
    const newMin = await timberService.updateMinStock(req.params.id, req.body.min);
    res.json({ message: "Minimum stock threshold updated successfully", min: newMin });
  },

  async getDashboard(req, res) {
    const stats = await timberService.getDashboardStats();
    res.json(stats);
  },
};
