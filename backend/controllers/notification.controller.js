import { notificationService } from "../services/notification.service.js";

export const notificationController = {
  async getNotifications(req, res) {
    const notifs = await notificationService.getUnreadNotifications();
    res.json(notifs);
  },

  async markAsRead(req, res) {
    const result = await notificationService.markAsRead(req.params.id);
    res.json(result);
  },
};
