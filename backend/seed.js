import bcrypt from "bcryptjs";
import { pool, initDb } from "./db/index.js";

async function seed() {
  await initDb();

  const users = [
    ["Owner Admin", "owner@gmail.com", "12345678", "owner"],
    ["Production Manager", "manager@gmail.com", "12345678", "manager"],
    ["Ravi K", "worker@gmail.com", "12345678", "worker"],
  ];

  for (const [name, email, pw, role] of users) {
    const hash = await bcrypt.hash(pw, 10);
    await pool.query(
      pool.isSqlite
        ? "INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)"
        : "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING",
      [name, email, hash, role]
    );
  }

  const timber = [
    ["Teak", "10x10", 100, 20, 10000, "2026-10-01"],
    ["Rosewood", "5x5", 50, 10, 50000, "2026-10-12"],
    ["Mahogany", "3x3", 30, 10, 5000, "2026-10-20"],
    ["Oak", "2x2", 8, 15, 15000, "2026-11-02"],
  ];

  for (const [type, size, qty, min, price, date] of timber) {
    await pool.query(
      pool.isSqlite
        ? "INSERT OR IGNORE INTO timber (type, size, qty, min, price, date) VALUES ($1, $2, $3, $4, $5, $6)"
        : "INSERT INTO timber (type, size, qty, min, price, date) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (type, size) DO NOTHING",
      [type, size, qty, min, price, date]
    );
  }

  console.log("Database seeded successfully.");
  if (pool.end) await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
