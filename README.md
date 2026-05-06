# NITPY Hostel Management System — Biometric AI PWA

A premium, touchless biometric hostel management system built for **NIT Puducherry**. This system automates student outings, leave management, and faculty/caretaker oversight using a cutting-edge on-device AI pipeline. Featuring a robust offline-first architecture, relational data management via TablesDB, and multi-threaded AI processing.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Appwrite](https://img.shields.io/badge/Backend-Appwrite%201.9-red)
![AI](https://img.shields.io/badge/AI-GhostFace%20(ONNX)%20%2B%20EdgeFace%20%2B%20MediaPipe-green)
![PWA](https://img.shields.io/badge/PWA-Offline%20First-orange)

---

## 🚀 Key Features

### 1. Hybrid AI Biometric Engine
*   **Web Worker Offloading**: High-performance face detection and search are handled in dedicated background threads (`faceSearch.worker.ts`, `ghostface.worker.ts`, and `edgeface.worker.ts`), ensuring a 60FPS UI even during heavy AI processing.
*   **Precision AI Pipeline**: 
    *   **MediaPipe**: Used for real-time face landmarking, pose estimation, and "Stability" checks.
    *   **GhostFaceNet (ONNX)**: A specialized SOTA recognition model running via `onnxruntime-web` for generating 512-d embeddings with extreme precision, utilizing MediaPipe for direct face alignment.
    *   **EdgeFace (ONNX)**: An optimized lightweight model running via `onnxruntime-web` for low-latency facial embedding generation on the edge.
    *   **face-api.js**: Leveraged as an alternative or fallback model for standard detection and alignment.
*   **Temporal Consensus**: Recognition isn't instant; the system requires a stable "consensus" over multiple frames to eliminate false positives.

### 2. Timezone Precision & Outing Restrictions
*   **Centralized IST (Asia/Kolkata)**: All date-times displayed across Student, Caretaker, Faculty, and Admin portals are normalized to the Indian Standard Time zone.
*   **Gender-Based Outing Control**: Outing checkout features on the capture screen are intelligently disabled during restricted hours:
    *   **Girls**: Restrict outings starting from **6:30 PM to 3:00 AM**.
    *   **Boys**: Restrict outings starting from **10:30 PM to 3:00 AM**.
    *   **Returns**: Both genders are always allowed to check in from active outings at any time.

### 3. Parent Consent & Student Leave Management
*   **Parent Verification**: Integration for tracking parent email/contact metadata with automatic consent notifications.
*   **Leave Extensions**: Students can request to extend active leave returns directly from their dashboard with automated advisor and parent notifications.
*   **Flexible Leave Lifecycle**: 
    *   **Max Active Leaves**: Students can now have up to **3 active leave requests** simultaneously.
    *   **Self-Archive**: Students can archive approved leave applications directly from their dashboard via a custom, premium confirmation modal, moving them to past history.
*   **Automated Advisor Mails**: Faculty can instantly notify parents about students' leave approvals, movements, and unapproved delays.

### 4. Advanced Admin Dashboard & Analytics
*   **Local-to-UTC Precise Conversion**: Prevents date matching timezone bugs across outings and leaves through automated IST local-day boundary shifting.
*   **Dynamic Custom Filtering**: Seamless filter popover dropdowns for filtering exactly by *Out Time* vs *In Time* for outings, and *Departure* vs *Return* for leaves.
*   **Real-time Activity Status**: Shows live contextual badges (`Currently Out` / `Completed`) for active leave requests, ensuring instant visual awareness for hostel administrators.
*   **Standardized "Contains" Search**: All administrative and registration search modules utilize "contains" matching instead of "starts with," ensuring reliable retrieval of student records across all portals.
*   **Enhanced Reporting & CSV Export**: 
    *   **Dedicated Export Modal**: Premium interface for generating Outings and Leaves reports with duration-specific selectors (Date Picker for Days/Weeks, Month Picker for Months).
    *   **Smart Filenames**: Automatic generation of human-readable filenames in `DD-MM-YYYY` format based on the selected period.
    *   **Precise IST Boundaries**: Reporting engine utilizes IST-adjusted (+05:30) date boundaries for 100% accuracy in data retrieval from both active and archive collections.
*   **Administrative Outing Blocking**: 
    *   **Granular Restriction**: Admins can block specific students from taking outings until a chosen future date.
    *   **Proactive Enforcement**: The capture page automatically checks block status during face/barcode recognition, showing a warning dialog and preventing departure for restricted students.
    *   **Visual Status Indicators**: Real-time "Blocked" badges and color-coded lock icons in the admin student list for instant status awareness.
*   **Holidays & Academic Calendar Management**: Integrated administrative controls to mark Gazetted and Restricted holidays. Prevents scheduling issues, aids leave evaluations, and visualizes important institutional dates.

### 5. Relational Data & TablesDB (1.9.0+)
*   **Scalable Architecture**: Migrated from standard Appwrite Databases to **TablesDB**, enabling complex relational structures and high-performance querying for 2,000+ users.
*   **Recursive Fetching**: Built-in `fetchAllRows` utility bypasses traditional 100-record limits through automated recursive offset pagination, ensuring full visibility across all modules.

### 6. Advanced PWA & Offline Resilience
*   **Intelligent Sync Engine**: Biometric captures and status updates are queued locally in IndexedDB when the network is unstable.
*   **OfflineSyncManager**: A dedicated background service that monitors connectivity and automatically flushes the local queue once the system is back online.
*   **Authenticated Asset Warming**: Optimizes PWA performance by loading heavy AI models and biometric caches only for authenticated Administrative or Kiosk users, reducing data overhead for standard students.
*   **Proactive Asset Warming**: Pre-warms facial embedding caches, making the kiosk "instant-on" for the next student.

### 7. Role-Based Access Control (RBAC)
*   **Institutional Intelligence**: Automatically detects user roles based on email patterns (Student vs. Staff).
*   **Staff Login View Customization**: For staff logins, student-only settings and features (My Leaves, Apply for Leave) are automatically hidden for maximum security and relevance.
*   **Gated Environments**: Deep integration with **Appwrite Teams** for granular control:
    *   **Admin**: Total system oversight and configuration.
    *   **Kiosk**: Dedicated touchless recognition interface.
    *   **Faculty/Caretaker**: Management of outings, leave approvals, and student records.

### 8. Security Hardening & Obfuscated Caching
*   **Obfuscated Session Cache**: All localized role, session, student, and admin states are stored in obfuscated keys and fully encrypted via `TextEncoder`/`TextDecoder` Base64 encoding. This completely prevents any student from tampering with privileges using Developer Tools.
*   **Restricted Email Proxy**: Outbound parent and advisor notifications strictly require a valid, internal `X-API-Secret` header to execute, preventing any unauthorized API exploitation.
*   **Leak-Free Async Timers**: Cleanup logic clears background warming timeouts on unmount, optimizing the application for performance and memory conservation.

---

## 🛠 Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 15 (App Router) |
| **Runtime** | React 19 + TypeScript |
| **AI Processing** | GhostFaceNet (ONNX) + EdgeFace (ONNX) + MediaPipe + face-api.js |
| **Backend** | Appwrite (Auth, TablesDB, Teams, Storage) |
| **Offline Sync** | Service Workers + IndexedDB |
| **Styling** | Tailwind CSS 4 + Framer Motion |
| **Icons** | Lucide React |

---

## 🏗 System Architecture

### Biometric Pipeline
1.  **Detection & Stability**: MediaPipe tracks real-time face landmarks, pose estimation, and face stability to ensure image quality before extraction.
2.  **Worker Transfer**: The aligned face frame is passed to either `ghostface.worker.ts` or `edgeface.worker.ts` depending on the active model.
3.  **Embedding Generation**: GhostFaceNet or EdgeFace generates a 512-dimension descriptor independently using the aligned image.
4.  **Conflict Detection**: The system checks the `CONFLICT_GAP` between the best match and the runner-up to prevent identity confusion among lookalikes.
5.  **Sync**: Successful matches update the `outing` or `leave` records via the `OfflineSyncManager`.

### Centralized Calibration
All AI sensitivities are centralized in `src/lib/constants.ts`, allowing for instant adjustment of matching thresholds, registration diversity requirements, and adaptive profile update scores for all three models (**GhostFaceNet**, **EdgeFace**, **Face-API**).

---

## 📊 Database Schema

### Relational Tables
*   `student_details`: Metadata for students (Roll Number as Primary Key).
    *   Includes `outing_blocked_until` for movement restriction.
*   `facial_embeddings`: High-dimensional vectors for the standard Face-API model.
*   `facial_embeddings_new`: High-dimensional vectors for the GhostFaceNet model.
*   `facial_embeddings_edge`: High-dimensional vectors for the EdgeFace model.
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
    NEXT_PUBLIC_APPWRITE_ENDPOINT=YOUR_APPWRITE_ENDPOINT
    NEXT_PUBLIC_APPWRITE_PROJECT_ID=YOUR_PROJECT_ID
    ```

4.  **Run Development Server**:
    ```bash
    npm run dev
    ```

---

## 📜 License
This project is licensed under the MIT License. Built with ❤️ for NIT Puducherry.
