/**
 * API Service for Durga Timbers ERP Frontend
 * Bridges all Functional Requirements (FR1 - FR9) to the backend API.
 */

const API_BASE = "http://localhost:5000/api";

// Helper to get stored auth token safely
export function getToken() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem("token") || "";
}

// Helper to get stored user object safely
export function getCurrentUser() {
  if (typeof localStorage === "undefined") return null;
  const u = localStorage.getItem("user");
  try {
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

// Core HTTP request handler with Bearer token injection
async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 204) return true;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `HTTP error ${response.status}`);
  }

  return data;
}

export const api = {
  // ==========================================
  // FR1: Authentication & Role-Specific Login
  // ==========================================
  async login(email, password) {
    const res = await request("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.token && typeof localStorage !== "undefined") {
      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      localStorage.setItem("currentScreen", res.user.role);
    }
    return res;
  },

  async registerOwner({ name, email, password, phone, address }) {
    const res = await request("/auth/register-owner", {
      method: "POST",
      body: JSON.stringify({ name, email, password, phone, address }),
    });
    if (res?.token && typeof localStorage !== "undefined") {
      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      localStorage.setItem("currentScreen", "owner");
    }
    return res;
  },

  logout() {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("currentScreen");
    }
  },

  async getMe() {
    return request("/me");
  },

  // ==========================================
  // FR2: Requests & Allocations
  // ==========================================
  async requestAllocation(timber_id, qty) {
    return request("/requests", {
      method: "POST",
      body: JSON.stringify({ kind: "allocate", timber_id, qty }),
    });
  },

  async requestAddTimber({ type, size, qty, price }) {
    return request("/requests", {
      method: "POST",
      body: JSON.stringify({ kind: "add", type, size, qty, price }),
    });
  },

  async getRequests(status = "") {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return request(`/requests${query}`);
  },

  async acceptRequest(requestId) {
    return request(`/requests/${requestId}/accept`, { method: "POST" });
  },

  async rejectRequest(requestId) {
    return request(`/requests/${requestId}/reject`, { method: "POST" });
  },

  // ==========================================
  // FR3: Dashboard Statistics & Chart Data
  // ==========================================
  async getDashboardStats() {
    return request("/dashboard");
  },

  // ==========================================
  // FR4: Search, View, Sort & Filter Timber Stock
  // ==========================================
  async getTimber(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== "" && val !== "all") {
        params.append(key, val);
      }
    });
    const queryString = params.toString();
    return request(`/timber${queryString ? `?${queryString}` : ""}`);
  },

  async updateMinThreshold(timberId, min) {
    return request(`/timber/${timberId}/min`, {
      method: "PATCH",
      body: JSON.stringify({ min }),
    });
  },

  async runAlgorithm(operationPayload) {
    return request("/timber/algorithms", {
      method: "POST",
      body: JSON.stringify(operationPayload),
    });
  },

  // ==========================================
  // FR5: Transaction History
  // ==========================================
  async getTransactions() {
    return request("/txns");
  },

  // ==========================================
  // FR6: Timber Wastage Management
  // ==========================================
  async getMyAllocations() {
    return request("/allocations/mine");
  },

  async recordWastage({ allocation_id, timber_id, qty, reason }) {
    return request("/wastage", {
      method: "POST",
      body: JSON.stringify({ allocation_id, timber_id, qty, reason }),
    });
  },

  async getWastage() {
    return request("/wastage");
  },

  // ==========================================
  // FR7 & FR8: User Management
  // ==========================================
  async getUsers() {
    return request("/users");
  },

  async createUser({ name, email, password, role, phone, address }) {
    return request("/users", {
      method: "POST",
      body: JSON.stringify({ name, email, password, role, phone, address }),
    });
  },

  async deleteUser(userId) {
    return request(`/users/${userId}`, { method: "DELETE" });
  },

  // ==========================================
  // FR9: Minimum Stock Notifications
  // ==========================================
  async getNotifications() {
    return request("/notifications");
  },

  async markNotificationRead(notificationId) {
    return request(`/notifications/${notificationId}/read`, {
      method: "PATCH",
    });
  },
};
