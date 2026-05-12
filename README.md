# NITPY Hostel System — Modern Web Portal

This repository contains the Next.js frontend and Appwrite integration for the NIT Puducherry Hostel Management System. It features a high-performance biometric pipeline, offline-first data synchronization, and a premium institutional design language.

## 🚀 Key Features
- **Biometric Face Recognition**: Multithreaded extraction using Web Workers and ONNX Runtime.
- **Institutional Design**: Glassmorphic UI with Framer Motion animations.
- **Offline Resiliency**: Background sync and IndexedDB local caching.
- **Audit Logging**: Robust system transaction tracking.

## 📖 Documentation
- **Deployment**: Managed via **Docker Compose** and **GitHub Actions (GHCR)**. See [MAINTENANCE.md](./MAINTENANCE.md) for server setup.
- **Architecture**: See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for the module breakdown.
- **Developer Guide**: See [DEVELOPERS.md](./DEVELOPERS.md) for UI patterns, RBAC, and API usage.

---

## 🏗️ Production Tech Stack
- **Framework**: Next.js 15+ (App Router)
- **State**: React Context + Custom Hooks
- **Database**: Appwrite TablesDB
- **Infrastructure**: Docker, GitHub Container Registry (GHCR), Watchtower

## 🛠️ Maintenance Notes
- **Appwrite Schema**: Mapped in `src/lib/constants.ts`.
- **TypeScript Models**: Centralized in `src/types/models.ts`.
- **Environment**: All secrets are managed via GitHub Repository Secrets and `.env.production` on the server.

---

_Designed and Developed for NIT Puducherry._
