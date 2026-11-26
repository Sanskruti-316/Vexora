import { pool } from "./index.js";

export const userRepo = {
  async resequenceAccounts() {
    if (!pool.hasEnterpriseSchema) return;
    try {
      const mgrs = await pool.query("SELECT manager_id FROM manager ORDER BY manager_id ASC");
      for (let i = 0; i < mgrs.rows.length; i++) {
        const desiredId = i + 1;
        const currentId = Number(mgrs.rows[i].manager_id);
        if (currentId !== desiredId) {
          await pool.query("UPDATE manager SET manager_id = $1 WHERE manager_id = $2", [desiredId, currentId]);
        }
      }
      const maxM = mgrs.rows.length;
      await pool.query("SELECT setval('manager_manager_id_seq', GREATEST(1, $1::bigint), true)", [maxM]);

      const wrks = await pool.query("SELECT worker_id FROM worker ORDER BY worker_id ASC");
      for (let i = 0; i < wrks.rows.length; i++) {
        const desiredId = i + 1;
        const currentId = Number(wrks.rows[i].worker_id);
        if (currentId !== desiredId) {
          await pool.query("UPDATE worker SET worker_id = $1 WHERE worker_id = $2", [desiredId, currentId]);
        }
      }
      const maxW = wrks.rows.length;
      await pool.query("SELECT setval('worker_worker_id_seq', GREATEST(1, $1::bigint), true)", [maxW]);
    } catch (err) {
      console.error("Error resequencing accounts:", err.message);
    }
  },

  async getUsersByRolesAndOwner(allowedRoles, targetOwnerId) {
    const placeholders = allowedRoles.map((_, i) => `$${i + 1}`).join(", ");
    let sql;
    let params;
    if (targetOwnerId) {
      sql = `SELECT id, name, email, phone, role, address as warehouse, address, owner_id, manager_id FROM users WHERE role IN (${placeholders}) AND owner_id = $${allowedRoles.length + 1} ORDER BY role, id::bigint ASC`;
      params = [...allowedRoles, targetOwnerId];
    } else {
      sql = `SELECT id, name, email, phone, role, address as warehouse, address, owner_id, manager_id FROM users WHERE role IN (${placeholders}) ORDER BY role, id::bigint ASC`;
      params = allowedRoles;
    }
    const { rows } = await pool.query(sql, params);
    return rows;
  },

  async checkEmailExists(email) {
    const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    return rows.length > 0;
  },

  async getActiveOwnerId(user) {
    if (pool.hasEnterpriseSchema) {
      if (user.role === "owner") {
        const checkOwner = await pool.query("SELECT owner_id FROM owner WHERE owner_id = $1", [user.id]);
        return checkOwner.rows[0]?.owner_id || null;
      } else if (user.role === "manager") {
        const mgrRow = await pool.query("SELECT owner_id FROM manager WHERE manager_id = $1", [user.id]);
        return mgrRow.rows[0]?.owner_id || null;
      }
    } else {
      if (user.role === "owner") return user.id;
      if (user.role === "manager") {
        const uRow = await pool.query("SELECT owner_id FROM users WHERE id = $1", [user.id]);
        return uRow.rows[0]?.owner_id || null;
      }
    }
    return null;
  },

  async createManagerEnterprise({ name, email, phone, address, passwordHash, ownerId }) {
    await pool.query(
      "INSERT INTO manager (name, email, phone, address, password_hash, is_active, owner_id) VALUES ($1, $2, $3, $4, $5, true, $6)",
      [name, email, phone, address, passwordHash, ownerId]
    );
  },

  async createWorkerEnterprise({ name, email, phone, address, passwordHash, ownerId, managerId }) {
    await pool.query(
      "INSERT INTO worker (name, email, phone, address, password_hash, is_active, owner_id, manager_id) VALUES ($1, $2, $3, $4, $5, true, $6, $7)",
      [name, email, phone, address, passwordHash, ownerId, managerId]
    );
  },

  async createUserStandard({ name, email, passwordHash, role, address, ownerId, managerId }) {
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role, address, owner_id, manager_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [name, email, passwordHash, role, address, ownerId, managerId]
    );
  },

  async findUserByIdAndRole(userId, requestedRole, allowedRoles = []) {
    let query = "SELECT id, role, name, owner_id, manager_id FROM users WHERE id = $1";
    const queryParams = [userId];
    if (requestedRole) {
      query += " AND role = $2";
      queryParams.push(requestedRole);
    } else if (allowedRoles && allowedRoles.length > 0) {
      const placeholders = allowedRoles.map((_, i) => `$${i + 2}`).join(", ");
      query += ` AND role IN (${placeholders})`;
      queryParams.push(...allowedRoles);
    }
    const { rows } = await pool.query(query, queryParams);
    return rows[0] || null;
  },

  async deleteUser(userId, role) {
    if (pool.hasEnterpriseSchema) {
      if (role === "manager") {
        await pool.query("DELETE FROM manager WHERE manager_id = $1", [userId]);
      } else if (role === "worker") {
        await pool.query("DELETE FROM worker WHERE worker_id = $1", [userId]);
      }
      await this.resequenceAccounts();
    } else {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  },
};
