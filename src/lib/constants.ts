export const DB_ID = "69cb970a000853f23489";

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
  STAFF_DETAILS: "staff_details",
  HOLIDAYS: "holidays",
} as const;

export const TEAMS = {
  ADMIN: "69ef1f3500234902b8e8",
  KIOSK: "69ef205100213c8cc871",
  FACULTY: "69f10f20000ea87eeb08",
  CARETAKER: "69f10f3a002c7dd58e7a",
} as const;

export const CACHE_KEYS = {
  USER: "_npx_u1",
  ADMIN: "_npx_a1",
  KIOSK: "_npx_k1",
  FACULTY: "_npx_f1",
  CARETAKER: "_npx_c1",
  STUDENT: "_npx_s1",
  STAFF: "_npx_t1",
} as const;

export const API_SECRET = "9b0f44358a9807567ecb5107e3240742f36d0a7a";

export const BIOMETRIC_THRESHOLDS = {
  GHOSTFACE: {
    MATCH: 0.58, // Recognition sensitivity (Higher = stricter)
    DIVERSITY: 0.8, // Minimum diversity between registration frames
    ADAPTIVE_UPDATE: 0.8, // Score required to auto-update profile
    CONFLICT_GAP: 0.05, // Gap between best and second best to be considered a conflict
  },
  FACE_API: {
    MATCH: 0.969,
    DIVERSITY: 0.97,
    CONFLICT_GAP: 0.05,
  },
} as const;

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
