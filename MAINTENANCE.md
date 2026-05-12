# Server Maintenance & Deployment Guide

This guide provides step-by-step instructions for managing the Appwrite backend (Docker) and the Next.js frontend on the production server.

---

## 🏗 Appwrite Backend (Docker)

The Appwrite instance runs inside its own Docker containers.

### 🛡 Backup & Restore

> [!CAUTION]
> Always maintain a copy of your `.env` and `docker-compose.yml` files. These contain critical server configurations and encryption keys. Losing these may result in permanent data loss. **Note**: These files are automatically copied to the `backup` folder when running `backup.sh`.

#### **Creating a Backup**

1. Ensure `backup.sh` is placed inside the `appwrite` folder.
2. Execute the script: `./backup.sh`
3. Compress the resulting `backup` folder: `tar -cvzf backup.tar.gz ./backup/`

---

## 🚀 Primary Deployment: Docker Compose (Recommended)

The frontend is deployed using a modern containerized approach with automatic updates via Watchtower.

### 🏁 Initial Server Setup (One-Time)

To pull the private image from the GitHub Container Registry (GHCR), you must authorize your server using a **GitHub Personal Access Token (PAT)**.

1. **Generate a PAT (Classic)** on GitHub with `read:packages` scope.
2. **Login to GHCR** on your production server:
   ```bash
   docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
   ```
3. **Configure Docker Config**: Ensure your `~/.docker/config.json` is accessible (Watchtower needs this to check for updates).

### 🛠 Deployment with Docker Compose

Create a `docker-compose.yml` file in your production directory:

```yaml
services:
  nextjs:
    image: ghcr.io/ram3ez/hostelsystemweb:latest
    container_name: nextjs-prod
    restart: always
    environment:
      - HOSTNAME=0.0.0.0
    ports:
      - "3000:3000"
    env_file:
      - .env.production
    labels:
      - "com.centurylinklabs.watchtower.enable=true"

  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    restart: always
    environment:
      - DOCKER_API_VERSION=1.40
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /home/student/.docker/config.json:/config.json:ro
    command: --interval 300 --cleanup --label-enable
```

### 🔄 Automated Updates (Watchtower)

- **Triggering a Deploy**: Simply push your changes to the `main` branch. GitHub Actions will build the image and push it to GHCR. Watchtower will detect the change and restart the container automatically.
- **Manual Force Pull**:
  ```bash
  docker compose pull && docker compose up -d
  ```

---

## 💾 Legacy Deployment: PM2 (Fallback)

Use these steps if the Docker/containerized deployment is unavailable.

### 🏁 PM2 Initial Setup

```bash
PORT=3000 pm2 start .next/standalone/server.js --name "hostelSystem"
pm2 save
```

### 🛠 Manual Update Workflow

1. **Build the project**: `npm run build`
2. **Sync Assets**: `./scripts/moveScript.sh` (copies public/static to standalone)
3. **Reload Server**: `pm2 reload hostelSystem`

---

## 📂 Logs & Environment

- **Secrets**: All server-side secrets (`APPWRITE_API_KEY`, `INTERNAL_APPWRITE_ENDPOINT`) must be placed in the `.env.production` file on the server.
- **Logs**:
  - Docker Logs: `docker logs -f nextjs-prod`
  - PM2 Logs: `pm2 logs hostelSystem`
  - Update Logs: `docker logs -f watchtower`

---

_Created and Maintained for NIT Puducherry._
