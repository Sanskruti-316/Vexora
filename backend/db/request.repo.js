import { pool, tx } from "./index.js";

export const requestRepo = {
  async getPendingAllocationQuantity(timberId) {
    if (pool.hasEnterpriseSchema) {
      const res = await pool.query(
        "SELECT COALESCE(SUM(quantity), 0) as total_pending FROM allocation_request WHERE timber_id = $1 AND status = 'Pending'",
        [timberId]
      );
      return Number(res.rows[0]?.total_pending || 0);
    } else {
      const res = await pool.query(
        "SELECT COALESCE(SUM(qty), 0) as total_pending FROM requests WHERE timber_id = $1 AND kind = 'allocate' AND status = 'Pending'",
        [timberId]
      );
      return Number(res.rows[0]?.total_pending || 0);
    }
  },

  async findWorkerManagerAndOwner(workerId) {
    if (pool.hasEnterpriseSchema) {
      const wRow = await pool.query("SELECT manager_id, owner_id FROM worker WHERE worker_id = $1", [workerId]);
      if (wRow.rows.length === 0) return { managerId: null, ownerId: null };
      let workerMgrId = null;
      const ownerId = wRow.rows[0].owner_id;
      if (wRow.rows[0].manager_id) {
        const checkM = await pool.query("SELECT manager_id FROM manager WHERE manager_id = $1", [wRow.rows[0].manager_id]);
        if (checkM.rows.length > 0) workerMgrId = checkM.rows[0].manager_id;
      }
      if (!workerMgrId && ownerId) {
        const sameOwnerM = await pool.query("SELECT manager_id FROM manager WHERE owner_id = $1 ORDER BY manager_id ASC LIMIT 1", [ownerId]);
        workerMgrId = sameOwnerM.rows[0]?.manager_id || null;
      }
      return { managerId: workerMgrId, ownerId };
    }
    return { managerId: null, ownerId: null };
  },

  async createAllocationRequest({ workerId, timberId, qty, type, size }) {
    if (pool.hasEnterpriseSchema) {
      const { managerId } = await this.findWorkerManagerAndOwner(workerId);
      await pool.query(
        "INSERT INTO allocation_request (quantity, status, request_time, worker_id, manager_id, timber_id) VALUES ($1, 'Pending', NOW(), $2, $3, $4)",
        [qty, workerId, managerId, timberId]
      );
    } else {
      await pool.query(
        "INSERT INTO requests (kind, worker_id, timber_id, type, size, qty, status) VALUES ('allocate', $1, $2, $3, $4, $5, 'Pending')",
        [workerId, timberId, type, size, qty]
      );
    }
  },

  async findOrCreateTimberType(cleanType) {
    const typeRes = await pool.query("SELECT type_id FROM timber_type WHERE type_name ILIKE $1", [cleanType]);
    if (typeRes.rows[0]?.type_id) {
      return typeRes.rows[0].type_id;
    }
    const insType = await pool.query("INSERT INTO timber_type (type_name, min_stock_level) VALUES ($1, 20) RETURNING type_id", [cleanType]);
    return insType.rows[0].type_id;
  },

  async createAddTimberRequest({ workerId, type, size, qty, price }) {
    if (pool.hasEnterpriseSchema) {
      const { managerId } = await this.findWorkerManagerAndOwner(workerId);
      const typeId = await this.findOrCreateTimberType(type);
      await pool.query(
        "INSERT INTO add_timber_request (timber_code, quantity, price, status, request_time, worker_id, manager_id, type_id) VALUES ($1, $2, $3, 'Pending', NOW(), $4, $5, $6)",
        [size, qty, price, workerId, managerId, typeId]
      );
    } else {
      await pool.query(
        "INSERT INTO requests (kind, worker_id, type, size, qty, price, status) VALUES ('add', $1, $2, $3, $4, $5, 'Pending')",
        [workerId, type, size, qty, price]
      );
    }
  },

  async getRequests({ isWorker, userId, userRole, statusFilter }) {
    let sql = `
      SELECT r.*, 
             coalesce(u.name, w.name, 'Worker #' || r.worker_id) as worker_name, 
             coalesce(u.email, w.email, '') as worker_email, 
             coalesce(u.owner_id, w.owner_id) as worker_owner_id 
      FROM requests r 
      LEFT JOIN users u ON u.id = r.worker_id AND u.role = 'worker'
      LEFT JOIN worker w ON w.worker_id = r.worker_id
    `;
    const params = [];
    const conditions = [];

    if (isWorker) {
      conditions.push(`r.worker_id = $${params.length + 1}`);
      params.push(userId);
    } else if (userRole === "owner") {
      conditions.push(`u.owner_id = $${params.length + 1}`);
      params.push(userId);
    } else if (userRole === "manager") {
      let mgrOwnerId = null;
      if (pool.hasEnterpriseSchema) {
        const mRow = await pool.query("SELECT owner_id FROM manager WHERE manager_id = $1", [userId]);
        mgrOwnerId = mRow.rows[0]?.owner_id;
      } else {
        const uRow = await pool.query("SELECT owner_id FROM users WHERE id = $1", [userId]);
        mgrOwnerId = uRow.rows[0]?.owner_id;
      }
      if (mgrOwnerId) {
        conditions.push(`u.owner_id = $${params.length + 1}`);
        params.push(mgrOwnerId);
      }
    }

    if (statusFilter) {
      conditions.push(`r.status = $${params.length + 1}`);
      params.push(statusFilter);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY r.id DESC";
    const { rows } = await pool.query(sql, params);
    return rows;
  },

  async getRequestById(requestId, client = pool) {
    const { rows } = await client.query(
      `SELECT r.*, u.name as worker_name, u.owner_id as worker_owner_id 
       FROM requests r 
       JOIN users u ON u.id = r.worker_id AND u.role = 'worker'
       WHERE r.id = $1`,
      [requestId]
    );
    return rows[0] || null;
  },

  async getActorOwnerId(userId, role, client = pool) {
    if (role === "owner") return userId;
    if (role === "manager") {
      if (pool.hasEnterpriseSchema) {
        const mRow = await client.query("SELECT owner_id FROM manager WHERE manager_id = $1", [userId]);
        return mRow.rows[0]?.owner_id || null;
      } else {
        const uRow = await client.query("SELECT owner_id FROM users WHERE id = $1", [userId]);
        return uRow.rows[0]?.owner_id || null;
      }
    }
    return null;
  },

  async executeAllocationApproval({ reqItem, user, client }) {
    if (pool.hasEnterpriseSchema) {
      const rawId = reqItem.raw_id || parseInt(String(reqItem.id).replace(/\D/g, ""), 10);
      const stockRes = await client.query("SELECT * FROM timber WHERE timber_id = $1 FOR UPDATE", [reqItem.timber_id]);
      const timber = stockRes.rows[0];
      if (!timber || timber.quantity < reqItem.qty) {
        throw new Error("Cannot allocate: Insufficient stock available in warehouse");
      }
      const newStock = Math.max(0, timber.quantity - reqItem.qty);
      await client.query("UPDATE timber SET quantity = $1 WHERE timber_id = $2", [newStock, reqItem.timber_id]);
      await client.query("UPDATE allocation_request SET status = 'Approved', decided_at = NOW() WHERE allocation_id = $1", [rawId]);
      const performer = reqItem.worker_name ? `${reqItem.worker_name} (Worker)` : (user.name ? `${user.name} (Manager)` : "Worker");
      await client.query(
        "INSERT INTO stock_transaction (txn_type, quantity, stock_after, txn_time, timber_id, allocation_id, performed_by) VALUES ('Allocation', $1, $2, NOW(), $3, $4, $5)",
        [reqItem.qty, newStock, reqItem.timber_id, rawId, performer]
      );
      return { newStock };
    } else {
      const stockRes = await client.query("SELECT * FROM timber WHERE id = $1 FOR UPDATE", [reqItem.timber_id]);
      const timber = stockRes.rows[0];
      if (!timber || timber.qty < reqItem.qty) {
        throw new Error("Cannot allocate: Insufficient stock available in warehouse");
      }
      await client.query("UPDATE timber SET qty = qty - $1 WHERE id = $2", [reqItem.qty, reqItem.timber_id]);
      await client.query(
        "INSERT INTO txns (date, kind, type, qty, done_by) VALUES (CURRENT_DATE, $1, $2, $3, $4)",
        ["Allocated", reqItem.type, reqItem.qty, reqItem.worker_name]
      );
      await client.query("UPDATE requests SET status = 'Accepted' WHERE id = $1", [reqItem.id]);
      return { newStock: timber.qty - reqItem.qty };
    }
  },

  async executeAddApproval({ reqItem, user, client }) {
    if (pool.hasEnterpriseSchema) {
      const rawId = reqItem.raw_id || parseInt(String(reqItem.id).replace(/\D/g, ""), 10);
      const typeCheck = await client.query("SELECT type_id FROM timber_type WHERE type_name ILIKE $1", [reqItem.type]);
      let typeId = typeCheck.rows[0]?.type_id;
      if (!typeId) {
        const newType = await client.query("INSERT INTO timber_type (type_name, min_stock_level) VALUES ($1, 20) RETURNING type_id", [reqItem.type]);
        typeId = newType.rows[0].type_id;
      }
      let diam = 4.0;
      let len = 10.0;
      const match = String(reqItem.size || "").match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/);
      if (match) {
        diam = parseFloat(match[1]) || 4.0;
        len = parseFloat(match[2]) || 10.0;
      }
      const existing = await client.query(
        "SELECT timber_id, quantity FROM timber WHERE type_id = $1 AND ABS(width - $2) < 0.01 AND ABS(length - $3) < 0.01 LIMIT 1",
        [typeId, diam, len]
      );
      let timberId;
      let newStock;
      const addQty = parseFloat(reqItem.qty) || 0;
      const reqPrice = parseFloat(reqItem.price) || 0;
      if (existing.rows.length > 0) {
        timberId = existing.rows[0].timber_id;
        const currentQty = parseFloat(existing.rows[0].quantity) || 0;
        newStock = currentQty + addQty;
        await client.query("UPDATE timber SET quantity = quantity + $1, price = $2 WHERE timber_id = $3", [addQty, reqPrice, timberId]);
      } else {
        const insRes = await client.query(
          "INSERT INTO timber (timber_code, thickness, width, length, unit, quantity, price, location, date_added, type_id, request_id) VALUES ('T_NEW', $1, $1, $2, 'ft', $3, $4, 'Warehouse A', NOW(), $5, $6) RETURNING timber_id",
          [diam, len, addQty, reqPrice, typeId, rawId]
        );
        timberId = insRes.rows[0].timber_id;
        newStock = addQty;
      }
      await client.query("UPDATE add_timber_request SET status = 'Approved', decided_at = NOW() WHERE request_id = $1", [rawId]);
      const performer = reqItem.worker_name ? `${reqItem.worker_name} (Worker)` : (user.name ? `${user.name} (Manager)` : "Manager");
      await client.query(
        "INSERT INTO stock_transaction (txn_type, quantity, stock_after, txn_time, timber_id, performed_by) VALUES ('Addition', $1, $2, NOW(), $3, $4)",
        [reqItem.qty, newStock, timberId, performer]
      );
      return { timberId, newStock };
    } else {
      const existing = await client.query(
        "SELECT id FROM timber WHERE type = $1 AND size = $2",
        [reqItem.type, reqItem.size]
      );

      if (existing.rows.length > 0) {
        await client.query(
          "UPDATE timber SET qty = qty + $1, price = $2 WHERE id = $3",
          [reqItem.qty, reqItem.price, existing.rows[0].id]
        );
      } else {
        await client.query(
          "INSERT INTO timber (type, size, qty, min, price, date) VALUES ($1, $2, $3, 10, $4, date('now'))",
          [reqItem.type, reqItem.size, reqItem.qty, reqItem.price]
        );
      }
      await client.query(
        "INSERT INTO txns (date, kind, type, qty, done_by) VALUES (CURRENT_DATE, $1, $2, $3, $4)",
        ["Added", reqItem.type, reqItem.qty, reqItem.worker_name]
      );
      await client.query("UPDATE requests SET status = 'Accepted' WHERE id = $1", [reqItem.id]);
      return {};
    }
  },

  async rejectRequest(requestId) {
    if (pool.hasEnterpriseSchema) {
      const idStr = String(requestId);
      const rawId = parseInt(idStr.replace(/\D/g, ""), 10);
      if (idStr.startsWith("add_")) {
        await pool.query("UPDATE add_timber_request SET status = 'Rejected', decided_at = NOW() WHERE request_id = $1", [rawId]);
      } else {
        await pool.query("UPDATE allocation_request SET status = 'Rejected', decided_at = NOW() WHERE allocation_id = $1", [rawId]);
      }
    } else {
      const { rowCount } = await pool.query(
        "UPDATE requests SET status = 'Rejected' WHERE id = $1 AND status = 'Pending'",
        [requestId]
      );
      if (!rowCount) throw new Error("Request not found or not in Pending status");
    }
  },
};
