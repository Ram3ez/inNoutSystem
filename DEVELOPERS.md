# NITPY Hostel System — Comprehensive Developer Manual

Welcome to the official developer guide. This document provides everything required for a new developer to understand the architecture, contribute to the UI, and interact with the biometric backend safely.

---

## 🏗️ Core Architecture & Tech Stack

The system is built as a **Progressive Web App (PWA)** using a high-performance, multithreaded architecture.

- **Frontend**: Next.js 16 (App Router) + TypeScript.
- **Styling**: Tailwind CSS 4 + Framer Motion (Animations).
- **Backend**: Appwrite 1.9 (Auth, TablesDB, Storage).
- **AI Engines**: MediaPipe (Alignment) + ONNX Runtime (Recognition via GhostFace/EdgeFace).
- **Concurrency**: Web Workers for all AI inference (Main thread stays at 60FPS).
- **Offline Support**: IndexedDB (Local cache) + Service Workers (PWA).

---

## 🧱 Using the `BasePage` Component

The `BasePage` component is the mandatory foundation for all new pages. It handles background gradients, navigation injection, and theme transitions automatically.

### Basic Usage
```tsx
import { BasePage } from "@/components/BasePage";

export default function MyPage() {
  return (
    <BasePage 
      title="My Feature" 
      subtitle="Brief description of the tool"
      maxWidth="xl" // sm | md | lg | xl | 7xl | full
    >
      {/* Content goes here - use bg-surface for glassmorphism cards */}
      <div className="bg-surface/40 backdrop-blur-xl border border-primary/5 rounded-[2.5rem] p-8">
         <h2 className="text-xl font-bold text-primary">Hello World</h2>
      </div>
    </BasePage>
  );
}
```

### 🛡️ Role-Based Access Control (RBAC)
`BasePage` handles redirection automatically. If a user lacks a role, they are silently sent back to `/`.

```tsx
<BasePage requireAdmin={true}> {/* Only Admins */}
<BasePage requireFaculty={true}> {/* Only Faculty Advisors */}
<BasePage requireCaretaker={true}> {/* Only Hostel Caretakers */}
<BasePage requireKiosk={true}> {/* Only Kiosk Devices */}
```

---

## 🔐 Authentication & Global State

### `useAuth` (The Power Hook)
Provides all identity and permission data.

```tsx
const { 
  user,           // Account metadata
  isAdmin,        // Boolean
  isFaculty,      // Boolean
  isCaretaker,    // Boolean
  isKiosk,        // Boolean
  studentData,    // Relational data (Roll No, Course, parent info)
  logout          // Function
} = useAuth();
```

### `useLoading` (The Progress System)
Controls the premium top-loading bar. Use this for all async operations.

```tsx
const { startLoading, stopLoading, updateProgress } = useLoading();

// Best Practice:
try {
  startLoading();
  updateProgress(50); // Optional: show specific %
  await myAsyncFunction();
} finally {
  stopLoading();
}
```

---

## 📊 Database Patterns (TablesDB)

The system uses **Appwrite TablesDB**. Because Appwrite has a 100-record limit per request, we use a custom utility to fetch entire collections.

### 🔄 `fetchAllRows` (Bypassing Limits)
```tsx
import { fetchAllRows, tablesDB } from "@/lib/appwrite";
import { DB_ID, COLLECTIONS } from "@/lib/constants";

const allStudents = await fetchAllRows(DB_ID, COLLECTIONS.STUDENTS);
```

### 🛡️ `logTransaction` (Audit Logging)
Mandatory for all sensitive database changes.

```tsx
import { logTransaction } from "@/lib/auditLogger";

await logTransaction({
  action: "STUDENT_BLOCK",
  message: `Admin ${user.name} blocked student ${rollNo}.`,
  level: "high", // high | medium | low
  metadata: { rollNo, reason: "Disciplinary" }
});
```

---

## 🧬 Biometric Pipeline & Workers

The AI pipeline is heavily optimized and offloaded to Web Workers.

1. **MediaPipe**: Handles face alignment and "Stability" checks in `src/lib/aiEngine.ts`.
2. **GhostFace/EdgeFace**: Extract 512-dimension descriptors via `src/workers/`.
3. **FaceSearch**: Performs cosine similarity matching in `faceSearch.worker.ts`.

> [!TIP]
> Never run AI models on the main thread. Always use the worker interfaces in `@/lib/ghostfaceEngine.ts` or `@/lib/edgefaceEngine.ts`.

---

## 📧 Communications (Email API)

The system includes a standardized SMTP proxy for sending notifications to parents or staff.

```tsx
const response = await fetch("/api/send-email", {
  method: "POST",
  body: JSON.stringify({
    to: "parent@example.com",
    subject: "Leave Approval",
    text: "Your ward's leave has been approved...",
    html: "<h1>Approval Notification</h1>..."
  }),
});
```

---

## 📡 Offline Resilience

The system is designed to work in restricted institutional networks.

- **Offline Queue**: Outings and Logs are saved to `localStorage` or `IndexedDB` when offline.
- **SyncService**: Automatically flushes the queue when `navigator.onLine` returns true.
- **Polling Fallback**: If WebSockets are blocked, the system falls back to a 60-second polling heartbeat managed in `faceCache.ts`.

---

## 🎨 Design System & Tokens

Maintain the **Institutional Premium** look by using these tokens:

- **Surface Card**: `bg-surface/40 backdrop-blur-xl border border-primary/5 rounded-[2.5rem]`
- **Headings**: `font-bold text-primary uppercase tracking-tight`
- **Sub-headings**: `text-[10px] font-bold text-primary/40 uppercase tracking-widest`
- **Primary Color**: `text-secondary` (for accents and icons)
- **Icons**: Always use `lucide-react` icons.

---

## 🛠️ Maintenance & Deployment

### Environment Variables (.env.local)
- `NEXT_PUBLIC_APPWRITE_ENDPOINT`: Appwrite API URL.
- `NEXT_PUBLIC_APPWRITE_PROJECT_ID`: Project ID.
- `APPWRITE_API_KEY`: Secret key for server-side operations.
- `NEXT_PUBLIC_DISABLE_REALTIME`: Set to `true` if WebSockets are failing.

### Running Locally
```bash
npm run dev
```

### Production Build
```bash
npm run build
./scripts/moveScript.sh # Essential: Syncs public assets to standalone
pm2 reload hostelSystem
```

---

_Created and Maintained for NIT Puducherry._
