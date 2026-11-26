import { authService } from "../services/auth.service.js";

export const authController = {
  async login(req, res) {
    const result = await authService.login(req.body);
    res.json(result);
  },

  async registerOwner(req, res) {
    const result = await authService.registerOwner(req.body);
    res.status(201).json(result);
  },

  async me(req, res) {
    res.json({ user: req.user });
  },
};
