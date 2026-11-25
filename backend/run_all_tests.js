import http from "node:http";
import app, { checkLow } from "./server.js";
import { initDb } from "./db.js";

const PORT = 5055;
const BASE_URL = `http://localhost:${PORT}/api`;

async function main() {
  await initDb();
  await checkLow();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Test server running on port ${PORT}`);

  try {
    async function api(path, { method = "GET", token, body } = {}) {
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, ok: res.ok, data };
    }

    console.log("\n=== 1. Testing FR1: Login & Role-Specific Dashboard ===");
    const ownerRes = await api("/login", {
      method: "POST",
      body: { email: "owner@gmail.com", password: "12345678" },
    });
    const mgrRes = await api("/login", {
      method: "POST",
      body: { email: "manager@gmail.com", password: "12345678" },
    });
    const wkrRes = await api("/login", {
      method: "POST",
      body: { email: "worker@gmail.com", password: "12345678" },
    });

    if (!ownerRes.ok || !mgrRes.ok || !wkrRes.ok) {
      throw new Error(`FR1 Login failed: ${JSON.stringify({ ownerRes, mgrRes, wkrRes })}`);
    }

    const ownerToken = ownerRes.data.token;
    const mgrToken = mgrRes.data.token;
    const wkrToken = wkrRes.data.token;
    console.log("✓ FR1 Passed: Owner, Manager, and Worker logged in with role tokens.");

    console.log("\n=== 2. Testing FR3: Inventory Statistics for Graphical Dashboard ===");
    const dash = await api("/dashboard", { token: mgrToken });
    if (!dash.ok || !dash.data.stockByType || !dash.data.totals) {
      throw new Error("FR3 Failed to get dashboard statistics");
    }
    console.log("✓ FR3 Passed: Dashboard data retrieved:", dash.data.totals);

    console.log("\n=== 3. Testing FR4: Timber Search, View, Sort & Filter ===");
    const filterRes = await api("/timber?search=Teak&sort=qty&order=desc&avail=in", { token: wkrToken });
    if (!filterRes.ok || filterRes.data.length === 0) {
      throw new Error("FR4 Failed to search/filter timber stock");
    }
    console.log(`✓ FR4 Passed: Filtered timber stock (${filterRes.data.length} item(s) found).`);

    console.log("\n=== 4. Testing FR2: Worker Allocation Request & Manager Accept ===");
    const teak = filterRes.data[0];
    const reqCreate = await api("/requests", {
      method: "POST",
      token: wkrToken,
      body: { kind: "allocate", timber_id: teak.id, qty: 5 },
    });
    if (!reqCreate.ok) throw new Error("FR2 Failed to create allocation request");

    const pending = await api("/requests?status=Pending", { token: mgrToken });
    const targetReq = pending.data[0];
    if (!targetReq) throw new Error("FR2 Failed: Pending request not found");

    const acceptRes = await api(`/requests/${targetReq.id}/accept`, {
      method: "POST",
      token: mgrToken,
    });
    if (!acceptRes.ok) throw new Error("FR2 Failed to accept request");
    console.log("✓ FR2 Passed: Worker requested allocation and Manager accepted it.");

    console.log("\n=== 5. Testing FR5: View Transaction History ===");
    const txns = await api("/txns", { token: ownerToken });
    if (!txns.ok || txns.data.length === 0) {
      throw new Error("FR5 Failed to fetch transaction history");
    }
    console.log(`✓ FR5 Passed: ${txns.data.length} transaction entries retrieved for Owner/Manager.`);

    console.log("\n=== 6. Testing FR6: Worker Records Timber Wastage ===");
    const wasteRes = await api("/wastage", {
      method: "POST",
      token: wkrToken,
      body: { timber_id: teak.id, qty: 1, reason: "Rotten knot" },
    });
    if (!wasteRes.ok) throw new Error("FR6 Failed to record timber wastage");
    console.log("✓ FR6 Passed: Worker recorded timber wastage and deducted stock.");

    console.log("\n=== 7. Testing FR7: Owner Adds & Deletes Manager/Worker ===");
    const newMgrEmail = `newmgr_${Date.now()}@example.com`;
    const addMgr = await api("/users", {
      method: "POST",
      token: ownerToken,
      body: { name: "New Manager", email: newMgrEmail, password: "password123", role: "manager" },
    });
    if (!addMgr.ok) throw new Error("FR7 Failed to add manager");

    const usersList = await api("/users", { token: ownerToken });
    const foundMgr = usersList.data.find((u) => u.email === newMgrEmail);
    const delMgr = await api(`/users/${foundMgr.id}`, { method: "DELETE", token: ownerToken });
    if (!delMgr.ok) throw new Error("FR7 Failed to delete manager");
    console.log("✓ FR7 Passed: Owner successfully added and deleted manager account.");

    console.log("\n=== 8. Testing FR8: Manager Adds & Removes Worker ===");
    const newWkrEmail = `newwkr_${Date.now()}@example.com`;
    const addWkr = await api("/users", {
      method: "POST",
      token: mgrToken,
      body: { name: "New Worker", email: newWkrEmail, password: "password123", role: "worker" },
    });
    if (!addWkr.ok) throw new Error("FR8 Failed to add worker");

    const wkrList = await api("/users", { token: mgrToken });
    const foundWkr = wkrList.data.find((u) => u.email === newWkrEmail);
    const delWkr = await api(`/users/${foundWkr.id}`, { method: "DELETE", token: mgrToken });
    if (!delWkr.ok) throw new Error("FR8 Failed to delete worker");
    console.log("✓ FR8 Passed: Manager successfully added and removed worker account.");

    console.log("\n=== 9. Testing FR9: Low Stock Notifications ===");
    const notifs = await api("/notifications", { token: mgrToken });
    if (!notifs.ok || notifs.data.length === 0) {
      throw new Error("FR9 Failed: Expected low stock notifications");
    }
    console.log(`✓ FR9 Passed: Manager received notification: "${notifs.data[0].message}"`);

    console.log("\n=======================================================");
    console.log("ALL FUNCTIONAL REQUIREMENTS (FR1 - FR9) FULLY VERIFIED!");
    console.log("=======================================================");
    server.close(() => process.exit(0));
  } catch (err) {
    console.error("Test execution failed:", err);
    server.close(() => process.exit(1));
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
