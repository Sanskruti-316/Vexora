import { userService } from "../services/user.service.js";

export const userController = {
  async listUsers(req, res) {
    const users = await userService.listUsers(req.user);
    res.json(users);
  },

  async createUser(req, res) {
    const { name, email, password, role, phone, address, warehouse } = req.body;
    const result = await userService.createUser({
      name,
      email,
      password,
      role,
      phone,
      address,
      warehouse,
      actorUser: req.user,
    });
    res.status(201).json(result);
  },

  async deleteUser(req, res) {
    const requestedRole = req.query.role || req.body?.role || (req.user.role === "manager" ? "worker" : null);
    const result = await userService.deleteUser({
      targetUserId: req.params.id,
      requestedRole,
      actorUser: req.user,
    });
    res.json(result);
  },
};
