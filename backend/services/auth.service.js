import bcrypt from "bcryptjs";
import { sign } from "../middleware/auth.js";
import { authRepo } from "../db/auth.repo.js";
import { pool } from "../db/index.js";
import { validatePhone } from "../middleware/validate.js";

export const authService = {
  async login({ email, password }) {
    const cleanEmail = String(email || "").toLowerCase().trim();
    const cleanPassword = String(password || "").trim();

    if (!cleanEmail || !cleanPassword) {
      const err = new Error("Email and password are required");
      err.status = 400;
      throw err;
    }

    const user = await authRepo.findUserByEmail(cleanEmail);
    if (!user) {
      const err = new Error("Invalid email or password");
      err.status = 401;
      throw err;
    }

    const validPassword = await bcrypt.compare(cleanPassword, user.password_hash);
    if (!validPassword) {
      const err = new Error("Invalid email or password");
      err.status = 401;
      throw err;
    }

    const token = sign(user);
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  },

  async registerOwner({ name, email, password, phone, address }) {
    if (!name || !email || !password) {
      const err = new Error("Name, email, and password are required");
      err.status = 400;
      throw err;
    }

    const cleanName = String(name || "").trim();
    if (
      /^\d+$/.test(cleanName) ||
      /^-?\d+$/.test(cleanName) ||
      /[0-9=<>_$%^&*()+!]/.test(cleanName) ||
      !/^[a-zA-Z][a-zA-Z\s\-\.']{1,99}$/.test(cleanName)
    ) {
      const err = new Error("Name cannot be numbers or symbols. It must be text only (e.g. Ramesh Kumar).");
      err.status = 400;
      throw err;
    }

    if (String(password).length < 6) {
      const err = new Error("Password must be at least 6 characters long");
      err.status = 400;
      throw err;
    }

    const cleanedEmail = email.toLowerCase().trim();
    const exists = await authRepo.checkEmailExists(cleanedEmail);
    if (exists) {
      const err = new Error("An account with this email already exists");
      err.status = 400;
      throw err;
    }

    const hash = await bcrypt.hash(String(password).trim(), 10);
    const validPhone = validatePhone(phone, "+91 9999999999");
    const validAddress = address ? address.trim() : "Headquarters";

    let newOwner;
    if (pool.hasEnterpriseSchema) {
      newOwner = await authRepo.createOwnerEnterprise({
        name: cleanName,
        email: cleanedEmail,
        phone: validPhone,
        address: validAddress,
        hash,
      });
    } else {
      newOwner = await authRepo.createOwnerStandard({
        name: cleanName,
        email: cleanedEmail,
        hash,
      });
    }

    const userObj = {
      id: newOwner.id,
      name: newOwner.name,
      email: newOwner.email,
      role: "owner",
    };
    const token = sign(userObj);

    return {
      message: "Owner account registered successfully",
      token,
      user: userObj,
    };
  },
};
