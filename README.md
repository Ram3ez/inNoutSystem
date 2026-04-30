# NITPY Hostel Management System — Biometric AI PWA

A premium, touchless biometric hostel management system built for **NIT Puducherry**. This system automates student outings, leave management, and faculty/caretaker oversight using a cutting-edge on-device AI pipeline. Featuring a robust offline-first architecture, relational data management via TablesDB, and multi-threaded AI processing.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Appwrite](https://img.shields.io/badge/Backend-Appwrite%201.9-red)
![AI](https://img.shields.io/badge/AI-GhostFace%20(ONNX)%20%2B%20MediaPipe-green)
![PWA](https://img.shields.io/badge/PWA-Offline%20First-orange)

---

## 🚀 Key Features

### 1. Multi-Threaded Biometric AI Engine
*   **Web Worker Offloading**: High-performance face detection and search are handled in dedicated background threads (`faceSearch.worker.ts`, `ghostface.worker.ts`), ensuring a 60FPS UI even during heavy AI processing.
*   **Dual-Model Pipeline**: 
    *   **face-api.js/MediaPipe**: Used for lightning-fast face detection, alignment, and liveness checks.
    *   **GhostFace (ONNX)**: A specialized high-precision model running via `onnxruntime-web` for generating 128-d or 512-d embeddings with superior accuracy in low-light and diverse angle conditions.
*   **Temporal Consensus**: Recognition isn't instant; the system requires a stable "consensus" over multiple frames to eliminate false positives.

### 2. Relational Data & TablesDB (1.9.0+)
*   **Scalable Architecture**: Migrated from standard Appwrite Databases to **TablesDB**, enabling complex relational structures and high-performance querying for 2,000+ users.
*   **Recursive Fetching**: Built-in `fetchAllRows` utility bypasses traditional 100-record limits through automated recursive offset pagination, ensuring full visibility across all modules.

### 3. Advanced PWA & Offline Resilience
*   **Intelligent Sync Engine**: Biometric captures and status updates are queued locally in IndexedDB when the network is unstable.
*   **OfflineSyncManager**: A dedicated background service that monitors connectivity and automatically flushes the local queue once the system is back online.
*   **Asset Warming**: Proactively pre-warms AI model weights and facial embedding caches, making the kiosk "instant-on" for the next student.

### 4. Role-Based Access Control (RBAC)
*   **Institutional Intelligence**: Automatically detects user roles based on email patterns (Student vs. Staff).
*   **Gated Environments**: Deep integration with **Appwrite Teams** for granular control:
    *   **Admin**: Total system oversight and configuration.
    *   **Kiosk**: Dedicated touchless recognition interface.
    *   **Faculty/Caretaker**: Management of outings, leave approvals, and student records.

---

## 🛠 Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 15 (App Router) |
| **Runtime** | React 19 + TypeScript |
| **AI Processing** | ONNX Runtime Web + face-api.js |
| **Backend** | Appwrite (Auth, TablesDB, Teams, Storage) |
| **Offline Sync** | Service Workers + IndexedDB |
| **Styling** | Tailwind CSS 4 + Framer Motion |
| **Icons** | Lucide React |

---

## 🏗 System Architecture

### Biometric Pipeline
1.  **Detection**: MediaPipe identifies a face and ensures "Stability" (centered and still).
2.  **Worker Transfer**: The image buffer is sent to `ghostface.worker.ts`.
3.  **Embedding Generation**: GhostFace generates a high-precision descriptor.
4.  **Conflict Detection**: The system checks the `CONFLICT_GAP` between the best match and the runner-up to prevent identity confusion among lookalikes.
5.  **Sync**: Successful matches update the `outing` or `leave` records via the `OfflineSyncManager`.

### Centralized Calibration
All AI sensitivities are centralized in `src/lib/constants.ts`, allowing for instant adjustment of matching thresholds, registration diversity requirements, and adaptive profile update scores.

---

## 📊 Database Schema

### Relational Tables
*   `student_details`: Metadata for students (Roll No as Primary Key).
*   `facial_embeddings`: High-dimensional AI vectors for each student.
*   `outing` / `leave`: Real-time tracking of student movement.
*   `staff_details`: Building/Room assignments for faculty and caretakers.

---

## 💻 Local Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/your-repo/hostel-web.git
    cd hostel-web
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Variables**:
    Create a `.env.local` file:
    ```env
    NEXT_PUBLIC_APPWRITE_ENDPOINT=https://hostel.ram3ez.dev/v1
    NEXT_PUBLIC_APPWRITE_PROJECT_ID=6991740c001012a4a46f
    ```

4.  **Run Development Server**:
    ```bash
    npm run dev
    ```

---

## 📜 License
This project is licensed under the MIT License. Built with ❤️ for NIT Puducherry.
