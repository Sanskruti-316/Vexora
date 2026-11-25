/**
 * TIMBER MANAGEMENT SYSTEM ALGORITHMS
 * Complete implementation of Sorting (Merge Sort), Filtering (Linear),
 * and Searching (Binary Search) algorithms as specified.
 */

// ============================================================================
// 1. HELPER COMPARATOR
// ============================================================================
function compareValues(a, b) {
  if (a === undefined || a === null) a = "";
  if (b === undefined || b === null) b = "";

  // If comparing dates (ISO string or Date object)
  if (typeof a === "string" && typeof b === "string") {
    const isDateA = !isNaN(Date.parse(a)) && (a.includes("-") || a.includes("/"));
    const isDateB = !isNaN(Date.parse(b)) && (b.includes("-") || b.includes("/"));
    if (isDateA && isDateB) {
      const timeA = new Date(a).getTime();
      const timeB = new Date(b).getTime();
      return timeA < timeB ? -1 : timeA > timeB ? 1 : 0;
    }
  }

  // If comparing numbers
  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB) && typeof a !== "boolean" && typeof b !== "boolean") {
    return numA < numB ? -1 : numA > numB ? 1 : 0;
  }

  // Case-insensitive string comparison
  const strA = String(a).toLowerCase().trim();
  const strB = String(b).toLowerCase().trim();
  return strA.localeCompare(strB);
}

// ============================================================================
// 2. SORTING ALGORITHMS (MERGE SORT - O(n log n))
// ============================================================================

/**
 * 2.1 General Merge Sort Algorithm
 * Divides the records recursively into two halves and merges them in sorted order.
 *
 * @param {Array<Object>} records - Array of records to sort
 * @param {string} field - Field name to sort by
 * @param {string} order - 'ASC' (increasing) or 'DESC' (decreasing)
 * @returns {Array<Object>} - Sorted array
 */
export function mergeSort(records, field, order = "ASC") {
  if (!Array.isArray(records) || records.length <= 1) {
    return records ? [...records] : [];
  }

  const mid = Math.floor(records.length / 2);
  const left = mergeSort(records.slice(0, mid), field, order);
  const right = mergeSort(records.slice(mid), field, order);

  return merge(left, right, field, order);
}

/**
 * Merges two sorted arrays based on the field and sorting order.
 */
function merge(left, right, field, order) {
  const result = [];
  const isAsc = String(order).toUpperCase() !== "DESC";
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    const cmp = compareValues(left[i][field], right[j][field]);

    if (isAsc) {
      if (cmp <= 0) {
        result.push(left[i]);
        i++;
      } else {
        result.push(right[j]);
        j++;
      }
    } else {
      if (cmp >= 0) {
        result.push(left[i]);
        i++;
      } else {
        result.push(right[j]);
        j++;
      }
    }
  }

  while (i < left.length) {
    result.push(left[i]);
    i++;
  }
  while (j < right.length) {
    result.push(right[j]);
    j++;
  }

  return result;
}

// 2.2 Sorting by Manager Name (A-Z or Z-A)
export function sortByManagerName(records, order = "ASC") {
  return mergeSort(records, "manager_name", order);
}

// 2.3 Sorting by Date (Oldest to Newest or Newest to Oldest)
export function sortByDate(records, order = "ASC") {
  return mergeSort(records, "date", order);
}

// 2.4 Sorting by Price (Lowest to Highest or Highest to Lowest)
export function sortByPrice(records, order = "ASC") {
  return mergeSort(records, "price", order);
}

// 2.5 Sorting by Quantity (Lowest to Highest or Highest to Lowest)
export function sortByQuantity(records, order = "ASC") {
  return mergeSort(records, "quantity", order);
}

// 2.6 Sorting by Timber Type (A-Z or Z-A)
export function sortByTimberType(records, order = "ASC") {
  return mergeSort(records, "type", order);
}

// ============================================================================
// 3. FILTERING ALGORITHMS (LINEAR FILTERING - O(n))
// ============================================================================

/**
 * 3.1 Filter In Stock: quantity > low_stock_threshold
 */
export function filterInStock(records, threshold = 10) {
  const result = [];
  for (const record of records) {
    const qty = Number(record.quantity ?? record.qty ?? 0);
    const limit = Number(record.min_stock_level ?? record.min ?? threshold);
    if (qty >= limit) {
      result.push(record);
    }
  }
  return result;
}

/**
 * 3.2 Filter Out of Stock: quantity === 0
 */
export function filterOutOfStock(records) {
  const result = [];
  for (const record of records) {
    const qty = Number(record.quantity ?? record.qty ?? 0);
    if (qty === 0) {
      result.push(record);
    }
  }
  return result;
}

/**
 * 3.3 Filter Low Stock: quantity > 0 && quantity <= threshold
 */
export function filterLowStock(records, threshold = 10) {
  const result = [];
  for (const record of records) {
    const qty = Number(record.quantity ?? record.qty ?? 0);
    const limit = Number(record.min_stock_level ?? record.min ?? threshold);
    if (qty > 0 && qty <= limit) {
      result.push(record);
    }
  }
  return result;
}

/**
 * 3.4 Filter Available Timber: available_quantity > 0
 */
export function filterAvailable(records) {
  const result = [];
  for (const record of records) {
    const avail = Number(record.available_quantity ?? record.quantity ?? record.qty ?? 0);
    if (avail > 0) {
      result.push(record);
    }
  }
  return result;
}

/**
 * 3.5 Filter Unavailable Timber: available_quantity === 0
 */
export function filterUnavailable(records) {
  const result = [];
  for (const record of records) {
    const avail = Number(record.available_quantity ?? record.quantity ?? record.qty ?? 0);
    if (avail === 0) {
      result.push(record);
    }
  }
  return result;
}

/**
 * 3.6 Filter Pending Requests: request_status = "PENDING"
 */
export function filterPending(records) {
  const result = [];
  for (const record of records) {
    const status = String(record.request_status ?? record.status ?? "").toUpperCase();
    if (status === "PENDING") {
      result.push(record);
    }
  }
  return result;
}

/**
 * 3.7 Filter Approved Requests: request_status = "APPROVED"
 */
export function filterApproved(records) {
  const result = [];
  for (const record of records) {
    const status = String(record.request_status ?? record.status ?? "").toUpperCase();
    if (status === "APPROVED" || status === "ACCEPTED") {
      result.push(record);
    }
  }
  return result;
}

/**
 * 3.8 Filter Declined Requests: request_status = "DECLINED"
 */
export function filterDeclined(records) {
  const result = [];
  for (const record of records) {
    const status = String(record.request_status ?? record.status ?? "").toUpperCase();
    if (status === "DECLINED" || status === "REJECTED") {
      result.push(record);
    }
  }
  return result;
}

// ============================================================================
// 4. SEARCHING ALGORITHMS (BINARY SEARCH - O(log n))
// ============================================================================

/**
 * 4.1 General Binary Search Algorithm
 * First sorts records using Merge Sort in ascending order, then applies
 * binary search to find all matching occurrences.
 *
 * @param {Array<Object>} records - Array of records
 * @param {string} field - Field to search in
 * @param {string|number} searchValue - Target value to match
 * @returns {Array<Object>} - All matching records, or empty array if none found
 */
export function binarySearch(records, field, searchValue) {
  if (!Array.isArray(records) || records.length === 0) return [];
  if (searchValue === undefined || searchValue === null || String(searchValue).trim() === "") {
    return records;
  }

  // Step 4: Sort records using Merge Sort in ascending order of selected field
  const sorted = mergeSort(records, field, "ASC");
  const target = String(searchValue).toLowerCase().trim();

  let low = 0;
  let high = sorted.length - 1;
  let matchIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midVal = String(sorted[mid][field] ?? "").toLowerCase().trim();

    // Check exact match or prefix match
    if (midVal === target || midVal.includes(target)) {
      matchIndex = mid;
      break;
    } else if (midVal < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (matchIndex === -1) {
    return []; // Record Not Found
  }

  // Step 9: Return ALL matching records (scan outward from mid)
  const matches = [];
  // Scan backwards
  let left = matchIndex;
  while (left >= 0) {
    const val = String(sorted[left][field] ?? "").toLowerCase().trim();
    if (val === target || val.includes(target)) {
      matches.unshift(sorted[left]);
      left--;
    } else {
      break;
    }
  }
  // Scan forwards
  let right = matchIndex + 1;
  while (right < sorted.length) {
    const val = String(sorted[right][field] ?? "").toLowerCase().trim();
    if (val === target || val.includes(target)) {
      matches.push(sorted[right]);
      right++;
    } else {
      break;
    }
  }

  return matches;
}

// 4.2 Search by Manager Name
export function searchManagerName(records, name) {
  return binarySearch(records, "manager_name", name);
}

// 4.3 Search by Worker Name
export function searchWorkerName(records, name) {
  return binarySearch(records, "worker_name", name);
}

// 4.4 Search by Warehouse Name
export function searchWarehouseName(records, name) {
  return binarySearch(records, "warehouse", name);
}

// 4.5 Search by Address
export function searchAddress(records, address) {
  return binarySearch(records, "address", address);
}

// 4.6 Search by Timber Name / Type
export function searchTimberName(records, name) {
  return binarySearch(records, "type", name);
}

// 4.7 Search by Size
export function searchSize(records, size) {
  return binarySearch(records, "size", size);
}

// ============================================================================
// 1. MAIN ALGORITHM: TIMBER MANAGEMENT SYSTEM PIPELINE
// ============================================================================
/**
 * Executes the complete Main Algorithm:
 * 1. Start.
 * 2. Receive user request.
 * 3. Retrieve timber records.
 * 4. Check the operation selected by the user.
 * 5. If Sorting selected, execute Merge Sort.
 * 6. If Filtering selected, execute Linear Filtering.
 * 7. If Searching selected, execute Binary Search.
 * 8. Process selected operation.
 * 9. Display result.
 * 10. If no matching records found, return empty array with "No Records Found".
 */
export function processTimberQuery(records, options = {}) {
  let result = Array.isArray(records) ? [...records] : [];

  // Operation 1: Searching (Binary Search)
  if (options.search && options.search.trim() !== "") {
    if (options.searchField && options.searchField !== "all") {
      result = binarySearch(result, options.searchField, options.search);
    } else {
      const typeMatches = binarySearch(result, "type", options.search);
      const sizeMatches = binarySearch(result, "size", options.search);
      const seen = new Set();
      const combined = [];
      for (const item of [...typeMatches, ...sizeMatches]) {
        const id = item.id || item.timber_id;
        if (!seen.has(id)) {
          seen.add(id);
          combined.push(item);
        }
      }
      result = combined;
    }
  }

  // Operation 2: Filtering (Linear Filtering)
  if (options.filter) {
    switch (options.filter.toLowerCase()) {
      case "in_stock":
      case "in":
        result = filterInStock(result, options.threshold);
        break;
      case "out_of_stock":
      case "out":
        result = filterOutOfStock(result);
        break;
      case "low_stock":
      case "low":
        result = filterLowStock(result, options.threshold);
        break;
      case "available":
        result = filterAvailable(result);
        break;
      case "unavailable":
        result = filterUnavailable(result);
        break;
      case "pending":
        result = filterPending(result);
        break;
      case "approved":
        result = filterApproved(result);
        break;
      case "declined":
        result = filterDeclined(result);
        break;
      default:
        break;
    }
  }

  // Operation 3: Sorting (Merge Sort)
  if (options.sortField) {
    result = mergeSort(result, options.sortField, options.sortOrder || "ASC");
  }

  return {
    count: result.length,
    records: result,
    message: result.length === 0 ? "No Records Found" : "Success",
  };
}

// ============================================================================
// 4. CONCURRENCY CONTROL: MUTEX LOCK (Mutual Exclusion)
// ============================================================================

/**
 * 4.1 Stock Mutex Lock Class
 *
 * Implements a Mutual Exclusion (Mutex) Lock per stock record ID.
 * Allows only one worker's request to update or allocate a particular
 * stock record at a time. Other requests must wait in a FIFO queue.
 *
 * Example:
 * If there are 20 units of timber in stock:
 * - Worker 1 requests 17 units (Acquires lock, 17 reserved, Lock released)
 * - Worker 2 requests 3 units  (Acquires lock, 3 reserved, Lock released)
 * - Worker 3 requests 20 units (Acquires lock, rejected because 17+3=20 already reserved, Lock released)
 * -> Only 20 units can be given / allocated (i.e. 17 and 3, or 20 only).
 */
export class StockMutexLock {
  constructor() {
    this.locks = new Map();
    this.queueLengths = new Map();
  }

  /**
   * Acquire exclusive lock for a specific timber ID.
   * If the lock is held, the caller waits asynchronously until it is released.
   *
   * @param {string|number} timberId - ID of timber record to lock
   * @returns {Promise<() => void>} - Release callback function
   */
  async acquire(timberId) {
    const key = String(timberId);
    this.queueLengths.set(key, (this.queueLengths.get(key) || 0) + 1);

    let release;
    const nextLock = new Promise((resolve) => {
      release = resolve;
    });

    const currentLock = this.locks.get(key) || Promise.resolve();
    this.locks.set(key, currentLock.then(() => nextLock));

    await currentLock;

    let isReleased = false;
    return () => {
      if (!isReleased) {
        isReleased = true;
        const remaining = (this.queueLengths.get(key) || 1) - 1;
        if (remaining <= 0) {
          this.queueLengths.delete(key);
          this.locks.delete(key);
        } else {
          this.queueLengths.set(key, remaining);
        }
        release();
      }
    };
  }

  /**
   * Execute critical section with automatic lock acquire and release.
   *
   * @param {string|number} timberId
   * @param {() => Promise<any>} fn - Async function to run within the lock
   * @returns {Promise<any>}
   */
  async withLock(timberId, fn) {
    const unlock = await this.acquire(timberId);
    try {
      return await fn();
    } finally {
      unlock();
    }
  }

  /**
   * Check if a timber record is currently locked
   * @param {string|number} timberId
   * @returns {boolean}
   */
  isLocked(timberId) {
    return (this.queueLengths.get(String(timberId)) || 0) > 0;
  }

  /**
   * Get number of waiting/active requests for a timber record
   * @param {string|number} timberId
   * @returns {number}
   */
  getQueueLength(timberId) {
    return this.queueLengths.get(String(timberId)) || 0;
  }
}

export const stockMutex = new StockMutexLock();
