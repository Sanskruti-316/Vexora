import { pool } from "./db.js";

async function scratchReset() {
  console.log("Starting full system reset to start from scratch (keeping only owner account)...");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Transactions and wastage
    await client.query("DELETE FROM stock_transaction");
    await client.query("DELETE FROM wastage");
    await client.query("DELETE FROM allocation_request");
    await client.query("DELETE FROM low_stock_alert");

    // 2. Timber stock and requests
    await client.query("DELETE FROM timber");
    await client.query("DELETE FROM add_timber_request");

    // 3. Workers and Managers
    await client.query("DELETE FROM worker");
    await client.query("DELETE FROM manager");

    // 4. Owners: keep ONLY the primary Durga Owner (owner@gmail.com)
    await client.query("DELETE FROM owner WHERE email != 'owner@gmail.com'");

    await client.query("COMMIT");
    console.log("Complete system wipe successful! Starting completely from scratch.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Reset failed, transaction rolled back:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}

scratchReset();
