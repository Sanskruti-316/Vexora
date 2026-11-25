import { pool } from "./db.js";

async function cleanDummyData() {
  console.log("Starting complete dummy data purge from database...");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Delete stock transactions (child of wastage, allocation, timber)
    const stRes = await client.query("DELETE FROM stock_transaction");
    console.log(`Deleted ${stRes.rowCount} rows from stock_transaction`);

    // 2. Delete wastage (child of allocation_request, worker)
    const wRes = await client.query("DELETE FROM wastage");
    console.log(`Deleted ${wRes.rowCount} rows from wastage`);

    // 3. Delete allocation requests
    const arRes = await client.query("DELETE FROM allocation_request");
    console.log(`Deleted ${arRes.rowCount} rows from allocation_request`);

    // 4. Delete low stock alerts
    const alertRes = await client.query("DELETE FROM low_stock_alert");
    console.log(`Deleted ${alertRes.rowCount} rows from low_stock_alert`);

    // 5. Delete extra dummy add_timber_requests (keeping only the 6 primary timber definitions 1-6)
    const atrRes = await client.query("DELETE FROM add_timber_request WHERE request_id > 6");
    console.log(`Deleted ${atrRes.rowCount} dummy rows from add_timber_request`);

    // 6. Delete test accounts (e.g. newmgr_... and Tom / test@gmail.com)
    const mgrRes = await client.query("DELETE FROM manager WHERE email LIKE 'newmgr_%'");
    console.log(`Deleted ${mgrRes.rowCount} test manager accounts`);

    const wkrRes = await client.query("DELETE FROM worker WHERE email = 'test@gmail.com'");
    console.log(`Deleted ${wkrRes.rowCount} test worker accounts`);

    // 7. Drop orphan fallback tables 'requests' and 'txns'
    await client.query("DROP TABLE IF EXISTS requests CASCADE");
    await client.query("DROP TABLE IF EXISTS txns CASCADE");
    console.log("Dropped orphan compatibility tables 'requests' and 'txns'");

    // 8. Reset timber stock quantities back to clean baseline levels
    await client.query(`
      UPDATE timber SET quantity = 100 WHERE timber_id = 1;
      UPDATE timber SET quantity = 120 WHERE timber_id = 2;
      UPDATE timber SET quantity = 80  WHERE timber_id = 3;
      UPDATE timber SET quantity = 60  WHERE timber_id = 4;
      UPDATE timber SET quantity = 90  WHERE timber_id = 5;
      UPDATE timber SET quantity = 50  WHERE timber_id = 6;
    `);
    console.log("Reset timber inventory to clean baseline quantities");

    // 9. Recreate compatibility views requests and txns over the official tables so ERP endpoints continue to function without extra tables
    await client.query(`
      CREATE OR REPLACE VIEW requests AS
      SELECT 
        ('alloc_' || ar.allocation_id)::varchar as id,
        ar.allocation_id as raw_id,
        'allocate'::varchar as kind,
        ar.worker_id,
        ar.timber_id,
        tt.type_name as type,
        (t.width::float || 'x' || t.length::float || ' ft')::varchar as size,
        ar.quantity as qty,
        0::numeric as price,
        ar.status,
        ar.request_time as created_at
      FROM allocation_request ar
      JOIN timber t ON t.timber_id = ar.timber_id
      JOIN timber_type tt ON tt.type_id = t.type_id
      UNION ALL
      SELECT 
        ('add_' || atr.request_id)::varchar as id,
        atr.request_id as raw_id,
        'add'::varchar as kind,
        atr.worker_id,
        NULL::bigint as timber_id,
        tt.type_name as type,
        atr.timber_code as size,
        atr.quantity as qty,
        atr.price,
        atr.status,
        atr.request_time as created_at
      FROM add_timber_request atr
      JOIN timber_type tt ON tt.type_id = atr.type_id;

      CREATE OR REPLACE VIEW txns AS
      SELECT 
        st.txn_id as id,
        st.txn_time::date as date,
        st.txn_type as kind,
        coalesce(tt.type_name, 'Timber')::varchar as type,
        st.quantity as qty,
        coalesce(w.name, m.name, 'System')::varchar as by,
        st.txn_time as created_at
      FROM stock_transaction st
      LEFT JOIN timber t ON t.timber_id = st.timber_id
      LEFT JOIN timber_type tt ON tt.type_id = t.type_id
      LEFT JOIN allocation_request ar ON ar.allocation_id = st.allocation_id
      LEFT JOIN worker w ON w.worker_id = ar.worker_id
      LEFT JOIN manager m ON m.manager_id = ar.manager_id;
    `);
    console.log("Created lightweight views 'requests' and 'txns' (no physical tables stored)");

    await client.query("COMMIT");
    console.log("Complete dummy data successfully removed!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Cleanup failed, transaction rolled back:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}

cleanDummyData();
