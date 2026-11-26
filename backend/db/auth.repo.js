import { pool, initDb, tx } from "./index.js";

export const authRepo = {
  async findUserByEmail(email) {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return rows[0] || null;
  },

  async checkEmailExists(email) {
    const { rows } = await pool.query("SELECT id FROM users WHERE LOWER(email) = $1", [email]);
    return rows.length > 0;
  },

  async createOwnerEnterprise({ name, email, phone, address, hash }) {
    const { rows } = await pool.query(
      "INSERT INTO owner (name, email, phone, address, password_hash, is_active) VALUES ($1, $2, $3, $4, $5, true) RETURNING owner_id as id, name, email",
      [name, email, phone, address, hash]
    );
    return rows[0];
  },

  async createOwnerStandard({ name, email, hash }) {
    const { rows } = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'owner') RETURNING id, name, email",
      [name, email, hash]
    );
    return rows[0];
  },
};
