/**
 * Appwrite Client Configuration and Utility Functions
 * This file initializes the Appwrite SDK and provides helper methods for data fetching.
 */

import {
  Client,
  Account,
  Databases,
  TablesDB,
  Storage,
  ID,
  OAuthProvider,
  Realtime,
  Teams,
  Query,
} from "appwrite";

// Initialize the Appwrite client
const client = new Client();

client
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "")
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "");

// Export Appwrite service instances
export const account = new Account(client);
export const databases = new Databases(client);
export const tablesDB = new TablesDB(client);
export const storage = new Storage(client);
export const teams = new Teams(client);
export const realtime = new Realtime(client);

/**
 * Fetches all rows from an Appwrite collection by handling pagination automatically.
 * 
 * @template T - The expected type of the returned rows
 * @param {string} databaseId - The ID of the database
 * @param {string} tableId - The ID of the collection/table
 * @param {string[]} queries - Optional Appwrite queries to filter results
 * @returns {Promise<T[]>} A promise that resolves to an array of all rows
 */
export const fetchAllRows = async <T extends any>(
  databaseId: string,
  tableId: string,
  queries: string[] = [],
): Promise<T[]> => {
  let allRows: T[] = [];
  let offset = 0;
  const LIMIT = 100;
  let hasMore = true;

  while (hasMore) {
    const response = await tablesDB.listRows({
      databaseId,
      tableId,
      queries: [...queries, Query.limit(LIMIT), Query.offset(offset)],
    });

    allRows = [...allRows, ...(response.rows as unknown as T[])];

    if (response.rows.length < LIMIT) {
      hasMore = false;
    } else {
      offset += LIMIT;
    }
  }

  return allRows;
};

/**
 * Fetches a paginated slice of rows from an Appwrite collection.
 * 
 * @template T - The expected type of the returned rows
 * @param {string} databaseId - The ID of the database
 * @param {string} tableId - The ID of the collection/table
 * @param {string[]} queries - Optional Appwrite queries
 * @param {number} page - The page number (1-indexed)
 * @param {number} limit - Number of items per page
 * @param {string} [searchQuery] - Search string for filtering
 * @param {string} [searchAttribute] - The attribute to search against
 * @returns {Promise<{ rows: T[]; total: number }>} A promise with rows and total count
 */
export const fetchPaginatedRows = async <T extends any>(
  databaseId: string,
  tableId: string,
  queries: string[] = [],
  page: number = 1,
  limit: number = 10,
  searchQuery?: string,
  searchAttribute?: string
): Promise<{ rows: T[]; total: number }> => {
  const offset = (page - 1) * limit;
  const activeQueries = [...queries, Query.limit(limit), Query.offset(offset)];

  if (searchQuery && searchAttribute) {
    activeQueries.push(Query.search(searchAttribute, searchQuery));
  }

  const response = await tablesDB.listRows({
    databaseId,
    tableId,
    queries: activeQueries,
  });

  return {
    rows: response.rows as unknown as T[],
    total: response.total,
  };
};

export { client, ID, OAuthProvider, Query };

