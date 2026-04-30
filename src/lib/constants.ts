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
} as const;

export const TEAMS = {
  ADMIN: "69ef1f3500234902b8e8",
  KIOSK: "69ef205100213c8cc871",
  FACULTY: "69f10f20000ea87eeb08",
  CARETAKER: "69f10f3a002c7dd58e7a",
} as const;

export const BIOMETRIC_THRESHOLDS = {
  GHOSTFACE: {
    MATCH: 0.55, // Recognition sensitivity (Higher = stricter)
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
