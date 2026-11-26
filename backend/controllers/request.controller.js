import { requestService } from "../services/request.service.js";

export const requestController = {
  async submitRequest(req, res) {
    const { kind, timber_id, type, size, price, qty } = req.body;
    const result = await requestService.submitRequest({
      kind,
      timber_id,
      type,
      size,
      price,
      qtyInput: qty,
      user: req.user,
    });
    res.status(201).json(result);
  },

  async listRequests(req, res) {
    const records = await requestService.listRequests({
      user: req.user,
      statusFilter: req.query.status,
    });
    res.json(records);
  },

  async acceptRequest(req, res) {
    const result = await requestService.acceptRequest({
      requestId: req.params.id,
      user: req.user,
    });
    res.json(result);
  },

  async rejectRequest(req, res) {
    const result = await requestService.rejectRequest({
      requestId: req.params.id,
      user: req.user,
    });
    res.json(result);
  },
};
