import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "durga_timbers_super_secret_jwt_key_2026";
const JWT_EXPIRES_IN = "24h";

/**
 * Sign a JWT token containing user details
 * @param {Object} user 
 * @returns {string} token
 */
export function sign(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      owner_id: user.owner_id ?? (user.role === "owner" ? user.id : null),
      manager_id: user.manager_id ?? null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Role-based authentication middleware (RBAC)
 * Satisfies NFR3 (100% protected endpoints require auth + RBAC)
 * @param  {...string} roles - Allowed roles (e.g., 'owner', 'manager', 'worker')
 */
export function auth(...roles) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Access denied. No token provided." });
    }

    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;

      // Check role authorization if roles are specified
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({
          error: `Forbidden: role '${decoded.role}' does not have access to this resource.`,
        });
      }

      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token." });
    }
  };
}
