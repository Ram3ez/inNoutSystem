# Project Structure & Maintenance Guide

This document provides an overview of the project structure, the purpose of each directory, and key files to help new maintainers get up to speed.

## Overview

This is a **Next.js 15+** application using the **App Router** architecture. It serves as a hostel management system with advanced biometric (face recognition) capabilities.

### Tech Stack
- **Framework**: Next.js (React)
- **Backend-as-a-Service**: Appwrite (Authentication, Database, Storage)
- **Styling**: Vanilla CSS / Tailwind CSS (depending on configuration)
- **AI/Biometrics**: MediaPipe, ONNX Runtime (EdgeFace, GhostFaceNet), Face-API.js
- **Offline Support**: IndexedDB, Service Workers (PWA)

---

## Directory Structure

### `src/app/`
Contains the application's pages and API routes using the Next.js App Router.
- `api/`: Backend API endpoints (e.g., email service, Appwrite proxy).
- `(auth)`: (If present) Authentication-related pages.
- `admin/`: Admin portal for managing students and staff.
- `faculty/` / `caretaker/`: Dashboards for specific staff roles.
- `register-face/`: Biometric registration flow.
- `leave/` / `my-leaves/`: Leave application and tracking.

### `src/components/`
Reusable UI components.
- `Navigation.tsx`: Main sidebar/navbar.
- `OfflineSyncManager.tsx`: Handles data synchronization when coming back online.
- `LoadingIndicator.tsx`: Global or component-level loaders.

### `src/context/`
React Context providers for global state management.
- `AuthContext.tsx`: Manages user sessions, roles (Admin, Faculty, etc.), and profile data.
- `ThemeContext.tsx`: Manages dark/light mode preferences.

### `src/lib/`
Core business logic, AI engines, and utility functions.
- `appwrite.ts`: Appwrite client initialization and data fetching helpers.
- `aiEngine.ts`: Integration with MediaPipe for face landmark detection.
- `edgefaceEngine.ts` / `ghostfaceEngine.ts`: ONNX-based face recognition models.
- `faceCache.ts`: Manages local storage of facial embeddings for fast matching.
- `idb.ts`: IndexedDB wrapper for offline data storage.
- `syncService.ts`: Logic for syncing offline changes to Appwrite.
- `constants.ts`: Global constants, collection IDs, and biometric thresholds.

### `src/types/`
TypeScript definitions and interfaces.
- `models.ts`: Defines data structures for Students, Leave requests, Staff, etc.

### `public/`
Static assets.
- `models/`: Pre-trained AI models (ONNX, TFLite).
- `mediapipe/`: MediaPipe-specific WASM and model files.

---

## Key Workflows

### Biometric Registration
1. User captures multiple frames of their face.
2. `aiEngine` extracts landmarks.
3. `ghostfaceEngine` or `edgefaceEngine` generates embeddings.
4. Embeddings are stored in Appwrite for future verification.

### Offline Mode
1. Data is cached in IndexedDB via `idb.ts`.
2. Mutations are queued in `offlineQueue.ts` if the user is offline.
3. `syncService.ts` automatically pushes queued items when a connection is restored.

---

## Maintenance Notes
- **Updating Models**: Replace files in `public/models/` and update paths in the respective engine files in `src/lib/`.
- **Database Schema**: Collection IDs and field names are defined in `src/lib/constants.ts`.
- **Environment Variables**: See `.env.local` for required keys (Appwrite endpoint, project ID, etc.).
