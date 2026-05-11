# Project Structure & Maintenance Guide

This document provides an overview of the project structure, the purpose of each directory, and key files to help new maintainers get up to speed.

## Overview

This is a **Next.js 16+** application using the **App Router** architecture. It serves as a hostel management system with advanced biometric (face recognition) capabilities.

### Tech Stack
- **Framework**: Next.js (React)
- **Backend-as-a-Service**: Appwrite (Authentication, Database, Storage)
- **Styling**: Vanilla CSS / Tailwind CSS (depending on configuration)
- **AI/Biometrics**: MediaPipe, ONNX Runtime (EdgeFace, GhostFaceNet)
- **Offline Support**: IndexedDB, Service Workers (PWA)

---

## Directory Structure

```text
src/
├── app/                  # Next.js App Router (Pages & API)
│   ├── admin/            # Administrative console
│   ├── capture/          # Kiosk biometric recognition page
│   ├── faculty/          # Faculty Advisor dashboard
│   ├── caretaker/        # Hostel Caretaker dashboard
│   ├── register-face/    # Self-service student face enrollment
│   ├── live-status/      # Real-time movement monitor
│   ├── audit-logs/       # System observability & transaction history
│   └── system/           # System health & maintenance
├── components/           # Shared UI Components (Glassmorphism)
│   ├── GradientBackground.tsx
│   ├── Navigation.tsx
│   └── LoadingIndicator.tsx
├── context/              # Global State Management
│   ├── AuthContext.tsx   # RBAC & Appwrite Session management
│   └── LoadingContext.tsx # Global progress & navigation loading
├── lib/                  # Core Business & AI Logic
│   ├── aiEngine.ts       # MediaPipe Landmarker initialization
│   ├── ghostfaceEngine.ts # GhostFaceNet descriptor extraction
│   ├── edgefaceEngine.ts  # EdgeFace descriptor extraction
│   ├── faceCache.ts      # Biometric database sync & local caching
│   ├── appwrite.ts       # Backend client configuration
│   └── constants.ts      # Global thresholds, durations & IST settings
├── workers/              # Multithreaded AI Workers
│   ├── faceSearch.worker.ts # Background identity matching
│   ├── ghostface.worker.ts # Offloaded ONNX inference
│   └── edgeface.worker.ts  # Offloaded ONNX inference
└── types/                # TypeScript Interface definitions
```

### Detailed Breakdown

### `src/app/`
Contains the application's pages and API routes using the Next.js App Router.
- `api/`: Backend API endpoints (e.g., email service, Appwrite proxy).
- `(auth)`: (If present) Authentication-related pages.
- `admin/`: Admin portal for managing students and staff.
- `faculty/` / `caretaker/`: Dashboards for specific staff roles.
- `register-face/`: Biometric registration flow.
- `leave/` / `my-leaves/`: Leave application and tracking.
- `audit-logs/`: Administrative portal for viewing system logs.

### `src/components/`
Reusable UI components.
- `Navigation.tsx`: Main sidebar/navbar.
- `OfflineSyncManager.tsx`: Handles data synchronization when coming back online.
- `LoadingIndicator.tsx`: Global or component-level loaders.

### `src/context/`
React Context providers for global state management.
- `AuthContext.tsx`: Manages user sessions, roles (Admin, Faculty, etc.), and profile data.
- `ThemeContext.tsx`: Manages dark/light mode preferences.
- `LoadingContext.tsx`: Manages the global loading state and top progress bar for navigation feedback.

### `src/lib/`
Core business logic, AI engines, and utility functions.
- `appwrite.ts`: Appwrite client initialization and data fetching helpers.
- `aiEngine.ts`: Integration with MediaPipe for face landmark detection.
- `edgefaceEngine.ts` / `ghostfaceEngine.ts`: ONNX-based face recognition models using Web Workers.
- `fetchProgress.ts`: Specialized fetch utility with real-time progress reporting and Cache API persistence.
- `faceCache.ts`: Manages local storage of facial embeddings for fast matching.
- `idb.ts`: IndexedDB wrapper for offline data storage.
- `syncService.ts`: Logic for syncing offline changes to Appwrite.
- `auditLogger.ts`: Standardized utility for recording system transactions.
- `constants.ts`: Global constants, collection IDs, and biometric thresholds.

### `src/types/`
TypeScript definitions and interfaces.
- `models.ts`: Defines data structures for Students, Leave requests, Staff, etc.

### `public/`
Static assets.
- `models/`: Pre-trained AI models (ONNX, TFLite).
- `mediapipe/`: MediaPipe-specific WASM and model files.

---

## Key Workflows & Data Flow

### Biometric Registration Pipeline
1. **Capture Segment**: User captures multiple frames of their face from different angles using `src/app/register-face/page.tsx`.
2. **Alignment & Verification**: `aiEngine.ts` extracts facial landmarks using MediaPipe. It enforces stability, pose diversity, and lighting conditions.
3. **Extraction**: The aligned face frame is passed to either `ghostface.worker.ts` or `edgeface.worker.ts`. The ONNX models generate a 512-dimensional embedding vector.
4. **Storage**: Vectors are pushed to `facial_embeddings`, `facial_embeddings_new` (GhostFaceNet), or `facial_embeddings_edge` Appwrite collections.

### Biometric Recognition (Kiosk Mode)
1. **Cache Loading**: On startup, `faceCache.ts` loads all embeddings from Appwrite into memory.
2. **Continuous Scanning**: `src/app/capture/page.tsx` continuously feeds webcam frames into MediaPipe.
3. **Matching**: Detected faces are vectorized and compared against the in-memory cache using cosine similarity (via `faceSearch.worker.ts`).
4. **Consensus**: The system requires multiple consecutive matches (temporal consensus) to prevent false positives before logging an `outing` or `leave` timestamp.
5. **Stability & Concurrency**: Engines (`aiEngine`, `edgefaceEngine`, `ghostfaceEngine`) implement **Disposal Locks** to synchronize asynchronous cleanup and initialization, preventing race conditions during fast client-side navigation.
6. **Selective Observability**: High-frequency events (Recognition/Conflict) are routed to terminal consoles only, while high-value transactions are persistently stored with identity attribution and confidence scores.

### Offline-First Architecture & Sync
1. **Local Mutations**: If the kiosk loses internet, successful biometric matches are stored locally using IndexedDB (`src/lib/idb.ts`).
2. **Queuing**: Un-synced records are placed in an offline queue (`src/lib/offlineQueue.ts`).
3. **Background Sync**: `OfflineSyncManager.tsx` and `syncService.ts` monitor network status (`navigator.onLine`). When restored, they automatically batch-upload the queued transactions to Appwrite TablesDB.

---

## Database Schema Overview

The full Appwrite Database schema mapping is located in the root `README.md`. 
For TypeScript definitions, refer strictly to `src/types/models.ts`. 
Database collection IDs and environmental IDs are centrally managed in `src/lib/constants.ts`.

---

## Maintenance Notes
- **Updating Models**: Replace files in `public/models/` and update paths in the respective engine files in `src/lib/`.
- **Database Schema**: Collection IDs and field names are defined in `src/lib/constants.ts`.
- **Environment Variables**: Defined in `.env.local`. Required keys for production:
    ```env
    NEXT_PUBLIC_APPWRITE_ENDPOINT=
    NEXT_PUBLIC_APPWRITE_PROJECT_ID=
    APPWRITE_API_KEY=
    INTERNAL_APPWRITE_ENDPOINT=
    NEXT_PUBLIC_DISABLE_REALTIME=
    ```
