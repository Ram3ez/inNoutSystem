/**
 * GLOBAL CONFIGURATION & SENSITIVITY HUB
 *
 * This module centralizes all environment-specific constants, database schemas,
 * institutional thresholds, and AI sensitivity settings.
 *
 * CORE RESPONSIBILITIES:
 * 1. Appwrite Schema Mapping (Collections, Teams, Storage).
 * 2. Biometric Thresholds (Distance metrics, Diversity requirements, Conflict gaps).
 * 3. Temporal Constraints (Gender-based outing restrictions, IST timezone normalization).
 * 4. Adaptive Sync (WebSocket toggle, Heartbeat intervals).
 */

// Appwrite Database ID
export const DB_ID = "69cb970a000853f23489";

/**
 * Sync Configuration
 * Used to toggle between Realtime (WebSockets) and Adaptive Polling.
 */
export const DISABLE_REALTIME =
  process.env.NEXT_PUBLIC_DISABLE_REALTIME?.toString().trim() === "true";

/**
 * Appwrite Collection IDs
 * Used for database operations across the application.
 */
export const COLLECTIONS = {
  STUDENTS: "student_details",
  LEAVE: "leave",
  LEAVE_ARCHIVE: "leave_archive",
  OUTING: "outing",
  OUTING_ARCHIVE: "outing_archive",
  CARETAKER: "coll_caretaker",
  FACULTY: "coll_faculty",
  FACIAL_EMBEDDINGS: "facial_embeddings",
  FACIAL_EMBEDDINGS_NEW: "facial_embeddings_new",
  FACIAL_EMBEDDINGS_EDGE: "facial_embeddings_edge",
  STAFF_DETAILS: "staff_details",
  HOLIDAYS: "holidays",
  AUDIT_LOGS: "audit_logs",
} as const;

/**
 * Appwrite Team IDs
 * Used for role-based access control (RBAC).
 */
export const TEAMS = {
  ADMIN: "69ef1f3500234902b8e8",
  KIOSK: "69ef205100213c8cc871",
  FACULTY: "69f10f20000ea87eeb08",
  CARETAKER: "69f10f3a002c7dd58e7a",
} as const;

/**
 * LocalStorage Cache Keys
 * Used by AuthContext to persist session data and roles.
 */
export const CACHE_KEYS = {
  USER: "_npx_u1",
  ADMIN: "_npx_a1",
  KIOSK: "_npx_k1",
  FACULTY: "_npx_f1",
  CARETAKER: "_npx_c1",
  STUDENT: "_npx_s1",
  STAFF: "_npx_t1",
} as const;

// API Secret for internal proxy or secured requests
export const API_SECRET = "9b0f44358a9807567ecb5107e3240742f36d0a7a";

/**
 * Biometric Configuration
 * Defines thresholds for matching, diversity, and adaptive updates for different AI models.
 * Used primarily in `ghostface.worker.ts`, `edgeface.worker.ts`, and `faceCache.ts`.
 */
export const BIOMETRIC_THRESHOLDS = {
  GHOSTFACE: {
    /** Cosine similarity threshold for a positive match. Higher means stricter matching. */
    MATCH: 0.6,
    /** Minimum required distance between frames during registration to ensure diverse angles are captured. */
    DIVERSITY: 0.8,
    /** If a recognized face scores above this threshold, the system may adaptively update their stored embedding. */
    ADAPTIVE_UPDATE: 0.8,
    /** The minimum required difference in score between the #1 match and the #2 match to confidently avoid a false positive. */
    CONFLICT_GAP: 0.05,
  },
  EDGEFACE: {
    /** Cosine similarity threshold for EdgeFace. Calibrated differently than GhostFaceNet. */
    MATCH: 0.62,
    DIVERSITY: 0.89,
    ADAPTIVE_UPDATE: 0.7,
    CONFLICT_GAP: 0.05,
  },
} as const;

/**
 * Formats a date to Indian Standard Time (IST) string.
 * Format: MMM DD, HH:MM AM/PM
 */
export function formatToIST(
  dateInput: string | Date | number | null | undefined,
): string {
  if (!dateInput) return "N/A";
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "Invalid Date";
    return d.toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "Invalid Date";
  }
}

/**
 * Formats a date to IST time string only.
 * Format: HH:MM:SS AM/PM
 */
export function formatToISTTime(
  dateInput: string | Date | number | null | undefined,
): string {
  if (!dateInput) return "N/A";
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "Invalid Date";
    return d.toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return "Invalid Date";
  }
}

/**
 * Formats a date to full IST datetime string.
 * Format: DD/MM/YYYY, HH:MM:SS AM/PM
 */
export function formatToISTFull(
  dateInput: string | Date | number | null | undefined,
): string {
  if (!dateInput) return "N/A";
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "Invalid Date";
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return "Invalid Date";
  }
}
