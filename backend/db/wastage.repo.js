import { pool, tx } from "./index.js";

export const wastageRepo = {
  async getWorkerAllocations(workerId, role) {
    if (pool.hasEnterpriseSchema) {
      const { rows } = await pool.query(`
        SELECT ar.allocation_id, ar.allocation_id as id, ar.timber_id, tt.type_name as type,
               (t.width::float || 'x' || t.length::float || ' ft') as size, ar.quantity as allocated_qty,
               COALESCE(SUM(ws.quantity), 0)::float8 as wasted_qty,
               (ar.quantity - COALESCE(SUM(ws.quantity), 0))::float8 as remaining_qty,
               ar.status, ar.request_time::date::text as date
        FROM allocation_request ar
        JOIN timber t ON t.timber_id = ar.timber_id
        JOIN timber_type tt ON tt.type_id = t.type_id
        LEFT JOIN wastage ws ON ws.allocation_id = ar.allocation_id
        WHERE ${role === 'worker' ? 'ar.worker_id = $1 AND' : ''} ar.status ILIKE 'Approved'
        GROUP BY ar.allocation_id, ar.timber_id, tt.type_name, t.width, t.length, ar.quantity, ar.status, ar.request_time
        ORDER BY ar.allocation_id DESC
      `, role === 'worker' ? [workerId] : []);
      return rows;
    } else {
      const { rows } = await pool.query(`
        SELECT r.id as allocation_id, r.id, r.timber_id, r.type, r.size, r.qty as allocated_qty,
               COALESCE(SUM(w.qty), 0)::float8 as wasted_qty,
               (r.qty - COALESCE(SUM(w.qty), 0))::float8 as remaining_qty,
               r.status, r.created_at as date
        FROM requests r
        LEFT JOIN wastage w ON w.timber_id = r.timber_id AND w.worker_id = r.worker_id
        WHERE ${role === 'worker' ? 'r.worker_id = $1 AND' : ''} r.kind = 'allocate' AND (r.status = 'Accepted' OR r.status = 'Approved')
        GROUP BY r.id, r.timber_id, r.type, r.size, r.qty, r.status, r.created_at
        ORDER BY r.id DESC
      `, role === 'worker' ? [workerId] : []);
      return rows;
    }
  },

  async getAllocationItem({ allocationId, workerId, role, client = pool }) {
    const allocRes = await client.query(`
      SELECT ar.allocation_id, ar.timber_id, ar.quantity as allocated_qty,
             tt.type_name as type, (t.width::float || 'x' || t.length::float || ' ft') as size,
             COALESCE(SUM(ws.quantity), 0)::float8 as already_wasted
      FROM allocation_request ar
      JOIN timber t ON t.timber_id = ar.timber_id
      JOIN timber_type tt ON tt.type_id = t.type_id
      LEFT JOIN wastage ws ON ws.allocation_id = ar.allocation_id
      WHERE ar.allocation_id = $1 ${role === 'worker' ? 'AND ar.worker_id = $2' : ''}
      GROUP BY ar.allocation_id, ar.timber_id, ar.quantity, tt.type_name, t.width, t.length
    `, role === 'worker' ? [allocationId, workerId] : [allocationId]);
    return allocRes.rows[0] || null;
  },

  async findAvailableAllocationForTimber({ timberId, workerId, role, client = pool }) {
    const allocRes = await client.query(`
      SELECT ar.allocation_id FROM allocation_request ar
      WHERE ar.timber_id = $1 ${role === 'worker' ? 'AND ar.worker_id = $2' : ''} AND ar.status ILIKE 'Approved'
      AND NOT EXISTS (SELECT 1 FROM wastage w WHERE w.allocation_id = ar.allocation_id)
      ORDER BY ar.allocation_id DESC LIMIT 1
    `, role === 'worker' ? [timberId, workerId] : [timberId]);
    return allocRes.rows[0]?.allocation_id || null;
  },

  async checkPreviousWastageAllocated({ timberId, workerId, role, client = pool }) {
    const prevAlloc = await client.query(`
      SELECT ar.allocation_id FROM allocation_request ar
      WHERE ar.timber_id = $1 ${role === 'worker' ? 'AND ar.worker_id = $2' : ''} AND ar.status ILIKE 'Approved'
      LIMIT 1
    `, role === 'worker' ? [timberId, workerId] : [timberId]);
    return prevAlloc.rows.length > 0;
  },

  async createAutoAllocationForWastage({ timberId, workerId, qty, role, client = pool }) {
    let autoMgrId = null;
    if (role === 'worker') {
      const wRow = await client.query("SELECT manager_id FROM worker WHERE worker_id = $1", [workerId]);
      if (wRow.rows[0]?.manager_id) {
        const checkM = await client.query("SELECT manager_id FROM manager WHERE manager_id = $1", [wRow.rows[0].manager_id]);
        if (checkM.rows.length > 0) autoMgrId = checkM.rows[0].manager_id;
      }
    }
    if (!autoMgrId) {
      const anyM = await client.query("SELECT manager_id FROM manager ORDER BY manager_id ASC LIMIT 1");
      autoMgrId = anyM.rows[0]?.manager_id || null;
    }

    let autoWorkerId = role === 'worker' ? workerId : null;
    if (!autoWorkerId) {
      const anyW = await client.query("SELECT worker_id FROM worker ORDER BY worker_id ASC LIMIT 1");
      autoWorkerId = anyW.rows[0]?.worker_id || null;
    }

    const newAlloc = await client.query(
      "INSERT INTO allocation_request (quantity, status, request_time, worker_id, manager_id, timber_id) VALUES ($1, 'Approved', NOW(), $2, $3, $4) RETURNING allocation_id",
      [qty, autoWorkerId, autoMgrId, timberId]
    );
    return newAlloc.rows[0].allocation_id;
  },

  async recordEnterpriseWastage({ resolvedTimberId, resolvedAllocId, qty, reason, user, client }) {
    const stockRes = await client.query("SELECT timber_id, quantity FROM timber WHERE timber_id = $1", [resolvedTimberId]);
    const currentTimber = stockRes.rows[0];
    const newStock = Math.max(0, (currentTimber?.quantity || 0) - qty);
    await client.query("UPDATE timber SET quantity = $1 WHERE timber_id = $2", [newStock, resolvedTimberId]);

    const wasteRes = await client.query(
      "INSERT INTO wastage (quantity, reason, worker_id, allocation_id, recorded_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING wastage_id",
      [qty, reason || "Cutting / trimming loss", user.id || 1, resolvedAllocId]
    );
    const wastageId = wasteRes.rows[0]?.wastage_id;

    const performer = user.name ? `${user.name} (Worker)` : "Worker";
    await client.query(
      "INSERT INTO stock_transaction (txn_type, quantity, stock_after, txn_time, timber_id, wastage_id, allocation_id, performed_by) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)",
      ["Wastage", qty, newStock, resolvedTimberId, wastageId, null, performer]
    );
    return { newStock };
  },

  async recordStandardWastage({ timberId, qty, reason, user, client }) {
    const stockRes = await client.query("SELECT * FROM timber WHERE id = $1", [timberId]);
    const timber = stockRes.rows[0];
    if (!timber) throw new Error("Timber item not found");

    const existingWaste = await client.query(
      "SELECT id FROM wastage WHERE timber_id = $1 AND worker_id = $2 LIMIT 1",
      [timberId, user.id]
    );
    if (existingWaste.rows.length > 0) {
      throw new Error("Wastage has already been recorded for this wood. A worker cannot allot wastage for a certain wood more than once.");
    }

    const currentQty = Number(timber.qty ?? timber.quantity ?? 0);
    if (qty > currentQty) {
      throw new Error(`Recorded wastage (${qty}) cannot exceed currently available stock (${currentQty})`);
    }

    await client.query("UPDATE timber SET qty = qty - $1 WHERE id = $2", [qty, timberId]);
    await client.query(
      "INSERT INTO wastage (timber_id, worker_id, qty, reason, date) VALUES ($1, $2, $3, $4, date('now'))",
      [timberId, user.id, qty, reason || "Unspecified"]
    );
    await client.query(
      "INSERT INTO txns (date, kind, type, qty, done_by) VALUES (date('now'), $1, $2, $3, $4)",
      [`Wastage${reason ? ` - ${reason}` : ""}`, timber.type, qty, user.name]
    );
  },

  async getWastageLogs({ isWorker, userId, targetOwnerId }) {
    if (pool.hasEnterpriseSchema) {
      let sql = `
        SELECT w.wastage_id as id, w.recorded_at::date::text as date, 
               coalesce(tt.type_name, 'Timber') as type,
               coalesce(t.width::float || 'x' || t.length::float || ' ft', 'Standard') as size,
               w.quantity as qty, w.reason, u.name as worker_name 
        FROM wastage w 
        LEFT JOIN allocation_request ar ON ar.allocation_id = w.allocation_id
        LEFT JOIN timber t ON t.timber_id = ar.timber_id
        LEFT JOIN timber_type tt ON tt.type_id = t.type_id
        LEFT JOIN worker u ON u.worker_id = w.worker_id
      `;
      const params = [];
      const conditions = [];

      if (isWorker) {
        conditions.push(`w.worker_id = $${params.length + 1}`);
        params.push(userId);
      } else if (targetOwnerId) {
        conditions.push(`u.owner_id = $${params.length + 1}`);
        params.push(targetOwnerId);
      }

      if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
      }

      sql += " ORDER BY w.wastage_id DESC LIMIT 500";
      const { rows } = await pool.query(sql, params);
      return rows;
    }

    let sql = `
      SELECT w.id, w.date, t.type, t.size, w.qty, w.reason, u.name as worker_name 
      FROM wastage w 
      JOIN timber t ON t.id = w.timber_id 
      JOIN users u ON u.id = w.worker_id
    `;
    const params = [];
    const conditions = [];

    if (isWorker) {
      conditions.push(`w.worker_id = $${params.length + 1}`);
      params.push(userId);
    } else if (targetOwnerId) {
      conditions.push(`u.owner_id = $${params.length + 1}`);
      params.push(targetOwnerId);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY w.id DESC LIMIT 500";
    const { rows } = await pool.query(sql, params);
    return rows;
  },
};
