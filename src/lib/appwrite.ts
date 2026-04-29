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
  .setEndpoint("https://hostel.ram3ez.dev/v1")
  .setProject("6991740c001012a4a46f");

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

export { client, ID, OAuthProvider, Query };
