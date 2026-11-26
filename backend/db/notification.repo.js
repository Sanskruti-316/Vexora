import { pool } from "./index.js";

export const notificationRepo = {
  async getLowStockAlerts(db = pool) {
    if (pool.hasEnterpriseSchema) {
      const { rows } = await db.query(`
        SELECT t.timber_id, tt.type_id, tt.type_name, t.quantity, tt.min_stock_level
        FROM timber t
        JOIN timber_type tt ON tt.type_id = t.type_id
        WHERE t.quantity < tt.min_stock_level
      `);
      return rows;
    } else {
      const { rows } = await db.query(`
        SELECT id, type, size, qty, min
        FROM timber
        WHERE qty < min
      `);
      return rows;
    }
  },

  async recordEnterpriseAlert(item, db = pool) {
    const existing = await db.query(
      "SELECT alert_id FROM low_stock_alert WHERE type_id = $1 AND is_read = false LIMIT 1",
      [item.type_id]
    );
    if (existing.rows.length === 0) {
      await db.query(
        "INSERT INTO low_stock_alert (alert_time, current_quantity, min_level, is_read, type_id) VALUES (NOW(), $1, $2, false, $3)",
        [item.quantity, item.min_stock_level, item.type_id]
      );
    }
  },

  async recordStandardAlert(item, db = pool) {
    const msg = `Low stock alert: ${item.type} (${item.size}) has only ${item.qty} units left (Min: ${item.min})`;
    const existing = await db.query(
      "SELECT id FROM notifications WHERE timber_id = $1 AND is_read = 0 LIMIT 1",
      [item.id]
    );
    if (existing.rows.length === 0) {
      await db.query(
        "INSERT INTO notifications (timber_id, message, is_read) VALUES ($1, $2, 0)",
        [item.id, msg]
      );
    }
  },

  async getUnreadNotifications() {
    if (pool.hasEnterpriseSchema) {
      const { rows } = await pool.query(`
        SELECT lsa.alert_id as id,
               ('Low stock alert: ' || tt.type_name || ' has only ' || lsa.current_quantity || ' units left (Minimum threshold: ' || lsa.min_level || ')') as message,
               lsa.is_read
        FROM low_stock_alert lsa
        JOIN timber_type tt ON tt.type_id = lsa.type_id
        WHERE lsa.is_read = false
        ORDER BY lsa.alert_id DESC
      `);
      return rows;
    } else {
      const { rows } = await pool.query(
        "SELECT * FROM notifications WHERE is_read = 0 ORDER BY id DESC"
      );
      return rows;
    }
  },

  async markNotificationRead(id) {
    if (pool.hasEnterpriseSchema) {
      await pool.query("UPDATE low_stock_alert SET is_read = true WHERE alert_id = $1", [id]);
    } else {
      await pool.query("UPDATE notifications SET is_read = 1 WHERE id = $1", [id]);
    }
  },
};
