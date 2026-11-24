/**
 * TIMBER MANAGEMENT SYSTEM ALGORITHMS (Frontend Client Utilities)
 * Merge Sort (O(n log n)), Linear Filtering (O(n)), and Binary Search (O(log n))
 */

function compareValues(a, b) {
  if (a === undefined || a === null) a = "";
  if (b === undefined || b === null) b = "";

  if (typeof a === "string" && typeof b === "string") {
    const isDateA = !isNaN(Date.parse(a)) && (a.includes("-") || a.includes("/"));
    const isDateB = !isNaN(Date.parse(b)) && (b.includes("-") || b.includes("/"));
    if (isDateA && isDateB) {
      const timeA = new Date(a).getTime();
      const timeB = new Date(b).getTime();
      return timeA < timeB ? -1 : timeA > timeB ? 1 : 0;
    }
  }

  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB) && typeof a !== "boolean" && typeof b !== "boolean") {
    return numA < numB ? -1 : numA > numB ? 1 : 0;
  }

  return String(a).toLowerCase().trim().localeCompare(String(b).toLowerCase().trim());
}

// 2. MERGE SORT (O(n log n))
export function mergeSort(records, field, order = "ASC") {
  if (!Array.isArray(records) || records.length <= 1) {
    return records ? [...records] : [];
  }

  const mid = Math.floor(records.length / 2);
  const left = mergeSort(records.slice(0, mid), field, order);
  const right = mergeSort(records.slice(mid), field, order);

  return merge(left, right, field, order);
}

function merge(left, right, field, order) {
  const result = [];
  const isAsc = String(order).toUpperCase() !== "DESC";
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    const cmp = compareValues(left[i][field], right[j][field]);
    if (isAsc ? cmp <= 0 : cmp >= 0) {
      result.push(left[i]);
      i++;
    } else {
      result.push(right[j]);
      j++;
    }
  }

  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}

// 3. LINEAR FILTERING (O(n))
export function filterInStock(records, threshold = 10) {
  return records.filter((r) => Number(r.quantity ?? r.qty ?? 0) >= Number(r.min ?? threshold));
}

export function filterOutOfStock(records) {
  return records.filter((r) => Number(r.quantity ?? r.qty ?? 0) === 0);
}

export function filterLowStock(records, threshold = 10) {
  return records.filter((r) => {
    const q = Number(r.quantity ?? r.qty ?? 0);
    const limit = Number(r.min ?? threshold);
    return q > 0 && q <= limit;
  });
}

export function filterAvailable(records) {
  return records.filter((r) => Number(r.available_quantity ?? r.quantity ?? r.qty ?? 0) > 0);
}

export function filterUnavailable(records) {
  return records.filter((r) => Number(r.available_quantity ?? r.quantity ?? r.qty ?? 0) === 0);
}

export function filterPending(records) {
  return records.filter((r) => String(r.status ?? "").toUpperCase() === "PENDING");
}

export function filterApproved(records) {
  return records.filter((r) => ["APPROVED", "ACCEPTED"].includes(String(r.status ?? "").toUpperCase()));
}

export function filterDeclined(records) {
  return records.filter((r) => ["DECLINED", "REJECTED"].includes(String(r.status ?? "").toUpperCase()));
}

// 4. BINARY SEARCH (O(log n) with O(n log n) Merge Sort preparation)
export function binarySearch(records, field, searchValue) {
  if (!Array.isArray(records) || records.length === 0) return [];
  if (!searchValue || String(searchValue).trim() === "") return records;

  const sorted = mergeSort(records, field, "ASC");
  const target = String(searchValue).toLowerCase().trim();

  let low = 0;
  let high = sorted.length - 1;
  let matchIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midVal = String(sorted[mid][field] ?? "").toLowerCase().trim();

    if (midVal === target || midVal.includes(target)) {
      matchIndex = mid;
      break;
    } else if (midVal < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (matchIndex === -1) return [];

  const matches = [];
  let left = matchIndex;
  while (left >= 0) {
    const val = String(sorted[left][field] ?? "").toLowerCase().trim();
    if (val === target || val.includes(target)) matches.unshift(sorted[left--]);
    else break;
  }
  let right = matchIndex + 1;
  while (right < sorted.length) {
    const val = String(sorted[right][field] ?? "").toLowerCase().trim();
    if (val === target || val.includes(target)) matches.push(sorted[right++]);
    else break;
  }
  return matches;
}

// 1. MAIN ALGORITHM PIPELINE
export function processTimberQuery(records, options = {}) {
  let result = Array.isArray(records) ? [...records] : [];

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

  if (options.filter) {
    switch (options.filter.toLowerCase()) {
      case "in":
      case "in_stock":
        result = filterInStock(result, options.threshold);
        break;
      case "out":
      case "out_of_stock":
        result = filterOutOfStock(result);
        break;
      case "low":
      case "low_stock":
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
    }
  }

  if (options.sortField) {
    result = mergeSort(result, options.sortField, options.sortOrder || "ASC");
  }

  return {
    count: result.length,
    records: result,
    message: result.length === 0 ? "No Records Found" : "Success",
  };
}
