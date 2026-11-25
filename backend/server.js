import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { pool, initDb } from "./db.js";
import { auth, sign } from "./auth.js";
import {
  processTimberQuery,
  mergeSort,
  binarySearch,
  filterInStock,
  filterOutOfStock,
  filterLowStock,
  filterAvailable,
  filterUnavailable,
  filterPending,
  filterApproved,
  filterDeclined,
  sortByManagerName,
  sortByDate,
  sortByPrice,
  sortByQuantity,
  sortByTimberType,
  searchManagerName,
  searchWorkerName,
  searchWarehouseName,
  searchAddress,
  searchTimberName,
  searchSize,
  stockMutex,
  StockMutexLock,
} from "./algorithms.js";

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Async route error wrapper
const h = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error("API Error:", err);
    res.status(err.status || 400).json({ error: err.message || "An error occurred" });
  });
};

// Helper to validate positive integer
const posInt = (v, msg = "Invalid quantity") => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }
  return n;
};

// Helper to validate positive float or decimal
const posFloat = (v, msg = "Invalid quantity") => {
  const n = parseFloat(v);
  if (isNaN(n) || n <= 0) {
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }
  return n;
};

// Helper to validate phone number and reject negative or malformed inputs
const validatePhone = (v, defaultPhone = "+91 9999900000") => {
  if (!v) return defaultPhone;
  const raw = String(v).trim();
  if (!raw) return defaultPhone;

  // Disallow negative numbers or minus sign (e.g. "-1")
  if (/^-/.test(raw) || (raw.includes("-") && !/^\+?\d+[\-\s]?\d+$/.test(raw))) {
    const err = new Error("Phone number cannot be negative or contain invalid characters");
    err.status = 400;
    throw err;
  }

  // Strip spaces, hyphens, and parentheses
  const cleaned = raw.replace(/[\s\-\(\)]/g, "");
  // Must be valid phone number with 10 to 15 digits (optionally prefixed by +)
  if (!/^\+?[1-9]\d{9,14}$/.test(cleaned)) {
    const err = new Error("Invalid phone number. Must be a valid positive 10 to 15 digit number (e.g. +91 9876543210 or 9876543210)");
    err.status = 400;
    throw err;
  }
  return raw;
};

// Database transaction helper
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch { }
    throw err;
  } finally {
    if (client.release) client.release();
  }
}

export async function checkLow(db = pool) {
  try {
    if (pool.hasEnterpriseSchema) {
      const { rows: lowItems } = await db.query(`
        SELECT t.timber_id, tt.type_id, tt.type_name, t.quantity, tt.min_stock_level
        FROM timber t
        JOIN timber_type tt ON tt.type_id = t.type_id
        WHERE t.quantity < tt.min_stock_level
      `);

      let targetManagerId = null;
      const mgrRow = await db.query("SELECT manager_id FROM manager ORDER BY manager_id ASC LIMIT 1");
      if (mgrRow.rows.length > 0) targetManagerId = mgrRow.rows[0].manager_id;

      for (const item of lowItems) {
        const existing = await db.query(
          "SELECT alert_id FROM low_stock_alert WHERE type_id = $1 AND is_read = false",
          [item.type_id]
        );
        if (existing.rows.length === 0) {
          await db.query(
            "INSERT INTO low_stock_alert (current_quantity, min_level, alert_time, is_read, type_id, manager_id) VALUES ($1, $2, NOW(), false, $3, $4)",
            [Math.round(Number(item.quantity || 0)), Math.round(Number(item.min_stock_level || 0)), item.type_id, targetManagerId]
          );
        }
      }
      return;
    }

    // Find timber below minimum stock
    const { rows: lowItems } = await db.query(
      "SELECT id, type, size, qty, min FROM timber WHERE qty < min"
    );

    for (const item of lowItems) {
      const msg = `Low stock alert: ${item.type} (${item.size}) has only ${item.qty} units left (Minimum threshold: ${item.min})`;
      const existing = await db.query(
        "SELECT id FROM notifications WHERE timber_id = $1 AND is_read = 0",
        [item.id]
      );
      if (existing.rows.length === 0) {
        await db.query(
          "INSERT INTO notifications (timber_id, message, is_read) VALUES ($1, $2, 0)",
          [item.id, msg]
        );
      }
    }

    // Auto-resolve notifications for timber that has been replenished
    const { rows: replenished } = await db.query(
      "SELECT id FROM timber WHERE qty >= min"
    );
    for (const r of replenished) {
      await db.query(
        "UPDATE notifications SET is_read = 1 WHERE timber_id = $1 AND is_read = 0",
        [r.id]
      );
    }
  } catch (err) {
    console.error("Error in checkLow alert check:", err.message);
  }
}

// Monitor stock levels periodically
setInterval(() => checkLow().catch(console.error), 60000);

// ==========================================
// 1. HEALTH & WELCOME ENDPOINTS
// ==========================================
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Authentication and Login
const handleLogin = async (req, res) => {
  const email = String(req.body.email || "").toLowerCase().trim();
  const password = String(req.body.password || "").trim();

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  const user = rows[0];

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = sign(user);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};

app.post("/api/login", h(handleLogin));
app.post("/api/auth/login", h(handleLogin));

// Public registration endpoint for Owner account
const handleRegisterOwner = async (req, res) => {
  const { name, email, password, phone, address } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }
  const cleanName = String(name || "").trim();
  if (/^\d+$/.test(cleanName) || /^-?\d+$/.test(cleanName) || /[0-9=<>_$%^&*()+!]/.test(cleanName) || !/^[a-zA-Z][a-zA-Z\s\-\.']{1,99}$/.test(cleanName)) {
    return res.status(400).json({ error: "Name cannot be numbers or symbols. It must be text only (e.g. Ramesh Kumar)." });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  const cleanedEmail = email.toLowerCase().trim();
  const hash = await bcrypt.hash(String(password).trim(), 10);

  // Check if an account already exists with this email
  const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = $1", [cleanedEmail]);
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: "An account with this email already exists" });
  }

  let newOwner;
  if (pool.hasEnterpriseSchema) {
    const ins = await pool.query(
      "INSERT INTO owner (name, email, phone, address, password_hash, is_active) VALUES ($1, $2, $3, $4, $5, true) RETURNING owner_id as id, name, email",
      [name.trim(), cleanedEmail, validatePhone(phone, "+91 9999999999"), address ? address.trim() : "Headquarters", hash]
    );
    newOwner = ins.rows[0];
  } else {
    const ins = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'owner') RETURNING id, name, email",
      [name.trim(), cleanedEmail, hash]
    );
    newOwner = ins.rows[0];
  }

  const userObj = {
    id: newOwner.id,
    name: newOwner.name,
    email: newOwner.email,
    role: "owner",
  };
  const token = sign(userObj);

  res.status(201).json({
    message: "Owner account registered successfully",
    token,
    user: userObj,
  });
};

app.post("/api/register-owner", h(handleRegisterOwner));
app.post("/api/auth/register-owner", h(handleRegisterOwner));

// Endpoint to verify currently authenticated user session
app.get("/api/me", auth(), (req, res) => {
  res.json({ user: req.user });
});
app.get("/api/auth/me", auth(), (req, res) => {
  res.json({ user: req.user });
});

// Inventory Statistics and Dashboard Analytics
app.get(
  "/api/dashboard",
  auth("owner", "manager", "worker"),
  h(async (req, res) => {
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

      return res.json({
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
      });
    }

    // Standard schema fallback
    const totalTypesRes = await pool.query("SELECT COUNT(*) as count FROM timber");
    const totalQtyRes = await pool.query("SELECT COALESCE(SUM(qty), 0) as total_units FROM timber");
    const totalValRes = await pool.query("SELECT COALESCE(SUM(qty * price), 0) as total_value FROM timber");
    const lowStockRes = await pool.query("SELECT COUNT(*) as low_count FROM timber WHERE qty < min");
    const pendingReqRes = await pool.query("SELECT COUNT(*) as pending_count FROM requests WHERE status = 'Pending'");

    const totals = {
      types: Number(totalTypesRes.rows[0]?.count || 0),
      units: Number(totalQtyRes.rows[0]?.total_units || 0),
      value: Number(totalValRes.rows[0]?.total_value || 0),
      low: Number(lowStockRes.rows[0]?.low_count || 0),
      pendingRequests: Number(pendingReqRes.rows[0]?.pending_count || 0),
    };

    // 2. Stock distribution by timber type (for Bar/Pie Chart)
    const { rows: stockByType } = await pool.query(
      "SELECT INITCAP(TRIM(type)) as type, SUM(qty) as qty, SUM(qty * price) as value FROM timber GROUP BY INITCAP(TRIM(type)) ORDER BY INITCAP(TRIM(type))"
    );

    // 3. Request count grouped by status (for Status Doughnut/Pie Chart)
    const { rows: requestsByStatus } = await pool.query(
      "SELECT status, COUNT(*) as count FROM requests GROUP BY status"
    );

    // 4. Transaction trends by date (for Timeline/Line Chart)
    const { rows: last7Days } = await pool.query(
      "SELECT date, kind, SUM(qty) as qty FROM txns GROUP BY date, kind ORDER BY date DESC LIMIT 30"
    );

    // 5. Timber wastage summary by type
    const { rows: wastageSummary } = await pool.query(
      `SELECT t.type, COALESCE(SUM(w.qty), 0) as wasted_qty 
       FROM wastage w 
       JOIN timber t ON t.id = w.timber_id 
       GROUP BY t.type`
    );

    res.json({
      totals,
      stockByType,
      requestsByStatus,
      last7Days: last7Days.reverse(),
      wastageSummary,
    });
  })
);

// Timber query and search pipeline
async function fetchAllTimberRecords() {
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
}

app.get(
  "/api/timber",
  auth("worker", "manager", "owner"),
  h(async (req, res) => {
    const q = req.query;
    // Step 3: Retrieve timber records from Supabase
    let records = await fetchAllTimberRecords();

    // Step 7: Searching (Binary Search algorithm)
    if (q.search && q.search.trim() !== "") {
      const field = q.searchField || (records[0]?.type ? "type" : "size");
      records = binarySearch(records, field, q.search);
    }

    // Step 6: Filtering (Linear Filtering algorithms)
    if (q.avail) {
      if (q.avail === "in" || q.avail === "in_stock") {
        records = filterInStock(records);
      } else if (q.avail === "out" || q.avail === "out_of_stock") {
        records = filterOutOfStock(records);
      } else if (q.avail === "low" || q.avail === "low_stock") {
        records = filterLowStock(records);
      } else if (q.avail === "available") {
        records = filterAvailable(records);
      } else if (q.avail === "unavailable") {
        records = filterUnavailable(records);
      }
    }

    // Step 5: Sorting (Merge Sort algorithm)
    const sortField = q.sort || "type";
    const sortOrder = String(q.order || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
    records = mergeSort(records, sortField, sortOrder);

    // Step 9 & 10: Display result
    res.json(records);
  })
);

/**
 * Dedicated Algorithm Execution & Benchmarking Endpoint
 * Allows testing and demonstrating Merge Sort, Linear Filtering, and Binary Search
 */
app.post(
  "/api/timber/algorithms",
  auth("worker", "manager", "owner"),
  h(async (req, res) => {
    const { operation, field = "type", order = "ASC", threshold = 10, searchValue } = req.body;
    const records = await fetchAllTimberRecords();
    let result = [];
    let algoName = "";
    let complexity = "";

    switch (String(operation).toLowerCase()) {
      case "sort":
      case "merge_sort":
        algoName = "Merge Sort";
        complexity = "O(n log n)";
        result = mergeSort(records, field, order);
        break;

      case "filter_in_stock":
        algoName = "Linear Filtering (In Stock)";
        complexity = "O(n)";
        result = filterInStock(records, threshold);
        break;

      case "filter_out_of_stock":
        algoName = "Linear Filtering (Out of Stock)";
        complexity = "O(n)";
        result = filterOutOfStock(records);
        break;

      case "filter_low_stock":
        algoName = "Linear Filtering (Low Stock)";
        complexity = "O(n)";
        result = filterLowStock(records, threshold);
        break;

      case "filter_available":
        algoName = "Linear Filtering (Available Timber)";
        complexity = "O(n)";
        result = filterAvailable(records);
        break;

      case "filter_unavailable":
        algoName = "Linear Filtering (Unavailable Timber)";
        complexity = "O(n)";
        result = filterUnavailable(records);
        break;

      case "search":
      case "binary_search":
        algoName = "Binary Search";
        complexity = "O(log n) [with O(n log n) Merge Sort preparation]";
        result = binarySearch(records, field, searchValue);
        break;

      default:
        // Execute main pipeline
        return res.json(processTimberQuery(records, req.body));
    }

    res.json({
      algorithm: algoName,
      timeComplexity: complexity,
      count: result.length,
      records: result,
      message: result.length === 0 ? "No Records Found" : "Success",
    });
  })
);

// Update minimum threshold for timber (manager/owner)
app.patch(
  "/api/timber/:id/min",
  auth("manager", "owner"),
  h(async (req, res) => {
    const newMin = posInt(req.body.min, "Minimum stock must be a positive integer");
    await pool.query("UPDATE timber SET min = $1 WHERE id = $2", [newMin, req.params.id]);
    await checkLow();
    res.json({ message: "Minimum stock threshold updated successfully", min: newMin });
  })
);

// Requests and Allocations
// 1. Submit request (Worker)
app.post(
  "/api/requests",
  auth("worker", "manager", "owner"),
  h(async (req, res) => {
    const { kind, timber_id, type, size, price } = req.body;
    const qty = posInt(req.body.qty, "Requested quantity must be greater than zero");

    if (kind === "allocate") {
      // Worker requests allocation of existing stored timber
      // Enforce Mutex Lock for this timber record to serialize allocation requests and prevent over-allocation race conditions
      return await stockMutex.withLock(timber_id, async () => {
        const { rows } = await pool.query(
          pool.hasEnterpriseSchema
            ? "SELECT t.*, tt.type_name as type, t.quantity as qty, (t.width::float || 'x' || t.length::float || ' ft') as size FROM timber t JOIN timber_type tt ON tt.type_id = t.type_id WHERE t.timber_id = $1"
            : "SELECT * FROM timber WHERE id = $1",
          [timber_id]
        );
        const item = rows[0];
        if (!item) throw new Error("Timber item not found");
        const physicalStock = Number(item.qty ?? item.quantity ?? 0);

        // Mutex Lock concurrency check: calculate currently pending unallocated requests for this timber
        let pendingQty = 0;
        if (pool.hasEnterpriseSchema) {
          const pRes = await pool.query(
            "SELECT COALESCE(SUM(quantity), 0) as total_pending FROM allocation_request WHERE timber_id = $1 AND status = 'Pending'",
            [timber_id]
          );
          pendingQty = Number(pRes.rows[0]?.total_pending || 0);
        } else {
          const pRes = await pool.query(
            "SELECT COALESCE(SUM(qty), 0) as total_pending FROM requests WHERE timber_id = $1 AND kind = 'allocate' AND status = 'Pending'",
            [timber_id]
          );
          pendingQty = Number(pRes.rows[0]?.total_pending || 0);
        }

        const availableUnreserved = Math.max(0, physicalStock - pendingQty);
        if (qty > availableUnreserved) {
          throw new Error(
            `Cannot allocate ${qty} units: Mutex Lock enforced. Only ${availableUnreserved} unreserved units available (${pendingQty} units already reserved out of ${physicalStock} in stock).`
          );
        }

        if (pool.hasEnterpriseSchema) {
          let workerMgrId = null;
          const wRow = await pool.query("SELECT manager_id, owner_id FROM worker WHERE worker_id = $1", [req.user.id]);
          if (wRow.rows.length > 0) {
            if (wRow.rows[0].manager_id) {
              const checkM = await pool.query("SELECT manager_id FROM manager WHERE manager_id = $1", [wRow.rows[0].manager_id]);
              if (checkM.rows.length > 0) workerMgrId = checkM.rows[0].manager_id;
            }
            if (!workerMgrId && wRow.rows[0].owner_id) {
              const sameOwnerM = await pool.query("SELECT manager_id FROM manager WHERE owner_id = $1 ORDER BY manager_id ASC LIMIT 1", [wRow.rows[0].owner_id]);
              workerMgrId = sameOwnerM.rows[0]?.manager_id || null;
            }
          }

          await pool.query(
            "INSERT INTO allocation_request (quantity, status, request_time, worker_id, manager_id, timber_id) VALUES ($1, 'Pending', NOW(), $2, $3, $4)",
            [qty, req.user.id, workerMgrId, timber_id]
          );
        } else {
          await pool.query(
            "INSERT INTO requests (kind, worker_id, timber_id, type, size, qty, status) VALUES ($1, $2, $3, $4, $5, $6, 'Pending')",
            [kind, req.user.id, timber_id, item.type, item.size, qty]
          );
        }

        return res.status(201).json({
          message: "Request submitted successfully",
          reservedQty: qty,
          remainingUnreserved: availableUnreserved - qty,
          mutexLocked: true,
        });
      });
    } else if (kind === "add") {
      // Worker requests adding new timber
      const cleanType = String(type || "").trim();
      if (!cleanType) {
        throw new Error("Timber species / type is required");
      }
      if (/^\d+$/.test(cleanType)) {
        throw new Error("Timber species name cannot be numeric. Please enter a valid wood name (e.g. Teak, Rosewood, Pine, Oak, Cedar)");
      }
      if (!/^[a-zA-Z][a-zA-Z0-9\s\-]{1,49}$/.test(cleanType)) {
        throw new Error("Timber species name must start with a letter and contain valid characters (e.g. Teak, Rosewood)");
      }

      const cleanSize = String(size || "").trim();
      const sizeMatch = cleanSize.match(/^(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*(?:ft|in|m)?)?$/);
      if (!sizeMatch) {
        throw new Error("Invalid timber dimensions. Format must be Diameter x Length with positive numbers (e.g. 4x10 or 12x32)");
      }
      const diam = parseFloat(sizeMatch[1]);
      const len = parseFloat(sizeMatch[2]);
      if (isNaN(diam) || isNaN(len) || diam <= 0 || len <= 0) {
        throw new Error("Timber dimensions (diameter and length) must be positive numbers greater than zero");
      }
      const normalizedSize = `${diam}x${len} ft`;

      const cleanPrice = parseFloat(price);
      if (isNaN(cleanPrice) || cleanPrice <= 0) {
        throw new Error("Price per unit must be greater than zero");
      }

      if (pool.hasEnterpriseSchema) {
        let workerMgrId = null;
        const wRow = await pool.query("SELECT manager_id, owner_id FROM worker WHERE worker_id = $1", [req.user.id]);
        if (wRow.rows.length > 0) {
          if (wRow.rows[0].manager_id) {
            const checkM = await pool.query("SELECT manager_id FROM manager WHERE manager_id = $1", [wRow.rows[0].manager_id]);
            if (checkM.rows.length > 0) workerMgrId = checkM.rows[0].manager_id;
          }
          if (!workerMgrId && wRow.rows[0].owner_id) {
            const sameOwnerM = await pool.query("SELECT manager_id FROM manager WHERE owner_id = $1 ORDER BY manager_id ASC LIMIT 1", [wRow.rows[0].owner_id]);
            workerMgrId = sameOwnerM.rows[0]?.manager_id || null;
          }
        }

        const typeRes = await pool.query("SELECT type_id FROM timber_type WHERE type_name ILIKE $1", [cleanType]);
        let typeId = typeRes.rows[0]?.type_id;
        if (!typeId) {
          const insType = await pool.query("INSERT INTO timber_type (type_name, min_stock_level) VALUES ($1, 20) RETURNING type_id", [cleanType]);
          typeId = insType.rows[0].type_id;
        }
        await pool.query(
          "INSERT INTO add_timber_request (timber_code, quantity, price, status, request_time, worker_id, manager_id, type_id) VALUES ($1, $2, $3, 'Pending', NOW(), $4, $5, $6)",
          [normalizedSize, qty, cleanPrice, req.user.id, workerMgrId, typeId]
        );
      } else {
        await pool.query(
          "INSERT INTO requests (kind, worker_id, type, size, qty, price, status) VALUES ($1, $2, $3, $4, $5, $6, 'Pending')",
          [kind, req.user.id, cleanType, normalizedSize, qty, cleanPrice]
        );
      }
    } else {
      throw new Error("Invalid request kind. Must be 'allocate' or 'add'");
    }

    res.status(201).json({ message: "Request submitted successfully" });
  })
);

// 2. View requests (Manager/Owner view all for their workforce, Worker views own)
app.get(
  "/api/requests",
  auth("manager", "owner", "worker"),
  h(async (req, res) => {
    const isWorker = req.user.role === "worker";
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
      params.push(req.user.id);
    } else if (req.user.role === "owner") {
      conditions.push(`u.owner_id = $${params.length + 1}`);
      params.push(req.user.id);
    } else if (req.user.role === "manager") {
      let mgrOwnerId = null;
      if (pool.hasEnterpriseSchema) {
        const mRow = await pool.query("SELECT owner_id FROM manager WHERE manager_id = $1", [req.user.id]);
        mgrOwnerId = mRow.rows[0]?.owner_id;
      } else {
        const uRow = await pool.query("SELECT owner_id FROM users WHERE id = $1", [req.user.id]);
        mgrOwnerId = uRow.rows[0]?.owner_id;
      }
      if (mgrOwnerId) {
        conditions.push(`u.owner_id = $${params.length + 1}`);
        params.push(mgrOwnerId);
      }
    }

    if (req.query.status) {
      conditions.push(`r.status = $${params.length + 1}`);
      params.push(req.query.status);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY r.id DESC";

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  })
);

// 3. Manager accepts request (allocate or add)
app.post(
  "/api/requests/:id/accept",
  auth("manager", "owner"),
  h(async (req, res) => {
    await tx(async (client) => {
      const { rows } = await client.query(
        `SELECT r.*, u.name as worker_name, u.owner_id as worker_owner_id 
         FROM requests r 
         JOIN users u ON u.id = r.worker_id AND u.role = 'worker'
         WHERE r.id = $1`,
        [req.params.id]
      );
      const reqItem = rows[0];

      if (!reqItem) throw new Error("Request not found");

      // Verify ownership: 2 owners should not manage same managers and workers
      let actorOwnerId = req.user.role === "owner" ? req.user.id : null;
      if (req.user.role === "manager") {
        if (pool.hasEnterpriseSchema) {
          const mRow = await client.query("SELECT owner_id FROM manager WHERE manager_id = $1", [req.user.id]);
          actorOwnerId = mRow.rows[0]?.owner_id;
        } else {
          const uRow = await client.query("SELECT owner_id FROM users WHERE id = $1", [req.user.id]);
          actorOwnerId = uRow.rows[0]?.owner_id;
        }
      }
      if (actorOwnerId && reqItem.worker_owner_id && Number(actorOwnerId) !== Number(reqItem.worker_owner_id)) {
        return res.status(403).json({ error: "Permission denied: this request belongs to another owner's workforce." });
      }

      if (reqItem.status !== "Pending") {
        throw new Error(`Request has already been ${reqItem.status.toLowerCase()}`);
      }

      if (reqItem.kind === "allocate") {
        // Allocate stored timber: verify stock and deduct under stockMutex exclusive lock
        await stockMutex.withLock(reqItem.timber_id, async () => {
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
            const performer = reqItem.worker_name ? `${reqItem.worker_name} (Worker)` : (req.user.name ? `${req.user.name} (Manager)` : "Worker");
            await client.query(
              "INSERT INTO stock_transaction (txn_type, quantity, stock_after, txn_time, timber_id, allocation_id, performed_by) VALUES ('Allocation', $1, $2, NOW(), $3, $4, $5)",
              [reqItem.qty, newStock, reqItem.timber_id, rawId, performer]
            );
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
          }
        });
      } else {
        // Add timber: update existing type+size or insert new row
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
          const performer = reqItem.worker_name ? `${reqItem.worker_name} (Worker)` : (req.user.name ? `${req.user.name} (Manager)` : "Manager");
          await client.query(
            "INSERT INTO stock_transaction (txn_type, quantity, stock_after, txn_time, timber_id, performed_by) VALUES ('Addition', $1, $2, NOW(), $3, $4)",
            [reqItem.qty, newStock, timberId, performer]
          );
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
        }
      }

      // Check low stock triggers
      await checkLow(client);
    });

    res.json({ message: "Request accepted successfully" });
  })
);

// 4. Manager rejects request
app.post(
  "/api/requests/:id/reject",
  auth("manager", "owner"),
  h(async (req, res) => {
    // Verify ownership
    const { rows } = await pool.query(
      `SELECT r.id, u.owner_id as worker_owner_id 
       FROM requests r 
       JOIN users u ON u.id = r.worker_id AND u.role = 'worker'
       WHERE r.id = $1`,
      [req.params.id]
    );
    const reqItem = rows[0];
    if (!reqItem) throw new Error("Request not found");

    let actorOwnerId = req.user.role === "owner" ? req.user.id : null;
    if (req.user.role === "manager") {
      if (pool.hasEnterpriseSchema) {
        const mRow = await pool.query("SELECT owner_id FROM manager WHERE manager_id = $1", [req.user.id]);
        actorOwnerId = mRow.rows[0]?.owner_id;
      } else {
        const uRow = await pool.query("SELECT owner_id FROM users WHERE id = $1", [req.user.id]);
        actorOwnerId = uRow.rows[0]?.owner_id;
      }
    }
    if (actorOwnerId && reqItem.worker_owner_id && Number(actorOwnerId) !== Number(reqItem.worker_owner_id)) {
      return res.status(403).json({ error: "Permission denied: this request belongs to another owner's workforce." });
    }

    if (pool.hasEnterpriseSchema) {
      const idStr = String(req.params.id);
      const rawId = parseInt(idStr.replace(/\D/g, ""), 10);
      if (idStr.startsWith("add_")) {
        await pool.query("UPDATE add_timber_request SET status = 'Rejected', decided_at = NOW() WHERE request_id = $1", [rawId]);
      } else {
        await pool.query("UPDATE allocation_request SET status = 'Rejected', decided_at = NOW() WHERE allocation_id = $1", [rawId]);
      }
    } else {
      const { rowCount } = await pool.query(
        "UPDATE requests SET status = 'Rejected' WHERE id = $1 AND status = 'Pending'",
        [req.params.id]
      );
      if (!rowCount) throw new Error("Request not found or not in Pending status");
    }
    res.json({ message: "Request rejected successfully" });
  })
);

// Transaction History
app.get(
  "/api/txns",
  auth("manager", "owner"),
  h(async (req, res) => {
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
      return res.json(rows);
    }
    const { rows } = await pool.query(
      "SELECT id, date, kind, type, qty, done_by as by, created_at FROM txns ORDER BY id DESC LIMIT 500"
    );
    res.json(rows);
  })
);
app.get("/api/transactions", auth("manager", "owner"), (req, res, next) => {
  // Alias for /api/txns
  app._router.handle({ ...req, url: "/api/txns" }, res, next);
});

// ==========================================
// CONCURRENCY CONTROL: MUTEX LOCK SIMULATION
// Simulates concurrent worker allocation requests against a single stock record.
// User requirement:
// "if there are 20 units of a certain timber then and if one worker requests 17
//  another requests 3 and another requests 20 of the same timber then only 20
//  units can be given/allocated i.e. 17 and 3 or 20 only"
// ==========================================
app.post(
  "/api/mutex/simulate",
  h(async (req, res) => {
    const totalUnits = Number(req.body.initial_stock || 20);
    const workerRequests = Array.isArray(req.body.requests) && req.body.requests.length > 0
      ? req.body.requests
      : [
        { worker: "Worker 1", qty: 17 },
        { worker: "Worker 2", qty: 3 },
        { worker: "Worker 3", qty: 20 },
      ];

    const testMutex = new StockMutexLock();
    let currentStock = totalUnits;
    let allocatedTotal = 0;
    const timeline = [];

    // Run all worker requests concurrently through the mutex lock
    const results = await Promise.all(
      workerRequests.map(async (reqItem, index) => {
        const workerName = reqItem.worker || `Worker ${index + 1}`;
        const requestedQty = Number(reqItem.qty || reqItem);

        const startTime = Date.now();
        timeline.push({
          time: new Date().toISOString(),
          worker: workerName,
          status: "Waiting for Mutex Lock",
          requested: requestedQty,
        });

        return await testMutex.withLock("simulated_stock_item", async () => {
          const lockAcquiredTime = Date.now();
          timeline.push({
            time: new Date().toISOString(),
            worker: workerName,
            status: "Lock Acquired",
            currentStock,
            requested: requestedQty,
          });

          // Small delay to simulate DB critical section
          await new Promise((resolve) => setTimeout(resolve, 30));

          if (requestedQty <= currentStock) {
            currentStock -= requestedQty;
            allocatedTotal += requestedQty;
            const outcome = {
              worker: workerName,
              requested: requestedQty,
              granted: true,
              allocated: requestedQty,
              stockRemaining: currentStock,
              waitTimeMs: lockAcquiredTime - startTime,
              message: `Granted ${requestedQty} units under Mutex Lock. Stock remaining: ${currentStock}.`,
            };
            timeline.push({
              time: new Date().toISOString(),
              worker: workerName,
              status: "Granted & Released Lock",
              remaining: currentStock,
            });
            return outcome;
          } else {
            const outcome = {
              worker: workerName,
              requested: requestedQty,
              granted: false,
              allocated: 0,
              stockRemaining: currentStock,
              waitTimeMs: lockAcquiredTime - startTime,
              error: `Mutex Lock Rejected: Requested ${requestedQty} units exceeds available stock of ${currentStock} units (${allocatedTotal} units already allocated out of ${totalUnits}).`,
            };
            timeline.push({
              time: new Date().toISOString(),
              worker: workerName,
              status: "Rejected & Released Lock",
              remaining: currentStock,
            });
            return outcome;
          }
        });
      })
    );

    res.json({
      initialStock: totalUnits,
      totalAllocated: allocatedTotal,
      finalStockRemaining: currentStock,
      maxStockLimitEnforced: allocatedTotal <= totalUnits,
      workerResults: results,
      timeline,
      summary: `Out of ${totalUnits} initial units, exactly ${allocatedTotal} units allocated. Over-allocation was prevented by Mutex Lock.`,
    });
  })
);

// Timber Wastage Management
// Worker fetches timber allocated to them
app.get(
  "/api/allocations/mine",
  auth("worker", "manager", "owner"),
  h(async (req, res) => {
    const workerId = req.user.id;
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
        WHERE ${req.user.role === 'worker' ? 'ar.worker_id = $1 AND' : ''} ar.status ILIKE 'Approved'
        GROUP BY ar.allocation_id, ar.timber_id, tt.type_name, t.width, t.length, ar.quantity, ar.status, ar.request_time
        ORDER BY ar.allocation_id DESC
      `, req.user.role === 'worker' ? [workerId] : []);
      return res.json(rows);
    } else {
      const { rows } = await pool.query(`
        SELECT r.id as allocation_id, r.id, r.timber_id, r.type, r.size, r.qty as allocated_qty,
               COALESCE(SUM(w.qty), 0)::float8 as wasted_qty,
               (r.qty - COALESCE(SUM(w.qty), 0))::float8 as remaining_qty,
               r.status, r.created_at as date
        FROM requests r
        LEFT JOIN wastage w ON w.timber_id = r.timber_id AND w.worker_id = r.worker_id
        WHERE ${req.user.role === 'worker' ? 'r.worker_id = $1 AND' : ''} r.kind = 'allocate' AND (r.status = 'Accepted' OR r.status = 'Approved')
        GROUP BY r.id, r.timber_id, r.type, r.size, r.qty, r.status, r.created_at
        ORDER BY r.id DESC
      `, req.user.role === 'worker' ? [workerId] : []);
      return res.json(rows);
    }
  })
);

app.post(
  "/api/wastage",
  auth("worker", "manager", "owner"),
  h(async (req, res) => {
    const qty = posFloat(req.body.qty, "Wastage length in ft must be greater than 0");
    const reason = String(req.body.reason || "").trim();
    if (!reason) {
      throw new Error("Reason for wastage is required");
    }
    if (/^\d+$/.test(reason)) {
      throw new Error("Reason must be text only. Numeric values are not allowed.");
    }
    if (!/^[a-zA-Z][a-zA-Z0-9\s,.'\-\/]{1,199}$/.test(reason) || /^\d/.test(reason) || !/[a-zA-Z]{2,}/.test(reason)) {
      throw new Error("Reason must be descriptive text only (e.g. End grain split, deep rot, knots, saw blade defect)");
    }
    const allocation_id = req.body.allocation_id ? Number(req.body.allocation_id) : null;
    let timber_id = req.body.timber_id ? Number(req.body.timber_id) : null;

    if (!allocation_id && !timber_id) {
      throw new Error("Please select the allocated timber item to record wastage");
    }

    await tx(async (client) => {
      if (pool.hasEnterpriseSchema) {
        // Supabase Enterprise Schema
        let resolvedAllocId = allocation_id;
        let resolvedTimberId = timber_id;

        if (allocation_id) {
          const allocRes = await client.query(`
            SELECT ar.allocation_id, ar.timber_id, ar.quantity as allocated_qty,
                   tt.type_name as type, (t.width::float || 'x' || t.length::float || ' ft') as size,
                   COALESCE(SUM(ws.quantity), 0)::float8 as already_wasted
            FROM allocation_request ar
            JOIN timber t ON t.timber_id = ar.timber_id
            JOIN timber_type tt ON tt.type_id = t.type_id
            LEFT JOIN wastage ws ON ws.allocation_id = ar.allocation_id
            WHERE ar.allocation_id = $1 ${req.user.role === 'worker' ? 'AND ar.worker_id = $2' : ''}
            GROUP BY ar.allocation_id, ar.timber_id, ar.quantity, tt.type_name, t.width, t.length
          `, req.user.role === 'worker' ? [allocation_id, req.user.id] : [allocation_id]);
          const allocItem = allocRes.rows[0];
          if (!allocItem) {
            throw new Error("Allocated timber record not found or not allocated to you");
          }
          resolvedTimberId = allocItem.timber_id;
          if (Number(allocItem.already_wasted || 0) > 0) {
            throw new Error(`Wastage has already been recorded for this allocated wood (Allocation #${resolvedAllocId}). A worker cannot allot wastage for a certain wood more than once.`);
          }
          const remainingUsable = Number(allocItem.allocated_qty) - Number(allocItem.already_wasted);
          if (qty > remainingUsable) {
            throw new Error(`Wastage quantity (${qty} ft) exceeds remaining allocated timber (${remainingUsable} ft)`);
          }
        } else {
          // If timber_id was passed, find worker's allocation for that timber that has NOT had wastage allotted yet
          const allocRes = await client.query(`
            SELECT ar.allocation_id FROM allocation_request ar
            WHERE ar.timber_id = $1 ${req.user.role === 'worker' ? 'AND ar.worker_id = $2' : ''} AND ar.status ILIKE 'Approved'
            AND NOT EXISTS (SELECT 1 FROM wastage w WHERE w.allocation_id = ar.allocation_id)
            ORDER BY ar.allocation_id DESC LIMIT 1
          `, req.user.role === 'worker' ? [timber_id, req.user.id] : [timber_id]);
          if (allocRes.rows[0]) {
            resolvedAllocId = allocRes.rows[0].allocation_id;
          } else {
            const prevAlloc = await client.query(`
              SELECT ar.allocation_id FROM allocation_request ar
              WHERE ar.timber_id = $1 ${req.user.role === 'worker' ? 'AND ar.worker_id = $2' : ''} AND ar.status ILIKE 'Approved'
              LIMIT 1
            `, req.user.role === 'worker' ? [timber_id, req.user.id] : [timber_id]);
            if (prevAlloc.rows.length > 0) {
              throw new Error("Wastage has already been recorded for this wood. A worker cannot allot wastage for a certain wood more than once.");
            }
            let autoMgrId = null;
            if (req.user.role === 'worker') {
              const wRow = await client.query("SELECT manager_id FROM worker WHERE worker_id = $1", [req.user.id]);
              if (wRow.rows[0]?.manager_id) {
                const checkM = await client.query("SELECT manager_id FROM manager WHERE manager_id = $1", [wRow.rows[0].manager_id]);
                if (checkM.rows.length > 0) autoMgrId = checkM.rows[0].manager_id;
              }
            }
            if (!autoMgrId) {
              const anyM = await client.query("SELECT manager_id FROM manager ORDER BY manager_id ASC LIMIT 1");
              autoMgrId = anyM.rows[0]?.manager_id || null;
            }

            let autoWorkerId = req.user.role === 'worker' ? req.user.id : null;
            if (!autoWorkerId) {
              const anyW = await client.query("SELECT worker_id FROM worker ORDER BY worker_id ASC LIMIT 1");
              autoWorkerId = anyW.rows[0]?.worker_id || null;
            }

            const newAlloc = await client.query(
              "INSERT INTO allocation_request (quantity, status, request_time, worker_id, manager_id, timber_id) VALUES ($1, 'Approved', NOW(), $2, $3, $4) RETURNING allocation_id",
              [qty, autoWorkerId, autoMgrId, timber_id]
            );
            resolvedAllocId = newAlloc.rows[0].allocation_id;
          }
        }

        // Deduct from timber stock
        const stockRes = await client.query("SELECT timber_id, quantity FROM timber WHERE timber_id = $1", [resolvedTimberId]);
        const currentTimber = stockRes.rows[0];
        const newStock = Math.max(0, (currentTimber?.quantity || 0) - qty);
        await client.query("UPDATE timber SET quantity = $1 WHERE timber_id = $2", [newStock, resolvedTimberId]);

        // Insert record into wastage table
        const wasteRes = await client.query(
          "INSERT INTO wastage (quantity, reason, worker_id, allocation_id, recorded_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING wastage_id",
          [qty, reason || "Cutting / trimming loss", req.user.id || 1, resolvedAllocId]
        );
        const wastageId = wasteRes.rows[0]?.wastage_id;

        // Record in stock_transaction (allocation_id is null for wastage transactions due to UNIQUE constraint)
        const performer = req.user.name ? `${req.user.name} (Worker)` : "Worker";
        await client.query(
          "INSERT INTO stock_transaction (txn_type, quantity, stock_after, txn_time, timber_id, wastage_id, allocation_id, performed_by) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)",
          ["Wastage", qty, newStock, resolvedTimberId, wastageId, null, performer]
        );

        // Check low stock triggers
        await checkLow(client);
      } else {
        // Standard Schema
        const stockRes = await client.query("SELECT * FROM timber WHERE id = $1", [timber_id]);
        const timber = stockRes.rows[0];
        if (!timber) throw new Error("Timber item not found");

        const existingWaste = await client.query(
          "SELECT id FROM wastage WHERE timber_id = $1 AND worker_id = $2 LIMIT 1",
          [timber_id, req.user.id]
        );
        if (existingWaste.rows.length > 0) {
          throw new Error("Wastage has already been recorded for this wood. A worker cannot allot wastage for a certain wood more than once.");
        }

        const currentQty = Number(timber.qty ?? timber.quantity ?? 0);
        if (qty > currentQty) {
          throw new Error(`Recorded wastage (${qty}) cannot exceed currently available stock (${currentQty})`);
        }

        // Deduct wasted quantity from timber stock
        await client.query("UPDATE timber SET qty = qty - $1 WHERE id = $2", [qty, timber_id]);

        // Insert record into wastage table
        await client.query(
          "INSERT INTO wastage (timber_id, worker_id, qty, reason, date) VALUES ($1, $2, $3, $4, date('now'))",
          [timber_id, req.user.id, qty, reason || "Unspecified"]
        );

        // Record in general transactions
        await client.query(
          "INSERT INTO txns (date, kind, type, qty, done_by) VALUES (date('now'), $1, $2, $3, $4)",
          [`Wastage${reason ? ` - ${reason}` : ""}`, timber.type, qty, req.user.name]
        );

        // Check if this deduction causes stock to fall below minimum threshold
        await checkLow(client);
      }
    });

    res.status(201).json({ message: "Timber wastage recorded and accounted for successfully" });
  })
);

// View wastage log
app.get(
  "/api/wastage",
  auth("manager", "owner", "worker"),
  h(async (req, res) => {
    const isWorker = req.user.role === "worker";

    // Determine owner scope so 2 owners never manage the same workers' wastage
    let targetOwnerId = null;
    if (req.user.role === "owner") {
      targetOwnerId = req.user.id;
    } else if (req.user.role === "manager") {
      if (pool.hasEnterpriseSchema) {
        const mRow = await pool.query("SELECT owner_id FROM manager WHERE manager_id = $1", [req.user.id]);
        targetOwnerId = mRow.rows[0]?.owner_id || null;
      } else {
        const uRow = await pool.query("SELECT owner_id FROM users WHERE id = $1", [req.user.id]);
        targetOwnerId = uRow.rows[0]?.owner_id || null;
      }
    }

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
        params.push(req.user.id);
      } else if (targetOwnerId) {
        conditions.push(`u.owner_id = $${params.length + 1}`);
        params.push(targetOwnerId);
      }

      if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
      }

      sql += " ORDER BY w.wastage_id DESC LIMIT 500";
      const { rows } = await pool.query(sql, params);
      return res.json(rows);
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
      params.push(req.user.id);
    } else if (targetOwnerId) {
      conditions.push(`u.owner_id = $${params.length + 1}`);
      params.push(targetOwnerId);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY w.id DESC LIMIT 500";

    const { rows } = await pool.query(sql, params);
    res.json(rows);
  })
);

// User Management
const getManageableRoles = (actorRole) => {
  if (actorRole === "owner") return ["manager", "worker"];
  if (actorRole === "manager") return ["worker"];
  return [];
};

async function resequenceAccounts() {
  if (!pool.hasEnterpriseSchema) return;
  try {
    // Resequence managers
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

    // Resequence workers
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
}

// 1. List manageable users
app.get(
  "/api/users",
  auth("owner", "manager"),
  h(async (req, res) => {
    await resequenceAccounts();
    const allowedRoles = getManageableRoles(req.user.role);
    const placeholders = allowedRoles.map((_, i) => `$${i + 1}`).join(", ");

    // Determine owner scope so 2 owners never manage the same managers and workers
    let targetOwnerId = null;
    if (req.user.role === "owner") {
      targetOwnerId = req.user.id;
    } else if (req.user.role === "manager") {
      if (pool.hasEnterpriseSchema) {
        const mRow = await pool.query("SELECT owner_id FROM manager WHERE manager_id = $1", [req.user.id]);
        targetOwnerId = mRow.rows[0]?.owner_id || null;
      } else {
        const uRow = await pool.query("SELECT owner_id FROM users WHERE id = $1", [req.user.id]);
        targetOwnerId = uRow.rows[0]?.owner_id || null;
      }
    }

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
    res.json(rows);
  })
);

// 2. Add user (Owner can add manager/worker; Manager can only add worker)
app.post(
  "/api/users",
  auth("owner", "manager"),
  h(async (req, res) => {
    const { name, email, password, role, phone, address, warehouse } = req.body;
    const allowedRoles = getManageableRoles(req.user.role);

    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        error: `Permission denied: ${req.user.role}s are only permitted to create ${allowedRoles.join(" or ")} accounts.`,
      });
    }

    if (!name || !email || !password || password.length < 6) {
      throw new Error("Name, valid email, and password of at least 6 characters are required");
    }

    const cleanName = String(name || "").trim();
    if (/^\d+$/.test(cleanName) || /^-?\d+$/.test(cleanName) || /[0-9=<>_$%^&*()+!]/.test(cleanName)) {
      throw new Error("Name cannot be numbers or symbols. It must be text only (e.g. Ramesh Kumar).");
    }
    if (!/^[a-zA-Z][a-zA-Z\s\-\.']{1,99}$/.test(cleanName)) {
      throw new Error("Name must start with a letter and contain text only (e.g. Ramesh Kumar).");
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [cleanEmail]);
    if (existing.rows.length > 0) {
      throw new Error("A user account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userPhone = validatePhone(phone, "+91 9999900000");
    const warehouseInput = (warehouse || address || "").trim();
    if (role === "manager") {
      if (!warehouseInput) {
        throw new Error("Warehouse name that the manager belongs to is required");
      }
      if (/^\d+$/.test(warehouseInput) || /^-?\d+$/.test(warehouseInput) || /[0-9=<>_$%^&*()+!]/.test(warehouseInput)) {
        throw new Error("Warehouse name cannot be numbers or symbols. It must be text only (e.g. Gokul Road, Central Yard).");
      }
      if (!/^[a-zA-Z][a-zA-Z\s\-\.]{1,99}$/.test(warehouseInput)) {
        throw new Error("Warehouse name must start with a letter and contain text only (e.g. Gokul Road, Central Yard).");
      }
    }
    const userAddress = warehouseInput || (role === "manager" ? "Main Warehouse" : "Durga Timbers Hubli");

    if (pool.hasEnterpriseSchema) {
      let activeOwnerId = null;
      if (req.user.role === "owner") {
        const checkOwner = await pool.query("SELECT owner_id FROM owner WHERE owner_id = $1", [req.user.id]);
        if (checkOwner.rows.length > 0) {
          activeOwnerId = checkOwner.rows[0].owner_id;
        }
      } else if (req.user.role === "manager") {
        const mgrRow = await pool.query("SELECT owner_id FROM manager WHERE manager_id = $1", [req.user.id]);
        if (mgrRow.rows.length > 0) {
          activeOwnerId = mgrRow.rows[0].owner_id;
        }
      }

      if (!activeOwnerId) {
        throw new Error("No active owner account associated with current user session.");
      }

      if (role === "manager") {
        await pool.query(
          "INSERT INTO manager (name, email, phone, address, password_hash, is_active, owner_id) VALUES ($1, $2, $3, $4, $5, true, $6)",
          [name.trim(), cleanEmail, userPhone, userAddress, passwordHash, activeOwnerId]
        );
      } else if (role === "worker") {
        let activeManagerId = null;
        if (req.user.role === "manager") {
          const checkMgr = await pool.query("SELECT manager_id FROM manager WHERE manager_id = $1", [req.user.id]);
          if (checkMgr.rows.length > 0) {
            activeManagerId = checkMgr.rows[0].manager_id;
          }
        }
        await pool.query(
          "INSERT INTO worker (name, email, phone, address, password_hash, is_active, owner_id, manager_id) VALUES ($1, $2, $3, $4, $5, true, $6, $7)",
          [name.trim(), cleanEmail, userPhone, userAddress, passwordHash, activeOwnerId, activeManagerId]
        );
      }
    } else {
      let activeOwnerId = req.user.role === "owner" ? req.user.id : null;
      let activeManagerId = req.user.role === "manager" ? req.user.id : null;
      if (req.user.role === "manager" && !activeOwnerId) {
        const uRow = await pool.query("SELECT owner_id FROM users WHERE id = $1", [req.user.id]);
        activeOwnerId = uRow.rows[0]?.owner_id || null;
      }
      await pool.query(
        "INSERT INTO users (name, email, password_hash, role, address, owner_id, manager_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [name.trim(), cleanEmail, passwordHash, role, userAddress, activeOwnerId, activeManagerId]
      );
    }

    res.status(201).json({ message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully` });
  })
);

// 3. Remove user (Owner can delete manager/worker; Manager can only delete worker)
app.delete(
  "/api/users/:id",
  auth("owner", "manager"),
  h(async (req, res) => {
    const targetUserId = req.params.id;
    const requestedRole = req.query.role || req.body?.role || (req.user.role === "manager" ? "worker" : null);

    // Prevent self-deletion
    if (Number(targetUserId) === req.user.id && (!requestedRole || req.user.role === requestedRole)) {
      throw new Error("You cannot delete your own account");
    }

    let query = "SELECT id, role, name, owner_id, manager_id FROM users WHERE id = $1";
    const queryParams = [targetUserId];
    if (requestedRole) {
      query += " AND role = $2";
      queryParams.push(requestedRole);
    }

    const { rows } = await pool.query(query, queryParams);
    const target = rows[0];

    if (!target) throw new Error("User account not found");

    const allowedRoles = getManageableRoles(req.user.role);
    if (!allowedRoles.includes(target.role)) {
      return res.status(403).json({
        error: `Permission denied: ${req.user.role}s cannot delete an account with the role '${target.role}'.`,
      });
    }

    // Ownership verification: 2 owners should not manage same managers and workers!
    if (req.user.role === "owner") {
      if (target.owner_id && Number(target.owner_id) !== Number(req.user.id)) {
        return res.status(403).json({
          error: "Permission denied: you cannot delete an account belonging to another owner.",
        });
      }
    } else if (req.user.role === "manager") {
      let mgrOwnerId = null;
      if (pool.hasEnterpriseSchema) {
        const mRow = await pool.query("SELECT owner_id FROM manager WHERE manager_id = $1", [req.user.id]);
        mgrOwnerId = mRow.rows[0]?.owner_id;
      } else {
        const uRow = await pool.query("SELECT owner_id FROM users WHERE id = $1", [req.user.id]);
        mgrOwnerId = uRow.rows[0]?.owner_id;
      }
      if (mgrOwnerId && target.owner_id && Number(target.owner_id) !== Number(mgrOwnerId)) {
        return res.status(403).json({
          error: "Permission denied: you cannot delete a worker belonging to another owner.",
        });
      }
    }

    if (pool.hasEnterpriseSchema) {
      if (target.role === "manager") {
        await pool.query("DELETE FROM manager WHERE manager_id = $1", [targetUserId]);
      } else if (target.role === "worker") {
        await pool.query("DELETE FROM worker WHERE worker_id = $1", [targetUserId]);
      }
      await resequenceAccounts();
    } else {
      await pool.query("DELETE FROM users WHERE id = $1", [targetUserId]);
    }

    res.json({ message: `User '${target.name}' (${target.role}) removed successfully` });
  })
);

// Stock Notifications
app.get(
  "/api/notifications",
  auth("manager", "owner"),
  h(async (req, res) => {
    // Run real-time check before returning notifications
    await checkLow();

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
      return res.json(rows);
    }

    const { rows } = await pool.query(
      "SELECT * FROM notifications WHERE is_read = 0 ORDER BY id DESC"
    );
    res.json(rows);
  })
);

app.patch(
  "/api/notifications/:id/read",
  auth("manager", "owner"),
  h(async (req, res) => {
    if (pool.hasEnterpriseSchema) {
      await pool.query("UPDATE low_stock_alert SET is_read = true WHERE alert_id = $1", [req.params.id]);
    } else {
      await pool.query("UPDATE notifications SET is_read = 1 WHERE id = $1", [req.params.id]);
    }
    res.json({ message: "Notification marked as read" });
  })
);

// ==========================================
// SERVER INITIALIZATION
// ==========================================
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await initDb();
    await checkLow(); // Perform initial low stock check

    const server = app.listen(PORT, () => {
      console.log(`Durga Timbers ERP Backend running on http://localhost:${PORT}`);
    });
    return server;
  } catch (err) {
    console.error("Failed to start backend server:", err);
    process.exit(1);
  }
}

// Start server if executed directly
if (process.argv[1] && (process.argv[1].endsWith("server.js") || process.argv[1].endsWith("server"))) {
  startServer();
}

export default app;
