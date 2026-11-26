import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

// Check if PostgreSQL connection string is provided
const usePostgres = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "");

let poolInstance = null;

if (usePostgres) {
  try {
    const pg = await import("pg");
    poolInstance = new pg.default.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    console.log("Connected to PostgreSQL database.");
  } catch (err) {
    console.warn("PostgreSQL initialization failed. Falling back to built-in SQLite:", err.message);
    poolInstance = null;
  }
}

// Fallback to SQLite (built-in node:sqlite) if Postgres is not configured
if (!poolInstance) {
  const { DatabaseSync } = await import("node:sqlite");
  const dbPath = path.join(__dirname, "timbers.db");
  const sqliteDb = new DatabaseSync(dbPath);

  // Helper to convert Postgres SQL ($1, $2, ilike, etc.) to SQLite-compatible SQL
  function adaptSql(sql, params = []) {
    let s = sql;
    // Replace $1, $2, ... with ?
    s = s.replace(/\$(\d+)/g, "?");
    // Replace ILIKE with LIKE (SQLite is case-insensitive for ASCII)
    s = s.replace(/\bILIKE\b/gi, "LIKE");
    // Replace FOR UPDATE
    s = s.replace(/FOR UPDATE\s*(OF \w+)?/gi, "");
    // Replace ::int, ::float8
    s = s.replace(/::\w+/g, "");
    // Replace coalesce with ifnull or keep coalesce (sqlite supports coalesce)
    return { sql: s, params };
  }

  poolInstance = {
    isSqlite: true,
    async query(text, params = []) {
      const adapted = adaptSql(text, params);
      const trimmed = adapted.sql.trim();
      const isSelect = /^(SELECT|PRAGMA)/i.test(trimmed);

      try {
        if (isSelect) {
          const stmt = sqliteDb.prepare(adapted.sql);
          const rows = stmt.all(...adapted.params);
          return { rows, rowCount: rows.length };
        } else {
          const stmt = sqliteDb.prepare(adapted.sql);
          const result = stmt.run(...adapted.params);
          return {
            rows: [],
            rowCount: result.changes,
            lastInsertRowid: result.lastInsertRowid,
          };
        }
      } catch (err) {
        throw new Error(`Database error in query [${adapted.sql}]: ${err.message}`);
      }
    },
    async connect() {
      // Mock client for transactions
      return {
        query: (text, params) => poolInstance.query(text, params),
        release: () => {},
      };
    },
    async end() {
      try {
        sqliteDb.close();
      } catch {}
    },
  };
  console.log(`Connected to SQLite database at ${dbPath}`);
}

export const pool = poolInstance;

/**
 * Initialize tables and seed initial data if empty
 */
export async function initDb() {
  if (pool.isSqlite) {
    // SQLite table schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner', 'manager', 'worker')),
        owner_id INTEGER,
        manager_id INTEGER,
        address TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS timber (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        size TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 0,
        min INTEGER NOT NULL DEFAULT 10,
        price REAL NOT NULL DEFAULT 0,
        date TEXT DEFAULT (date('now')),
        UNIQUE(type, size)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK(kind IN ('allocate', 'add')),
        worker_id INTEGER NOT NULL,
        timber_id INTEGER,
        type TEXT NOT NULL,
        size TEXT NOT NULL,
        qty INTEGER NOT NULL,
        price REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Accepted', 'Rejected')),
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
    // Check if Supabase schema (owner, manager, worker) already exists
    const checkOwner = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'owner'"
    );

    if (checkOwner.rows.length > 0) {
      pool.hasEnterpriseSchema = true;
      console.log("Supabase schema detected. Creating compatibility views...");

      // Create users view combining owner, manager, worker (active accounts)
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
            WHEN atr.timber_code ~* '\s*ft$' THEN atr.timber_code
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

      // Ensure cascade & set null behaviors for real database deletion
      await pool.query(`
        ALTER TABLE owner ALTER COLUMN owner_id SET GENERATED BY DEFAULT;
        ALTER TABLE manager ALTER COLUMN manager_id SET GENERATED BY DEFAULT;
        ALTER TABLE worker ALTER COLUMN worker_id SET GENERATED BY DEFAULT;
        ALTER TABLE timber ALTER COLUMN request_id DROP NOT NULL;

        ALTER TABLE manager DROP CONSTRAINT IF EXISTS fk_manager_owner;
        ALTER TABLE manager ADD CONSTRAINT fk_manager_owner FOREIGN KEY (owner_id) REFERENCES owner(owner_id) ON UPDATE CASCADE ON DELETE SET NULL;

        ALTER TABLE worker DROP CONSTRAINT IF EXISTS fk_worker_owner;
        ALTER TABLE worker ADD CONSTRAINT fk_worker_owner FOREIGN KEY (owner_id) REFERENCES owner(owner_id) ON UPDATE CASCADE ON DELETE SET NULL;

        ALTER TABLE worker DROP CONSTRAINT IF EXISTS fk_worker_manager;
        ALTER TABLE worker ADD CONSTRAINT fk_worker_manager FOREIGN KEY (manager_id) REFERENCES manager(manager_id) ON UPDATE CASCADE ON DELETE SET NULL;

        ALTER TABLE low_stock_alert DROP CONSTRAINT IF EXISTS low_stock_alert_manager_id_fkey;
        ALTER TABLE low_stock_alert ADD CONSTRAINT low_stock_alert_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES manager(manager_id) ON UPDATE CASCADE ON DELETE SET NULL;

        ALTER TABLE timber DROP CONSTRAINT IF EXISTS timber_request_id_fkey;
        ALTER TABLE timber ADD CONSTRAINT timber_request_id_fkey FOREIGN KEY (request_id) REFERENCES add_timber_request(request_id) ON UPDATE CASCADE ON DELETE SET NULL;

        ALTER TABLE stock_transaction DROP CONSTRAINT IF EXISTS stock_transaction_allocation_id_fkey;
        ALTER TABLE stock_transaction ADD CONSTRAINT stock_transaction_allocation_id_fkey FOREIGN KEY (allocation_id) REFERENCES allocation_request(allocation_id) ON UPDATE CASCADE ON DELETE SET NULL;

        ALTER TABLE stock_transaction DROP CONSTRAINT IF EXISTS stock_transaction_wastage_id_fkey;
        ALTER TABLE stock_transaction ADD CONSTRAINT stock_transaction_wastage_id_fkey FOREIGN KEY (wastage_id) REFERENCES wastage(wastage_id) ON UPDATE CASCADE ON DELETE SET NULL;

        ALTER TABLE wastage DROP CONSTRAINT IF EXISTS wastage_allocation_id_fkey;
        ALTER TABLE wastage ADD CONSTRAINT wastage_allocation_id_fkey FOREIGN KEY (allocation_id) REFERENCES allocation_request(allocation_id) ON UPDATE CASCADE ON DELETE SET NULL;

        ALTER TABLE wastage DROP CONSTRAINT IF EXISTS wastage_worker_id_fkey;
        ALTER TABLE wastage ADD CONSTRAINT wastage_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES worker(worker_id) ON UPDATE CASCADE ON DELETE CASCADE;

        ALTER TABLE add_timber_request DROP CONSTRAINT IF EXISTS add_timber_request_worker_id_fkey;
        ALTER TABLE add_timber_request ADD CONSTRAINT add_timber_request_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES worker(worker_id) ON UPDATE CASCADE ON DELETE CASCADE;

        ALTER TABLE add_timber_request DROP CONSTRAINT IF EXISTS add_timber_request_manager_id_fkey;
        ALTER TABLE add_timber_request ADD CONSTRAINT add_timber_request_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES manager(manager_id) ON UPDATE CASCADE ON DELETE SET NULL;

        ALTER TABLE allocation_request DROP CONSTRAINT IF EXISTS allocation_request_worker_id_fkey;
        ALTER TABLE allocation_request ADD CONSTRAINT allocation_request_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES worker(worker_id) ON UPDATE CASCADE ON DELETE CASCADE;

        ALTER TABLE allocation_request DROP CONSTRAINT IF EXISTS allocation_request_manager_id_fkey;
        ALTER TABLE allocation_request ADD CONSTRAINT allocation_request_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES manager(manager_id) ON UPDATE CASCADE ON DELETE SET NULL;
      `);
      return;
    }

    // Standard PostgreSQL table schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK(role IN ('owner', 'manager', 'worker')),
        owner_id INTEGER,
        manager_id INTEGER,
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS timber (
        id SERIAL PRIMARY KEY,
        type VARCHAR(100) NOT NULL,
        size VARCHAR(50) NOT NULL,
        qty INTEGER NOT NULL DEFAULT 0,
        min INTEGER NOT NULL DEFAULT 10,
        price NUMERIC(12,2) NOT NULL DEFAULT 0,
        date DATE DEFAULT CURRENT_DATE,
        UNIQUE(type, size)
      );

      CREATE TABLE IF NOT EXISTS requests (
        id SERIAL PRIMARY KEY,
        kind VARCHAR(20) NOT NULL CHECK(kind IN ('allocate', 'add')),
        worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        timber_id INTEGER REFERENCES timber(id) ON DELETE SET NULL,
        type VARCHAR(100) NOT NULL,
        size VARCHAR(50) NOT NULL,
        qty INTEGER NOT NULL,
        price NUMERIC(12,2) DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Accepted', 'Rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS txns (
        id SERIAL PRIMARY KEY,
        date DATE DEFAULT CURRENT_DATE,
        kind VARCHAR(100) NOT NULL,
        type VARCHAR(100) NOT NULL,
        qty INTEGER NOT NULL,
        done_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wastage (
        id SERIAL PRIMARY KEY,
        timber_id INTEGER NOT NULL REFERENCES timber(id) ON DELETE CASCADE,
        worker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        qty INTEGER NOT NULL,
        reason TEXT,
        date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        timber_id INTEGER NOT NULL REFERENCES timber(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // Check if users exist; if not, seed default users
  const { rows: userRows } = await pool.query("SELECT count(*) as cnt FROM users");
  const count = Number(userRows[0]?.cnt || userRows[0]?.count || 0);

  if (count === 0) {
    const pwHash = await bcrypt.hash("12345678", 10);
    const usersToSeed = [
      ["Owner Admin", "owner@gmail.com", pwHash, "owner"],
      ["Production Manager", "manager@gmail.com", pwHash, "manager"],
      ["Ravi K (Worker)", "worker@gmail.com", pwHash, "worker"],
      ["Anil S (Worker)", "anil@example.com", pwHash, "worker"],
    ];

    for (const [name, email, hash, role] of usersToSeed) {
      await pool.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)",
        [name, email, hash, role]
      );
    }

    // Seed default timber stock
    const timberSeed = [
      ["Teak", "10x10", 100, 20, 10000, "2026-10-01"],
      ["Rosewood", "5x5", 50, 10, 50000, "2026-10-12"],
      ["Mahogany", "3x3", 30, 10, 5000, "2026-10-20"],
      ["Oak", "2x2", 8, 15, 15000, "2026-11-02"], // Oak is 8 units, min is 15 -> triggers FR9 low stock notification!
    ];

    for (const [type, size, qty, min, price, date] of timberSeed) {
      await pool.query(
        "INSERT INTO timber (type, size, qty, min, price, date) VALUES ($1, $2, $3, $4, $5, $6)",
        [type, size, qty, min, price, date]
      );
    }

    // Seed initial transactions
    const initialTxns = [
      ["2026-11-01", "Added", "Teak", 100, "Production Manager"],
      ["2026-11-02", "Added", "Rosewood", 50, "Production Manager"],
      ["2026-11-05", "Allocated", "Teak", 20, "Ravi K (Worker)"],
      ["2026-11-10", "Wastage - Cut off-spec", "Mahogany", 2, "Anil S (Worker)"],
    ];
    for (const [date, kind, type, qty, done_by] of initialTxns) {
      await pool.query(
        "INSERT INTO txns (date, kind, type, qty, done_by) VALUES ($1, $2, $3, $4, $5)",
        [date, kind, type, qty, done_by]
      );
    }

    console.log("Default database tables and sample data seeded successfully.");
  }
}
