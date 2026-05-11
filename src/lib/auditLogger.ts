"use client";

/**
 * Audit Logger Utility
 * Provides a standardized way to log database transactions and critical actions.
 * Calls the /api/log route to ensure logs are permanently stored on the server/DB.
 */

export interface LogData {
  action: string;
  message: string;
  userId?: string;
  userName?: string;
  metadata?: any;
  level?: "low" | "medium" | "high";
}

/**
 * Sends a transaction log to the server for permanent storage in Appwrite.
 * 
 * @param data - The log entry details
 */
export const logTransaction = async (data: LogData) => {
  try {
    // Attempt to get user info from localStorage if not provided
    let userId = data.userId;
    let userName = data.userName;

    if (typeof window !== "undefined") {
      if (!userId) {
        const userStr = localStorage.getItem("_npx_u1");
        if (userStr) {
          try {
            /**
             * Helper: Decode Base64 cache from AuthContext
             * AuthContext stores a base64-encoded JSON blob for role/session persistence.
             * We decode this to attribute logs to the active administrator.
             */
            const decodeCache = (encoded: string) => {
              try {
                const binString = atob(encoded);
                const bytes = new Uint8Array(binString.length);
                for (let i = 0; i < binString.length; i++) {
                  bytes[i] = binString.charCodeAt(i);
                }
                const json = new TextDecoder().decode(bytes);
                return JSON.parse(json);
              } catch {
                return JSON.parse(encoded); // Fallback to raw JSON if not base64
              }
            };

            const user = decodeCache(userStr);
            if (user) {
              userId = user.email ? user.email.split("@")[0].toUpperCase() : "UNKNOWN";
              if (!userName) userName = user.name;
            }
          } catch (e) {
            console.warn("[🛡️ AUDIT] Failed to parse user cache:", e);
          }
        }
      }
    }

    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        userId: userId || "SYSTEM",
        userName: userName || "SYSTEM",
      }),
    });
  } catch (err) {
    console.warn("[🛡️ AUDIT] Failed to record transaction log:", err);
  }
};
