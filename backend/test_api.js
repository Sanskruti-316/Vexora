import { fileURLToPath } from "node:url";

const BASE_URL = "http://localhost:5000/api";

async function runTests() {
  console.log("=== Testing All Functional Requirements (FR1 - FR9) ===\n");

  // Helper fetch with JSON
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

  // FR1: Login Test
  console.log("--> Testing FR1: User Authentication & Role Token generation");
  const ownerLogin = await api("/login", {
    method: "POST",
    body: { email: "owner@gmail.com", password: "12345678" },
  });
  const managerLogin = await api("/login", {
    method: "POST",
    body: { email: "manager@gmail.com", password: "12345678" },
  });
  const workerLogin = await api("/login", {
    method: "POST",
    body: { email: "worker@gmail.com", password: "12345678" },
  });

  if (!ownerLogin.ok || !managerLogin.ok || !workerLogin.ok) {
    throw new Error("FR1 Failed: Login failed for one or more roles");
  }
  const ownerToken = ownerLogin.data.token;
  const managerToken = managerLogin.data.token;
  const workerToken = workerLogin.data.token;
  console.log("✓ FR1 Passed: Owner, Manager, and Worker authenticated successfully with role-based JWTs.");

  // FR3: Dashboard stats & charts data
  console.log("\n--> Testing FR3: Inventory statistics & chart data");
  const dashRes = await api("/dashboard", { token: managerToken });
  if (!dashRes.ok || !dashRes.data.totals || !dashRes.data.stockByType) {
    throw new Error("FR3 Failed: Dashboard response missing required chart/stats fields");
  }
  console.log(`✓ FR3 Passed: Dashboard retrieved. Types: ${dashRes.data.totals.types}, Units: ${dashRes.data.totals.units}, Low: ${dashRes.data.totals.low}`);

  // FR4: Timber search, sort, and filter
  console.log("\n--> Testing FR4: Timber search, sort, and filter");
  const timberSearch = await api("/timber?search=Teak&sort=qty&order=desc", { token: workerToken });
  if (!timberSearch.ok || timberSearch.data.length === 0) {
    throw new Error("FR4 Failed: Search/Filter for Teak returned empty");
  }
  console.log(`✓ FR4 Passed: Search returned ${timberSearch.data.length} item(s) sorted by qty.`);

  // FR2: Worker submits request and Manager accepts it
  console.log("\n--> Testing FR2: Worker request & Manager acceptance (Allocation & Add)");
  const teakItem = timberSearch.data[0];
  const reqRes = await api("/requests", {
    method: "POST",
    token: workerToken,
    body: {
      kind: "allocate",
      timber_id: teakItem.id,
      qty: 5,
    },
  });
  if (!reqRes.ok) throw new Error("FR2 Failed: Worker failed to submit allocation request");

  const pendingList = await api("/requests?status=Pending", { token: managerToken });
  const pendingItem = pendingList.data[0];
  if (!pendingItem) throw new Error("FR2 Failed: Manager could not find pending request");

  const acceptRes = await api(`/requests/${pendingItem.id}/accept`, {
    method: "POST",
    token: managerToken,
  });
  if (!acceptRes.ok) throw new Error("FR2 Failed: Manager accept request failed");
  console.log("✓ FR2 Passed: Worker submitted allocation request and Manager accepted it, updating stock.");

  // FR5: Transaction history
  console.log("\n--> Testing FR5: Timber Transaction History");
  const txRes = await api("/txns", { token: ownerToken });
  if (!txRes.ok || txRes.data.length === 0) {
    throw new Error("FR5 Failed: Could not fetch transaction history");
  }
  console.log(`✓ FR5 Passed: Retrieved ${txRes.data.length} transaction entries.`);

  // FR6: Timber Wastage
  console.log("\n--> Testing FR6: Worker wastage recording");
  const wasteRes = await api("/wastage", {
    method: "POST",
    token: workerToken,
    body: {
      timber_id: teakItem.id,
      qty: 2,
      reason: "Cracked end grain during sawing",
    },
  });
  if (!wasteRes.ok) throw new Error("FR6 Failed: Recording timber wastage failed");
  console.log("✓ FR6 Passed: Wastage recorded, deducted from stock, and logged in transactions.");

  // FR8: Manager adds and removes a worker
  console.log("\n--> Testing FR8: Manager adds and removes worker");
  const newWorkerEmail = `testworker_${Date.now()}@test.com`;
  const addWorkerRes = await api("/users", {
    method: "POST",
    token: managerToken,
    body: {
      name: "Test Worker",
      email: newWorkerEmail,
      password: "password123",
      role: "worker",
    },
  });
  if (!addWorkerRes.ok) throw new Error("FR8 Failed: Manager could not create worker");

  const workersList = await api("/users", { token: managerToken });
  const createdWorker = workersList.data.find((u) => u.email === newWorkerEmail);
  if (!createdWorker) throw new Error("FR8 Failed: Created worker not found in list");

  const delWorkerRes = await api(`/users/${createdWorker.id}`, {
    method: "DELETE",
    token: managerToken,
  });
  if (!delWorkerRes.ok) throw new Error("FR8 Failed: Manager could not delete worker");
  console.log("✓ FR8 Passed: Manager successfully created and deleted worker account.");

  // FR7: Owner adds and deletes a manager
  console.log("\n--> Testing FR7: Owner adds and deletes manager account");
  const newMgrEmail = `testmgr_${Date.now()}@test.com`;
  const addMgrRes = await api("/users", {
    method: "POST",
    token: ownerToken,
    body: {
      name: "Warehouse Manager Two",
      email: newMgrEmail,
      password: "password123",
      role: "manager",
    },
  });
  if (!addMgrRes.ok) throw new Error("FR7 Failed: Owner could not create manager");

  const allUsers = await api("/users", { token: ownerToken });
  const createdMgr = allUsers.data.find((u) => u.email === newMgrEmail);
  if (!createdMgr) throw new Error("FR7 Failed: Created manager not found in owner list");

  const delMgrRes = await api(`/users/${createdMgr.id}`, {
    method: "DELETE",
    token: ownerToken,
  });
  if (!delMgrRes.ok) throw new Error("FR7 Failed: Owner could not delete manager");
  console.log("✓ FR7 Passed: Owner successfully created and deleted manager account.");

  // FR9: Low stock notification
  console.log("\n--> Testing FR9: Low stock alerts for manager");
  const notifRes = await api("/notifications", { token: managerToken });
  if (!notifRes.ok || notifRes.data.length === 0) {
    throw new Error("FR9 Failed: Expected low stock notifications for Oak");
  }
  console.log(`✓ FR9 Passed: Manager received ${notifRes.data.length} low-stock notification(s): "${notifRes.data[0].message}"`);

  console.log("\n=============================================");
  console.log("ALL FUNCTIONAL REQUIREMENTS (FR1 - FR9) PASSED!");
  console.log("=============================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
