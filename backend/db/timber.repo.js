import { pool, tx } from "./index.js";

export const timberRepo = {
  async fetchAllRecords() {
    if (pool.hasEnterpriseSchema) {
      const { rows } = await pool.query(`
        SELECT t.timber_id as id, tt.type_name as type, (t.width::float || 'x' || t.length::float || ' ft') as size,
               t.quantity as qty, t.quantity, tt.min_stock_level as min, tt.min_stock_level,
               t.price, t.date_added::date::text as date, t.location as warehouse
        FROM timber t
        JOIN timber_type tt ON tt.type_id = t.type_id
      `);
      return rows;
    } else {
      const { rows } = await pool.query("SELECT * FROM timber");
      return rows.map((r) => ({ ...r, quantity: r.qty }));
    }
  },

  async findTimberById(timberId, client = pool, forUpdate = false) {
    const sql = pool.hasEnterpriseSchema
      ? `SELECT t.*, tt.type_name as type, t.quantity as qty, (t.width::float || 'x' || t.length::float || ' ft') as size 
         FROM timber t 
         JOIN timber_type tt ON tt.type_id = t.type_id 
         WHERE t.timber_id = $1 ${forUpdate ? "FOR UPDATE" : ""}`
      : `SELECT * FROM timber WHERE id = $1 ${forUpdate ? "FOR UPDATE" : ""}`;
    const { rows } = await client.query(sql, [timberId]);
    return rows[0] || null;
  },

  async updateMinStock(timberId, newMin) {
    if (pool.hasEnterpriseSchema) {
      const t = await pool.query("SELECT type_id FROM timber WHERE timber_id = $1", [timberId]);
      if (t.rows.length > 0) {
        await pool.query("UPDATE timber_type SET min_stock_level = $1 WHERE type_id = $2", [newMin, t.rows[0].type_id]);
      } else {
        await pool.query("UPDATE timber_type SET min_stock_level = $1 WHERE type_id = $2", [newMin, timberId]);
      }
    } else {
      await pool.query("UPDATE timber SET min = $1 WHERE id = $2", [newMin, timberId]);
    }
  },

  async getDashboardData() {
    if (pool.hasEnterpriseSchema) {
      const [totalTypes, totalQty, totalVal, lowStock, pendingReq, stockByType, requestsByStatus, last7Days] = await Promise.all([
        pool.query("SELECT COUNT(DISTINCT type_id) as count FROM timber"),
        pool.query("SELECT COALESCE(SUM(quantity), 0) as total_units FROM timber"),
        pool.query("SELECT COALESCE(SUM(quantity * price), 0) as total_value FROM timber"),
        pool.query(`
          SELECT COUNT(*) as low_count FROM timber t
          JOIN timber_type tt ON tt.type_id = t.type_id
          WHERE t.quantity < tt.min_stock_level
        `),
        pool.query(`
          SELECT COUNT(*) as pending_count FROM (
            SELECT status FROM allocation_request WHERE status ILIKE 'Pending'
            UNION ALL
            SELECT status FROM add_timber_request WHERE status ILIKE 'Pending'
          ) as pending_reqs
        `),
        pool.query(`
          SELECT INITCAP(TRIM(tt.type_name)) as type, SUM(t.quantity)::int as qty, SUM(t.quantity * t.price)::float8 as value
          FROM timber t
          JOIN timber_type tt ON tt.type_id = t.type_id
          GROUP BY INITCAP(TRIM(tt.type_name)) ORDER BY INITCAP(TRIM(tt.type_name))
        `),
        pool.query(`
          SELECT status, COUNT(*)::int as count FROM (
            SELECT status FROM allocation_request
            UNION ALL
            SELECT status FROM add_timber_request
          ) as all_reqs GROUP BY status
        `),
        pool.query(`
          SELECT txn_time::date::text as date, txn_type as kind, SUM(quantity)::int as qty
          FROM stock_transaction
          GROUP BY txn_time::date, txn_type
          ORDER BY date DESC LIMIT 30
        `),
      ]);

      return {
        totals: {
          types: Number(totalTypes.rows[0]?.count || 0),
          units: Number(totalQty.rows[0]?.total_units || 0),
          value: Number(totalVal.rows[0]?.total_value || 0),
          low: Number(lowStock.rows[0]?.low_count || 0),
          pendingRequests: Number(pendingReq.rows[0]?.pending_count || 0),
        },
        stockByType: stockByType.rows,
        requestsByStatus: requestsByStatus.rows,
        last7Days: last7Days.rows.reverse(),
        wastageSummary: [],
      };
    }

    const [totalTypesRes, totalQtyRes, totalValRes, lowStockRes, pendingReqRes, stockByType, requestsByStatus, last7Days, wastageSummary] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM timber"),
      pool.query("SELECT COALESCE(SUM(qty), 0) as total_units FROM timber"),
      pool.query("SELECT COALESCE(SUM(qty * price), 0) as total_value FROM timber"),
      pool.query("SELECT COUNT(*) as low_count FROM timber WHERE qty < min"),
      pool.query("SELECT COUNT(*) as pending_count FROM requests WHERE status = 'Pending'"),
      pool.query("SELECT INITCAP(TRIM(type)) as type, SUM(qty) as qty, SUM(qty * price) as value FROM timber GROUP BY INITCAP(TRIM(type)) ORDER BY INITCAP(TRIM(type))"),
      pool.query("SELECT status, COUNT(*) as count FROM requests GROUP BY status"),
      pool.query("SELECT date, kind, SUM(qty) as qty FROM txns GROUP BY date, kind ORDER BY date DESC LIMIT 30"),
      pool.query(`
        SELECT t.type, COALESCE(SUM(w.qty), 0) as wasted_qty 
        FROM wastage w 
        JOIN timber t ON t.id = w.timber_id 
        GROUP BY t.type
      `),
    ]);

    return {
      totals: {
        types: Number(totalTypesRes.rows[0]?.count || 0),
        units: Number(totalQtyRes.rows[0]?.total_units || 0),
        value: Number(totalValRes.rows[0]?.total_value || 0),
        low: Number(lowStockRes.rows[0]?.low_count || 0),
        pendingRequests: Number(pendingReqRes.rows[0]?.pending_count || 0),
      },
      stockByType: stockByType.rows,
      requestsByStatus: requestsByStatus.rows,
      last7Days: last7Days.rows.reverse(),
      wastageSummary: wastageSummary.rows,
    };
  },
};
