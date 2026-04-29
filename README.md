# NITPY Hostel Management System — Biometric AI PWA

A premium, touchless biometric hostel management system built for **NIT Puducherry**. This system automates student outings and leave management using on-device AI facial recognition, featuring a robust offline-first architecture and dual-track profile management for students and staff.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Appwrite](https://img.shields.io/badge/Backend-Appwrite-red)
![AI](https://img.shields.io/badge/AI-MediaPipe%20%2B%20FaceAPI-green)

---

## 🚀 Key Features

### 1. Hybrid Biometric AI Engine
*   **Zero-Latency Recognition**: Facial recognition runs entirely on the user's browser/kiosk using **MediaPipe** and **face-api.js**. No images are sent to a server for processing.
*   **Liveness Detection**: Real-time pose estimation and stability checks ensure that only live users (not photos or videos) can check in/out.
*   **Smart Enrollment**: Captures 8+ organic identity angles and generates lighting-augmented embeddings to ensure high accuracy in various conditions.

### 2. Dual-Track Authentication & Profiles
*   **Email Pattern Detection**: Automatically distinguishes between Students and Staff based on institutional email formats.
*   **Role-Based Access (RBAC)**: Integrated with **Appwrite Teams** to gate access to Admin, Faculty, and Caretaker portals.
*   **Mandatory Onboarding**: Prevents system access until profile metadata (Academic info for students, Contact/Location for staff) is completed.

### 3. Advanced PWA & Offline Resilience
*   **Offline Queue**: If the network drops, biometric captures are saved to a local encrypted queue and automatically synced when the connection is restored.
*   **Asset Warming**: Proactively loads AI model weights and facial caches in the background for "instant-on" performance.
*   **Mobile Optimized**: Responsive camera interfaces that switch between **4:3 (Mobile)** and **16:9 (Desktop)** aspect ratios.

---

## 🛠 Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 15 (App Router) |
| **Styling** | Tailwind CSS + Framer Motion |
| **Backend** | Appwrite (Auth, Databases, Teams) |
| **AI/ML** | MediaPipe (Landmarks) + face-api.js (Embeddings) |
| **Icons** | Lucide React |
| **State** | React Context API |

---

## 🏗 System Architecture

### Authentication Flow
1.  **Login**: User logs in via Appwrite Auth.
2.  **Type Detection**: `AuthContext` checks the email pattern.
3.  **Profile Guard**: 
    *   If student email $\rightarrow$ Check `student_details`.
    *   If staff email $\rightarrow$ Check `staff_details`.
4.  **Registration**: If missing, redirect to `/complete-profile`.

### Biometric Workflow
1.  **Warm-up**: Models load into browser memory.
2.  **Stability Detection**: MediaPipe ensures the head is centered and still.
3.  **Descriptor Matching**: `face-api.js` generates a 128-float descriptor and matches it against the local student cache (KD-Tree/Linear Search).
4.  **Sync**: If a match is found, the outing/leave status is updated in Appwrite.

---

## 📊 Database Schema

### `student_details` (Collection)
*   `$id`: Roll Number (e.g., CS23B1001)
*   `name`: String
*   `department`: String
*   `year`: Integer
*   `course`: String
*   `phone_no`: Integer
*   `gender`: String
*   `faceRegistered`: Boolean

### `staff_details` (Collection)
*   `$id`: Email Prefix (lowercase)
*   `name`: String
*   `phone_no`: Integer
*   `location`: String (Building/Room)
*   `email`: String

### `outing` (Collection)
*   `roll_no`: String (Reference)
*   `out_time`: ISO DateTime
*   `in_time`: ISO DateTime (Null if currently out)

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
    NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
    NEXT_PUBLIC_APPWRITE_PROJECT_ID=your_project_id
    ```

4.  **Run Development Server**:
    ```bash
    npm run dev
    ```

---

## 📜 License
This project is licensed under the MIT License. Built with ❤️ for NIT Puducherry.
