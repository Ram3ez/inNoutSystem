# Server Maintenance & Deployment Guide

This guide provides step-by-step instructions for managing the Appwrite backend (Docker) and the Next.js frontend (PM2) on the production server.

---

## 🏗 Appwrite Backend (Docker)

The Appwrite instance runs inside Docker containers. The `appwrite` folder on the server contains the configuration and data.

### 🛡 Backup & Restore

> [!CAUTION]
> Always maintain a copy of your `.env` and `docker-compose.yml` files. These contain critical server configurations and encryption keys. Losing these may result in permanent data loss. **Note**: These files are automatically copied to the `backup` folder when running `backup.sh`.

#### **Creating a Backup**
1. Ensure `backup.sh` is placed inside the `appwrite` folder on the server.
2. Execute the script:
   ```bash
   ./backup.sh
   ```
   This will generate a `backup` folder.
3. Compress the backup for off-site storage:
   ```bash
   tar -cvzf backup.tar.gz ./backup/
   ```

#### **Restoring from Backup**
1. Extract the backup archive:
   ```bash
   tar -xvzf backup.tar.gz
   ```
2. Ensure `restore.sh` is placed inside the `appwrite` folder (**not** inside the extracted `backup` folder).
3. Run the restore script:
   ```bash
   ./restore.sh
   ```
4. Restart the Appwrite containers:
   ```bash
   docker compose up -d
   ```

### 🔄 Lifecycle Commands
*   **Start/Restart**: `docker compose up -d`
*   **Stop**: `docker compose down`

> [!NOTE]
> All external port mappings and network configurations for the Appwrite services are defined within the `docker-compose.yml` file.

---

## 🚀 Next.js Frontend (PM2)

The Next.js application is deployed as a standalone server managed by PM2 for high availability.

### 🏁 Initial Setup
To start the server for the first time and save the process list:
```bash
PORT=3000 pm2 start .next/standalone/server.js --name "hostelSystem"
pm2 save
```

### 🛠 Post-Build Deployment Workflow
Every time you make code changes and rebuild the application, follow this sequence:

1. **Build the project**:
   ```bash
   npm run build
   ```
2. **Sync Assets**:
   Run the `moveScript.sh` (located in the repo root) to copy the `public` and `static` folders to the standalone directory:
   ```bash
   ./moveScript.sh
   ```
3. **Reload the Server**:
   ```bash
   pm2 reload hostelSystem
   ```

### 📋 PM2 Management
*   **Status**: `pm2 status`
*   **Restart**: `pm2 restart hostelSystem`

---

## 📂 Logs & Persistence

Audit logs are stored in the **repository root** (outside the `.next` directory). This ensures that running `npm run build` does not delete your historical log data.

*   **Audit Log Path**: `./logs/audit.log`
*   **Console Logs**: Viewable via `pm2 logs hostelSystem`
