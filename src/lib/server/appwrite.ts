import { Client, TablesDB } from "node-appwrite";

/**
 * Server-side Appwrite Initialization
 * Uses the privileged API Key to bypass client-side permissions.
 * Only for use in API Routes or Server Actions.
 */

const createAdminClient = () => {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "")
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "")
    .setKey(process.env.APPWRITE_API_KEY || "")
    .setSelfSigned(true); // Allow self-signed or internal SSL certificates

  return {
    get tablesDB() {
      return new TablesDB(client);
    },
  };
};

export const { tablesDB: serverTablesDB } = createAdminClient();
