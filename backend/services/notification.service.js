import { notificationRepo } from "../db/notification.repo.js";
import { pool } from "../db/index.js";

export const notificationService = {
  async checkLowStock(db = pool) {
    try {
      const lowItems = await notificationRepo.getLowStockAlerts(db);
      for (const item of lowItems) {
        if (pool.hasEnterpriseSchema) {
          await notificationRepo.recordEnterpriseAlert(item, db);
        } else {
          await notificationRepo.recordStandardAlert(item, db);
        }
      }
    } catch (err) {
      console.warn("Low-stock alert check warning:", err.message);
    }
  },

  async getUnreadNotifications() {
    await this.checkLowStock();
    return await notificationRepo.getUnreadNotifications();
  },

  async markAsRead(notificationId) {
    await notificationRepo.markNotificationRead(notificationId);
    return { message: "Notification marked as read" };
  },
};
