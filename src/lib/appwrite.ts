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

const client = new Client();

client
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "")
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "");

export const account = new Account(client);
export const databases = new Databases(client);
export const tablesDB = new TablesDB(client);
export const storage = new Storage(client);
export const teams = new Teams(client);
export const realtime = new Realtime(client);

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
