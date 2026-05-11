import { Client, TablesDB } from "node-appwrite";
import fs from "fs";
import path from "path";

/**
 * Server-side Appwrite Initialization
 * Uses the privileged API Key to bypass client-side permissions.
 * Only for use in API Routes or Server Actions.
 */

// Force load .env.local for standalone mode compatibility
if (!process.env.APPWRITE_API_KEY) {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf8");
      envContent.split("\n").forEach((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith("#")) return;
        const [key, ...valueParts] = trimmedLine.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts
            .join("=")
            .trim()
            .replace(/^["']|["']$/g, "");
          process.env[key.trim()] = value;
        }
      });
      console.log("[🛡️ APPWRITE-SERVER] Manually loaded .env.local variables");
    }
  } catch (err) {
    console.error("[🛡️ APPWRITE-SERVER] Env load error:", err);
  }
}

const createAdminClient = () => {
  const endpoint =
    process.env.INTERNAL_APPWRITE_ENDPOINT ||
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
    "";
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "";
  const apiKey = process.env.APPWRITE_API_KEY || "";

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey)
    .setSelfSigned(true);

  return {
    get tablesDB() {
      return new TablesDB(client);
    },
  };
};

export const { tablesDB: serverTablesDB } = createAdminClient();
