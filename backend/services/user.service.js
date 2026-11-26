import bcrypt from "bcryptjs";
import { userRepo } from "../db/user.repo.js";
import { pool } from "../db/index.js";
import { validatePhone } from "../middleware/validate.js";

const getManageableRoles = (actorRole) => {
  if (actorRole === "owner") return ["manager", "worker"];
  if (actorRole === "manager") return ["worker"];
  return [];
};

export const userService = {
  getManageableRoles,

  async listUsers(user) {
    await userRepo.resequenceAccounts();
    const allowedRoles = getManageableRoles(user.role);
    const targetOwnerId = await userRepo.getActiveOwnerId(user);
    return await userRepo.getUsersByRolesAndOwner(allowedRoles, targetOwnerId);
  },

  async createUser({ name, email, password, role, phone, address, warehouse, actorUser }) {
    const allowedRoles = getManageableRoles(actorUser.role);

    if (!role || !allowedRoles.includes(role)) {
      const err = new Error(`Permission denied: ${actorUser.role}s are only permitted to create ${allowedRoles.join(" or ")} accounts.`);
      err.status = 403;
      throw err;
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
    const exists = await userRepo.checkEmailExists(cleanEmail);
    if (exists) {
      throw new Error("A user account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userPhone = validatePhone(phone, "+91 9999900000");
    const warehouseInput = (warehouse || address || "").trim();

    if (role === "manager") {
      if (warehouse !== undefined && !warehouseInput) {
        throw new Error("Warehouse name that the manager belongs to is required");
      }
      if (warehouseInput) {
        if (/^\d+$/.test(warehouseInput) || /^-?\d+$/.test(warehouseInput) || /[0-9=<>_$%^&*()+!]/.test(warehouseInput)) {
          throw new Error("Warehouse name cannot be numbers or symbols. It must be text only (e.g. Gokul Road, Central Yard).");
        }
        if (!/^[a-zA-Z][a-zA-Z\s\-\.]{1,99}$/.test(warehouseInput)) {
          throw new Error("Warehouse name must start with a letter and contain text only (e.g. Gokul Road, Central Yard).");
        }
      }
    }

    const userAddress = warehouseInput || (role === "manager" ? "Main Warehouse" : "Durga Timbers Hubli");
    const activeOwnerId = await userRepo.getActiveOwnerId(actorUser);

    if (!activeOwnerId) {
      throw new Error("No active owner account associated with current user session.");
    }

    if (pool.hasEnterpriseSchema) {
      if (role === "manager") {
        await userRepo.createManagerEnterprise({
          name: cleanName,
          email: cleanEmail,
          phone: userPhone,
          address: userAddress,
          passwordHash,
          ownerId: activeOwnerId,
        });
      } else if (role === "worker") {
        const activeManagerId = actorUser.role === "manager" ? actorUser.id : null;
        await userRepo.createWorkerEnterprise({
          name: cleanName,
          email: cleanEmail,
          phone: userPhone,
          address: userAddress,
          passwordHash,
          ownerId: activeOwnerId,
          managerId: activeManagerId,
        });
      }
    } else {
      const activeManagerId = actorUser.role === "manager" ? actorUser.id : null;
      await userRepo.createUserStandard({
        name: cleanName,
        email: cleanEmail,
        passwordHash,
        role,
        address: userAddress,
        ownerId: activeOwnerId,
        managerId: activeManagerId,
      });
    }

    return { message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully` };
  },

  async deleteUser({ targetUserId, requestedRole, actorUser }) {
    if (Number(targetUserId) === actorUser.id && (!requestedRole || actorUser.role === requestedRole)) {
      throw new Error("You cannot delete your own account");
    }

    const allowedRoles = getManageableRoles(actorUser.role);
    const target = await userRepo.findUserByIdAndRole(targetUserId, requestedRole, allowedRoles);
    if (!target) {
      throw new Error("User account not found");
    }
    if (!allowedRoles.includes(target.role)) {
      const err = new Error(`Permission denied: ${actorUser.role}s cannot delete an account with the role '${target.role}'.`);
      err.status = 403;
      throw err;
    }

    const actorOwnerId = await userRepo.getActiveOwnerId(actorUser);
    if (actorOwnerId && target.owner_id && Number(target.owner_id) !== Number(actorOwnerId)) {
      const err = new Error("Permission denied: you cannot delete an account belonging to another owner.");
      err.status = 403;
      throw err;
    }

    await userRepo.deleteUser(targetUserId, target.role);
    return { message: `User '${target.name}' (${target.role}) removed successfully` };
  },
};
