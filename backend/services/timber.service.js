import { timberRepo } from "../db/timber.repo.js";
import { posInt } from "../middleware/validate.js";
import {
  processTimberQuery,
  mergeSort,
  binarySearch,
  filterInStock,
  filterOutOfStock,
  filterLowStock,
  filterAvailable,
  filterUnavailable,
} from "../algorithms.js";

export const timberService = {
  async getTimberInventory(q = {}) {
    let records = await timberRepo.fetchAllRecords();

    // Searching: Binary Search algorithm
    if (q.search && q.search.trim() !== "") {
      const field = q.searchField || (records[0]?.type ? "type" : "size");
      records = binarySearch(records, field, q.search);
    }

    // Filtering: Linear Filtering algorithm
    if (q.avail) {
      if (q.avail === "in" || q.avail === "in_stock") {
        records = filterInStock(records);
      } else if (q.avail === "out" || q.avail === "out_of_stock") {
        records = filterOutOfStock(records);
      } else if (q.avail === "low" || q.avail === "low_stock") {
        records = filterLowStock(records);
      } else if (q.avail === "available") {
        records = filterAvailable(records);
      } else if (q.avail === "unavailable") {
        records = filterUnavailable(records);
      }
    }

    // Sorting: Merge Sort algorithm
    const sortField = q.sort || "type";
    const sortOrder = String(q.order || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
    records = mergeSort(records, sortField, sortOrder);

    return records;
  },

  async runAlgorithmBenchmark(body = {}) {
    const { operation, field = "type", order = "ASC", threshold = 10, searchValue } = body;
    const records = await timberRepo.fetchAllRecords();
    let result = [];
    let algoName = "";
    let complexity = "";

    switch (String(operation).toLowerCase()) {
      case "sort":
      case "merge_sort":
        algoName = "Merge Sort";
        complexity = "O(n log n)";
        result = mergeSort(records, field, order);
        break;

      case "filter_in_stock":
        algoName = "Linear Filtering (In Stock)";
        complexity = "O(n)";
        result = filterInStock(records, threshold);
        break;

      case "filter_out_of_stock":
        algoName = "Linear Filtering (Out of Stock)";
        complexity = "O(n)";
        result = filterOutOfStock(records);
        break;

      case "filter_low_stock":
        algoName = "Linear Filtering (Low Stock)";
        complexity = "O(n)";
        result = filterLowStock(records, threshold);
        break;

      case "filter_available":
        algoName = "Linear Filtering (Available Timber)";
        complexity = "O(n)";
        result = filterAvailable(records);
        break;

      case "filter_unavailable":
        algoName = "Linear Filtering (Unavailable Timber)";
        complexity = "O(n)";
        result = filterUnavailable(records);
        break;

      case "search":
      case "binary_search":
        algoName = "Binary Search";
        complexity = "O(log n) [with O(n log n) Merge Sort preparation]";
        result = binarySearch(records, field, searchValue);
        break;

      default:
        return processTimberQuery(records, body);
    }

    return {
      algorithm: algoName,
      timeComplexity: complexity,
      count: result.length,
      records: result,
      message: result.length === 0 ? "No Records Found" : "Success",
    };
  },

  async updateMinStock(timberId, minInput) {
    const newMin = posInt(minInput, "Minimum stock must be a positive integer");
    await timberRepo.updateMinStock(timberId, newMin);
    return newMin;
  },

  async getDashboardStats() {
    return await timberRepo.getDashboardData();
  },
};
