import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const usePostgres = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "");
let poolInstance = null;

if (usePostgres) {
  try {
    const pg = await import("pg");
    poolInstance = new pg.default.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
    poolInstance.on("error", (err) => {
      console.warn("PostgreSQL pool idle error (will reconnect on next query):", err.message);
    });
    poolInstance.on("connect", (client) => {
      client.on("error", (err) => {
        console.warn("Client connection error (handled safely):", err.message);
      });
    });
    console.log("Connected to PostgreSQL database.");
  } catch (err) {
    console.warn("PostgreSQL initialization failed. Falling back to built-in SQLite:", err.message);
    poolInstance = null;
  }
}

// Fallback to SQLite if PostgreSQL is unavailable
if (!poolInstance) {
  const { DatabaseSync } = await import("node:sqlite");
  const dbPath = path.join(__dirname, "..", "timbers.db");
  const sqliteDb = new DatabaseSync(dbPath);

  function adaptSql(sql, params = []) {
    let s = sql;
    s = s.replace(/\$(\d+)/g, "?");
    s = s.replace(/\bILIKE\b/gi, "LIKE");
    s = s.replace(/FOR UPDATE\s*(OF \w+)?/gi, "");
    s = s.replace(/::\w+/g, "");
    return { sql: s, params };
  }

  poolInstance = {
    isSqlite: true,
    async query(sqlText, params = []) {
      const { sql, params: adaptedParams } = adaptSql(sqlText, params);
      try {
        const trimmed = sql.trim().toUpperCase();
        if (trimmed.startsWith("SELECT") || trimmed.startsWith("PRAGMA")) {
          const stmt = sqliteDb.prepare(sql);
          const rows = stmt.all(...adaptedParams);
          return { rows, rowCount: rows.length };
        } else {
          const stmt = sqliteDb.prepare(sql);
          const info = stmt.run(...adaptedParams);
          return { rows: [], rowCount: info.changes };
        }
      } catch (err) {
        throw err;
      }
    },
    async connect() {
      return {
        query: (sql, params) => poolInstance.query(sql, params),
        release: () => {},
      };
    },
  };
}

export const pool = poolInstance;

export async function tx(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function initDb() {
  if (pool.isSqlite) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        address TEXT,
        owner_id INTEGER,
        manager_id INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS timber (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        size TEXT NOT NULL,
        qty INTEGER NOT NULL,
        min INTEGER NOT NULL,
        price REAL NOT NULL,
        date TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        worker_id INTEGER NOT NULL,
        timber_id INTEGER,
        type TEXT,
        size TEXT,
        qty INTEGER NOT NULL,
        price REAL,
        status TEXT DEFAULT 'Pending',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS txns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT DEFAULT (date('now')),
        kind TEXT NOT NULL,
        type TEXT NOT NULL,
        qty INTEGER NOT NULL,
        done_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS wastage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timber_id INTEGER NOT NULL,
        worker_id INTEGER NOT NULL,
        qty INTEGER NOT NULL,
        reason TEXT,
        date TEXT DEFAULT (date('now')),
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timber_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(timber_id, is_read)
      );
    `);
  } else {
    const checkOwner = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'owner'"
    );

    if (checkOwner.rows.length > 0) {
      pool.hasEnterpriseSchema = true;
      console.log("Supabase schema detected. Creating compatibility views...");

      await pool.query(`
        CREATE OR REPLACE VIEW users AS
        SELECT owner_id as id, name, email, phone, password_hash, 'owner'::varchar as role, is_active, address, owner_id, NULL::bigint as manager_id FROM owner WHERE is_active = true
        UNION ALL
        SELECT manager_id as id, name, email, phone, password_hash, 'manager'::varchar as role, is_active, address, owner_id, NULL::bigint as manager_id FROM manager WHERE is_active = true
        UNION ALL
        SELECT worker_id as id, name, email, phone, password_hash, 'worker'::varchar as role, is_active, address, owner_id, manager_id FROM worker WHERE is_active = true;
      `);

      // Compatibility views requests and txns over the official schema
      await pool.query(`
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
          CASE 
            WHEN atr.timber_code ~* '\\s*ft$' THEN atr.timber_code
            ELSE (atr.timber_code || ' ft')
          END::varchar as size,
          atr.quantity as qty,
          atr.price,
          atr.status,
          atr.request_time as created_at
        FROM add_timber_request atr
        JOIN timber_type tt ON tt.type_id = atr.type_id;

        ALTER TABLE stock_transaction ADD COLUMN IF NOT EXISTS performed_by TEXT;

        CREATE OR REPLACE VIEW txns AS
        SELECT 
          st.txn_id as id,
          st.txn_time::date as date,
          st.txn_type as kind,
          coalesce(tt.type_name, 'Timber')::varchar as type,
          st.quantity as qty,
          coalesce(st.performed_by, w.name, m.name, 'Rakesh (Worker)')::varchar as by,
          st.txn_time as created_at
        FROM stock_transaction st
        LEFT JOIN timber t ON t.timber_id = st.timber_id
        LEFT JOIN timber_type tt ON tt.type_id = t.type_id
        LEFT JOIN allocation_request ar ON ar.allocation_id = st.allocation_id
        LEFT JOIN worker w ON w.worker_id = ar.worker_id
        LEFT JOIN manager m ON m.manager_id = ar.manager_id;
      `);
    }
  }
}

// Export repository bundle
export * from "./auth.repo.js";
export * from "./timber.repo.js";
export * from "./request.repo.js";
export * from "./txn.repo.js";
export * from "./wastage.repo.js";
export * from "./user.repo.js";
export * from "./notification.repo.js";
