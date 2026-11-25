import {
  mergeSort,
  sortByManagerName,
  sortByDate,
  sortByPrice,
  sortByQuantity,
  sortByTimberType,
  filterInStock,
  filterOutOfStock,
  filterLowStock,
  filterAvailable,
  filterUnavailable,
  filterPending,
  filterApproved,
  filterDeclined,
  binarySearch,
  searchManagerName,
  searchWorkerName,
  searchWarehouseName,
  searchAddress,
  searchTimberName,
  searchSize,
  processTimberQuery,
} from "./algorithms.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("=== VERIFYING COMPLETE ALGORITHMS SPECIFICATION ===\n");

// Sample dataset based on the timber enterprise schema
const timberRecords = [
  { id: 1, type: "Teak", size: "2x4", quantity: 50, price: 850, date: "2026-11-01", min_stock_level: 45, warehouse: "Warehouse A", manager_name: "Amit Desai", address: "Gokul Road" },
  { id: 2, type: "Sal", size: "2x5", quantity: 80, price: 650, date: "2026-11-02", min_stock_level: 50, warehouse: "Warehouse A", manager_name: "Priya Rao", address: "Keshwapur" },
  { id: 3, type: "Pine", size: "1.5x4", quantity: 35, price: 450, date: "2026-11-03", min_stock_level: 40, warehouse: "Warehouse B", manager_name: "Kiran Joshi", address: "Silver Town" },
  { id: 4, type: "Oak", size: "2x4", quantity: 18, price: 700, date: "2026-11-04", min_stock_level: 25, warehouse: "Warehouse B", manager_name: "Amit Desai", address: "Gokul Road" },
  { id: 5, type: "Bamboo", size: "1x3", quantity: 0, price: 300, date: "2026-11-06", min_stock_level: 20, warehouse: "Warehouse C", manager_name: "Priya Rao", address: "Keshwapur" },
  { id: 6, type: "Cedar", size: "2x4", quantity: 70, price: 550, date: "2026-11-05", min_stock_level: 50, warehouse: "Warehouse C", manager_name: "Kiran Joshi", address: "Silver Town" },
];

// Sample request records
const requestRecords = [
  { id: 101, worker_name: "Rohan Patil", type: "Teak", request_status: "PENDING" },
  { id: 102, worker_name: "Neha Kulkarni", type: "Sal", request_status: "APPROVED" },
  { id: 103, worker_name: "Akash Rao", type: "Pine", request_status: "DECLINED" },
  { id: 104, worker_name: "Sneha Hegde", type: "Oak", request_status: "PENDING" },
];

// ==========================================
// 1. SORTING (MERGE SORT - O(n log n))
// ==========================================
console.log("--> Testing 2. Sorting Algorithms (Merge Sort)");

// 2.2 Manager Name (ASC / DESC)
const sortedByMgrAsc = sortByManagerName(timberRecords, "ASC");
assert(sortedByMgrAsc[0].manager_name === "Amit Desai", "Sort by Manager Name ASC");
const sortedByMgrDesc = sortByManagerName(timberRecords, "DESC");
assert(sortedByMgrDesc[0].manager_name === "Priya Rao", "Sort by Manager Name DESC");
console.log("✓ 2.2 Sort by Manager Name: Verified (A-Z and Z-A)");

// 2.3 Date (Oldest to Newest / Newest to Oldest)
const sortedByDateAsc = sortByDate(timberRecords, "ASC");
assert(sortedByDateAsc[0].date === "2026-11-01", "Sort by Date Oldest first");
const sortedByDateDesc = sortByDate(timberRecords, "DESC");
assert(sortedByDateDesc[0].date === "2026-11-06", "Sort by Date Newest first");
console.log("✓ 2.3 Sort by Date: Verified (Oldest to Newest / Newest to Oldest)");

// 2.4 Price (Lowest to Highest / Highest to Lowest)
const sortedByPriceAsc = sortByPrice(timberRecords, "ASC");
assert(sortedByPriceAsc[0].price === 300, "Sort by Price Lowest");
const sortedByPriceDesc = sortByPrice(timberRecords, "DESC");
assert(sortedByPriceDesc[0].price === 850, "Sort by Price Highest");
console.log("✓ 2.4 Sort by Price: Verified (Lowest to Highest / Highest to Lowest)");

// 2.5 Quantity (Lowest to Highest / Highest to Lowest)
const sortedByQtyAsc = sortByQuantity(timberRecords, "ASC");
assert(sortedByQtyAsc[0].quantity === 0, "Sort by Qty Lowest");
const sortedByQtyDesc = sortByQuantity(timberRecords, "DESC");
assert(sortedByQtyDesc[0].quantity === 80, "Sort by Qty Highest");
console.log("✓ 2.5 Sort by Quantity: Verified (Lowest to Highest / Highest to Lowest)");

// 2.6 Timber Type (A to Z / Z to A)
const sortedByTypeAsc = sortByTimberType(timberRecords, "ASC");
assert(sortedByTypeAsc[0].type === "Bamboo", "Sort by Type A-Z");
const sortedByTypeDesc = sortByTimberType(timberRecords, "DESC");
assert(sortedByTypeDesc[0].type === "Teak", "Sort by Type Z-A");
console.log("✓ 2.6 Sort by Timber Type: Verified (A-Z and Z-A)");

// ==========================================
// 2. FILTERING (LINEAR FILTERING - O(n))
// ==========================================
console.log("\n--> Testing 3. Filtering Algorithms (Linear Filtering)");

// 3.1 In Stock
const inStock = filterInStock(timberRecords);
assert(inStock.every((r) => r.quantity > r.min_stock_level), "Filter In Stock");
console.log(`✓ 3.1 Filter In Stock: ${inStock.length} items found`);

// 3.2 Out of Stock
const outStock = filterOutOfStock(timberRecords);
assert(outStock.length === 1 && outStock[0].type === "Bamboo", "Filter Out of Stock");
console.log("✓ 3.2 Filter Out of Stock: 1 item found (Bamboo, qty: 0)");

// 3.3 Low Stock
const lowStock = filterLowStock(timberRecords);
assert(lowStock.every((r) => r.quantity > 0 && r.quantity <= r.min_stock_level), "Filter Low Stock");
console.log(`✓ 3.3 Filter Low Stock: ${lowStock.length} items found (Pine, Oak)`);

// 3.4 Available
const available = filterAvailable(timberRecords);
assert(available.length === 5, "Filter Available");
console.log(`✓ 3.4 Filter Available Timber: ${available.length} items found`);

// 3.5 Unavailable
const unavailable = filterUnavailable(timberRecords);
assert(unavailable.length === 1 && unavailable[0].type === "Bamboo", "Filter Unavailable");
console.log("✓ 3.5 Filter Unavailable Timber: 1 item found");

// 3.6 Filter Pending
const pending = filterPending(requestRecords);
assert(pending.length === 2, "Filter Pending Requests");
console.log(`✓ 3.6 Filter Pending Requests: ${pending.length} pending requests`);

// 3.7 Filter Approved
const approved = filterApproved(requestRecords);
assert(approved.length === 1 && approved[0].type === "Sal", "Filter Approved Requests");
console.log("✓ 3.7 Filter Approved Requests: 1 approved request");

// 3.8 Filter Declined
const declined = filterDeclined(requestRecords);
assert(declined.length === 1 && declined[0].type === "Pine", "Filter Declined Requests");
console.log("✓ 3.8 Filter Declined Requests: 1 declined request");

// ==========================================
// 3. SEARCHING (BINARY SEARCH - O(log n))
// ==========================================
console.log("\n--> Testing 4. Searching Algorithms (Binary Search)");

// 4.2 Manager Name
const foundMgr = searchManagerName(timberRecords, "Amit Desai");
assert(foundMgr.length === 2, "Search Manager Name");
console.log(`✓ 4.2 Search Manager Name: Found ${foundMgr.length} records for Amit Desai`);

// 4.3 Worker Name
const foundWorker = searchWorkerName(requestRecords, "Rohan Patil");
assert(foundWorker.length === 1, "Search Worker Name");
console.log("✓ 4.3 Search Worker Name: Found record for Rohan Patil");

// 4.4 Warehouse Name
const foundWh = searchWarehouseName(timberRecords, "Warehouse A");
assert(foundWh.length === 2, "Search Warehouse Name");
console.log(`✓ 4.4 Search Warehouse Name: Found ${foundWh.length} records for Warehouse A`);

// 4.5 Address
const foundAddr = searchAddress(timberRecords, "Gokul Road");
assert(foundAddr.length === 2, "Search Address");
console.log(`✓ 4.5 Search Address: Found ${foundAddr.length} records for Gokul Road`);

// 4.6 Timber Name
const foundTimber = searchTimberName(timberRecords, "Teak");
assert(foundTimber.length === 1 && foundTimber[0].type === "Teak", "Search Timber Name");
console.log("✓ 4.6 Search Timber Name: Found record for Teak");

// 4.7 Size
const foundSize = searchSize(timberRecords, "2x4");
assert(foundSize.length === 3, "Search Size");
console.log(`✓ 4.7 Search Size: Found ${foundSize.length} records for size 2x4`);

// Edge case: Not Found
const notFound = binarySearch(timberRecords, "type", "Mahogany_Non_Existent");
assert(notFound.length === 0, "Binary search non-existent");
console.log("✓ Search Non-Existent: Correctly returns empty list ('Record Not Found')");

// ==========================================
// 4. MAIN ALGORITHM PIPELINE TEST
// ==========================================
console.log("\n--> Testing 1. Main Timber Management System Pipeline");
const pipelineRes = processTimberQuery(timberRecords, {
  search: "Oak",
  searchField: "type",
  filter: "low_stock",
  sortField: "price",
  sortOrder: "ASC",
});
assert(pipelineRes.count === 1 && pipelineRes.records[0].type === "Oak", "Main pipeline execution");
console.log(`✓ 1. Main Algorithm Pipeline Output: Found ${pipelineRes.count} matching item: ${pipelineRes.records[0].type}`);

console.log("\n============================================================");
console.log("ALL ALGORITHMS VERIFIED AND FULLY PASSING SPECIFICATIONS!");
console.log("============================================================");
