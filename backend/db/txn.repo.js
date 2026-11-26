import { pool } from "./index.js";

export const txnRepo = {
  async getTransactions() {
    if (pool.hasEnterpriseSchema) {
      const { rows } = await pool.query(`
        SELECT st.txn_id as id, st.txn_time::date::text as date, st.txn_type as kind,
               coalesce(tt.type_name, 'Timber') as type, st.quantity as qty,
               coalesce(st.performed_by, w.name, m.name, ws_w.name, 'Rakesh (Worker)') as by, st.txn_time as created_at
        FROM stock_transaction st
        LEFT JOIN timber t ON t.timber_id = st.timber_id
        LEFT JOIN timber_type tt ON tt.type_id = t.type_id
        LEFT JOIN allocation_request ar ON ar.allocation_id = st.allocation_id
        LEFT JOIN worker w ON w.worker_id = ar.worker_id
        LEFT JOIN manager m ON m.manager_id = ar.manager_id
        LEFT JOIN wastage ws ON ws.wastage_id = st.wastage_id
        LEFT JOIN worker ws_w ON ws_w.worker_id = ws.worker_id
        ORDER BY st.txn_id DESC LIMIT 500
      `);
      return rows;
    }
    const { rows } = await pool.query(
      "SELECT id, date, kind, type, qty, done_by as by, created_at FROM txns ORDER BY id DESC LIMIT 500"
    );
    return rows;
  },
};
