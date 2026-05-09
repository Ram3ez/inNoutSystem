# NITPY Hostel Management System — Biometric AI PWA

A premium, touchless biometric hostel management system built for **NIT Puducherry**. This system automates student outings, leave management, and faculty/caretaker oversight using a cutting-edge on-device AI pipeline. Featuring a robust offline-first architecture, relational data management via TablesDB, and multi-threaded AI processing.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Appwrite](https://img.shields.io/badge/Backend-Appwrite%201.9-red)
![AI](https://img.shields.io/badge/AI-GhostFace%20(ONNX)%20%2B%20EdgeFace%20%2B%20MediaPipe-green)
![PWA](https://img.shields.io/badge/PWA-Offline%20First-orange)

---

## 🚀 Key Features

### 1. Unified Digital Portal
*   **Inclusive Entry Point**: Replaced restrictive administrative branding with a "Digital Portal" identity, designed to encompass future institutional features beyond hostel management.
*   **Modern Institutional Design**: Features a professional glassmorphism interface with institutional colors, prioritizing clarity and accessibility for students and staff.

### 2. Hybrid AI Biometric Engine
*   **Web Worker Offloading**: High-performance face detection and search are handled in dedicated background threads (`faceSearch.worker.ts`, `ghostface.worker.ts`, and `edgeface.worker.ts`), ensuring a 60FPS UI even during heavy AI processing.
*   **Resilient Initialization**: Implements automated **GPU-to-CPU fallback** for the MediaPipe Landmarker, ensuring stability across devices with restricted hardware acceleration.

*   **Precision AI Pipeline**: 
    *   **MediaPipe**: Used for real-time face landmarking, pose estimation, and "Stability" checks.
    *   **GhostFaceNet (ONNX)**: A specialized SOTA recognition model running via `onnxruntime-web` for generating 512-d embeddings with extreme precision, utilizing MediaPipe for direct face alignment.
    *   **EdgeFace (ONNX)**: An optimized lightweight model running via `onnxruntime-web` for low-latency facial embedding generation on the edge.
    *   **face-api.js**: Leveraged as an alternative or fallback model for standard detection and alignment.
*   **Persistent Cache Infrastructure**: Implements a manual `Cache-First` strategy via the `Cache API` for all AI models (ONNX, TFLite). This ensures models are only downloaded once (~200MB saving) and remain persistent across browser restarts and offline sessions.
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

### 7. Global Performance Indicators
*   **Aesthetic Progress System**: Implemented a global, top-mounted progress bar that provides instant visual feedback for all client-side navigations and network-intensive actions.
*   **Perceived Latency Optimization**: Transitioned from standard link-based navigation to custom handlers with predictive loading triggers, ensuring the UI feels responsive even on slower networks.

### 8. Role-Based Access Control (RBAC)
*   **Institutional Intelligence**: Automatically detects user roles based on email patterns (Student vs. Staff).
*   **Staff Login View Customization**: For staff logins, student-only settings and features (My Leaves, Apply for Leave) are automatically hidden for maximum security and relevance.
*   **Gated Environments**: Deep integration with **Appwrite Teams** for granular control:
    *   **Admin**: Total system oversight and configuration.
    *   **Kiosk**: Dedicated touchless recognition interface.
    *   **Faculty/Caretaker**: Management of outings, leave approvals, and student records.

### 9. Adaptive Biometric Sync & Heartbeat
*   **WebSocket Fallback Polling**: Implements a robust `Adaptive Polling` architecture. If `DISABLE_REALTIME` is enabled (common in restricted institutional networks), the system automatically falls back to a 60-second heartbeat for biometric cache updates.
*   **Window Focus Optimization**: Polling frequency increases when the window gains focus, ensuring kiosks always have the latest identity descriptors before a student arrives.
*   **Manual Trigger Gates**: Admins and Kiosk operators have gated access to force a "Manual Sync," bypassing polling intervals for urgent biometric updates.

### 10. Unified Notification Standardization
*   **Non-Blocking Feedback**: Replaced legacy browser `alert()` popups with a standardized, state-based toast notification system across all administrative and student portals.
*   **High-Altitude Layering**: All notifications utilize a consistent `z-[100]` elevation, ensuring visibility above the "Top Layer" of modals and backdrop filters.
*   **Aesthetic Continuity**: Notifications feature institutional glassmorphism, contextual Lucide-React iconography, and Framer Motion micro-animations for a premium UX feel.

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

### Adaptive Sync
The `faceCache.ts` module manages a complex multi-tier caching strategy:
- **Level 1 (Memory)**: High-speed JS objects for millisecond recognition.
- **Level 2 (LocalStorage)**: Persistent descriptors to bridge browser restarts.
- **Level 3 (Remote)**: Periodic polling (60s) or Manual Sync triggers to keep descriptors fresh across all campus kiosks.

---

## 📊 Database Schema (Appwrite TablesDB)

The system relies on a relational database structure designed for high performance and complex querying.

### `student_details` (Students Collection)
*   **`$id` (String)**: Roll Number (Primary Key).
*   **`name` (String)**: Full name of the student.
*   **`phone_no` (Number)**: Student's contact number.
*   **`gender` (String)**: `MALE` | `FEMALE`.
*   **`department` (String)**: `CSE`, `MECH`, `EEE`, `ECE`, `CIVIL`, `PHY`, `CHEM`, `MATH`.
*   **`year` (String)**: `1`, `2`, `3`, `4`.
*   **`course` (String)**: `b.tech`, `m.tech`, `bsc`, `msc`.
*   **`is_out` (Boolean)**: True if student is currently on a short outing.
*   **`is_on_leave` (Boolean)**: True if student is on an approved long leave.
*   **`faceRegistered` (Boolean)**: Legacy Face-API status.
*   **`ghostface_registered` (Boolean)**: GhostFaceNet status.
*   **`edgeface_registered` (Boolean)**: EdgeFace status.
*   **`parent_name` / `parent_phone` / `parent_email`**: Verified parent contact details.
*   **`pending_parent_*`**: Unverified parent contact details pending faculty approval.
*   **`parent_verification_status`**: `unverified` | `verified` | `pending_approval` | `rejected`.
*   **`outing_blocked_until` (String)**: ISO string for automated outing restriction.

### `leave` & `leave_archive` (Leave Tracking)
*   **`$id` (String)**: Unique request ID.
*   **`roll_no` (String)**: Reference to student.
*   **`reason` (String)**: Reason for the leave.
*   **`place_of_visit` (String)**: Destination.
*   **`proposed_exit_date` / `proposed_in_date` (String)**: Requested dates.
*   **`status` (String)**: `pending_caretaker`, `pending_faculty`, `approved`, `rejected_caretaker`, `rejected_faculty`, `expired`.
*   **`caretaker_id` / `faculty_id` (String)**: Approver assignments.
*   **`requires_faculty` (Boolean)**: True if the leave falls on working days.
*   **`caretaker_approval` / `faculty_approval` (Boolean)**: Approval flags.
*   **`exit_date_time` / `in_date_time` (String)**: Actual departure/return timestamps (populated upon kiosk biometric scan).
*   **`mail_sent` (Boolean)**: Tracks whether an email notification was dispatched.
*   **`is_extended` (Boolean)**: Tracks if the leave has been extended.

### `outing` & `outing_archive` (Short Movement)
*   **`$id` (String)**: Unique outing ID.
*   **`roll_no` (String)**: Reference to student.
*   **`out_time` (String)**: ISO string of departure timestamp.
*   **`in_time` (String)**: ISO string of return timestamp (null if still out).

### `coll_caretaker` & `coll_faculty` (Staff Assignments)
*   Used for mapping students to specific staff based on hostel/department criteria.
*   Contains assignment rules and staff contact details.

### `staff_details`
*   Contains comprehensive metadata for staff profiles, used across dashboards and the portal.

### `holidays`
*   Maintains the academic calendar to accurately determine working days vs. weekends/holidays for automated leave routing.

### `facial_embeddings` / `facial_embeddings_new` / `facial_embeddings_edge`
*   Stores high-dimensional floating-point arrays (vectors) generated by Face-API, GhostFaceNet, and EdgeFace respectively. Used for the client-side, offline-first biometric cache.

---

## 💻 Local Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/Ram3ez/hostelSystemWeb.git
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
    NEXT_PUBLIC_DISABLE_REALTIME=true # Set to true for environments without WebSockets
    ```

4.  **Run Development Server**:
    ```bash
    npm run dev
    ```

---

## 📜 License
This project is licensed under the MIT License. Built with ❤️ for NIT Puducherry.
