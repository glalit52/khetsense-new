# KhetiSense — Production Deployment Guide & Documentation

This guide provides end-to-end instructions for deploying KhetiSense to production across various cloud platforms and infrastructure providers.

---

## 1. Architectural Overview

- **Runtime**: Node.js 22 LTS (ES Modules: `"type": "module"`).
- **Backend**: Express 5.x API with SSE streaming (`/api/chat`).
- **Frontend**: Lightweight vanilla HTML5/CSS3/ES6 static files served from `/public`.
- **Background Watcher**: In-process alert watcher (`startWatcher()`) running every `ALERT_INTERVAL_MIN` minutes.
- **State & Data Persistence**:
  - `data/subscriptions.json`: Farmer alert subscriptions and notification history.
  - `data/price-history.jsonl`: Mandi modal price records accumulated over time.
  - **Important**: Any containerized or serverless deployment must mount a persistent volume to `/app/data` to retain this data across redeploys.

---

## 2. Platform Comparison: Where to Deploy?

| Platform | Best For | Persistent Storage | India Regions | Pricing / Tier | Complexity |
|---|---|---|---|---|---|
| **Render.com** *(Top Pick)* | Fast git-push deploy, small to medium scale | Persistent Disk (1 GB) | Singapore (`singapore`) | Free tier / Starter ($7/mo) | ⭐ Easy |
| **Railway.app** | Git push deploy, automatic containerization | Volume Mounts | Global | Usage-based ($5 free credit) | ⭐ Easy |
| **Fly.io** | Edge latency, low operational overhead | Fly Volumes | Mumbai (`bom`), Delhi (`del`) | Free allowance / Usage | ⭐⭐ Moderate |
| **Google Cloud Run** | High concurrency, enterprise, pay-per-request | Cloud Storage / NFS or stateless | Mumbai (`asia-south1`), Delhi (`asia-south2`) | Generous free tier | ⭐⭐ Moderate |
| **AWS App Runner** | AWS ecosystem, containerized microservice | AWS EFS mount | Mumbai (`ap-south-1`) | Pay per vCPU/GB-hour | ⭐⭐ Moderate |
| **Linux VPS (Ubuntu)** | Total control, fixed monthly cost ($4–$6/mo) | Local SSD | All cloud providers | $4–$6/month flat | ⭐⭐⭐ Advanced |

---

## 3. Environment Variables Reference

Configure these environment variables in your deployment dashboard or `.env` file:

| Variable | Required | Default | Description | Where to Obtain |
|---|---|---|---|---|
| `PORT` | Optional | `3000` | Port for the HTTP server to listen on | Auto-assigned by most PaaS hosts |
| `HOST` | Optional | `0.0.0.0` | Host interface binding (`0.0.0.0` required in containers) | Auto-configured |
| `NODE_ENV` | Optional | `production` | Set to `production` for production optimizations | Set to `production` |
| `ANTHROPIC_API_KEY` | Optional | *None* | Enables Claude Opus 5.5 AI chat, image crop scan, and farm brief | [console.anthropic.com](https://console.anthropic.com) |
| `DATA_GOV_IN_API_KEY` | Optional | *Built-in sample key* | Full access to Agmarknet daily mandi records (sample is capped at 10 items) | Free at [data.gov.in](https://data.gov.in) |
| `NASA_FIRMS_MAP_KEY` | Optional | *None* | Enables crop-residue fire detection within 55 km | Free at [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/api/map_key/) |
| `TELEGRAM_BOT_TOKEN` | Optional | *None* | Enables push notifications to farmers via Telegram bot | Via [@BotFather](https://t.me/BotFather) on Telegram |
| `TWILIO_ACCOUNT_SID` | Optional | *None* | Twilio Account SID for SMS and WhatsApp push alerts | [twilio.com/console](https://www.twilio.com/console) |
| `TWILIO_AUTH_TOKEN` | Optional | *None* | Twilio Auth Token | [twilio.com/console](https://www.twilio.com/console) |
| `TWILIO_FROM` | Optional | *None* | Twilio phone number for SMS alerts (e.g., `+1234567890`) | Twilio Console |
| `TWILIO_WHATSAPP_FROM` | Optional | *None* | Twilio WhatsApp sender number | Twilio WhatsApp Sandbox |
| `ALERT_WEBHOOK_URL` | Optional | *None* | Webhook URL for IVR / Slack / n8n / custom alerts | Custom endpoint |
| `ALERT_INTERVAL_MIN` | Optional | `60` | Background watcher frequency in minutes | Integer (e.g. `30`, `60`) |

---

## 4. Option 1: Deploy on Render (Recommended & Easiest)

Render is the simplest platform to deploy KhetiSense with persistent disk storage and free automated SSL.

### Step 1: Push Repository to GitHub or GitLab
Ensure your project is committed to a GitHub repository.

### Step 2: Create Web Service via Blueprint (Automatic)
The project includes a pre-configured `render.yaml` file:
1. Log in to [Render.com](https://render.com).
2. Click **New +** → **Blueprint**.
3. Connect your GitHub repository.
4. Render will detect `render.yaml` and configure:
   - Build command: `npm ci --omit=dev`
   - Start command: `node server.js`
   - Health check path: `/health`
   - Disk: 1 GB mounted at `/data`
5. Fill in your environment variables (`ANTHROPIC_API_KEY`, etc.) in the Render dashboard.
6. Click **Apply**.

### Step 3: Manual Web Service Setup (Alternative)
If not using Blueprints:
1. Click **New +** → **Web Service**.
2. Select your repository.
3. Configure settings:
   - **Environment**: `Node`
   - **Build Command**: `npm ci --omit=dev`
   - **Start Command**: `node server.js`
   - **Plan**: Starter or higher (required for persistent disks)
4. Under **Advanced**:
   - Add **Disks**: Mount path `/data`, Size: `1 GB`.
   - Add **Health Check Path**: `/health`.
   - Add your environment variables under **Environment Variables**.
5. Click **Create Web Service**.

---

## 5. Option 2: Deploy on Fly.io (Low-Latency Indian Edge)

Fly.io allows running KhetiSense directly inside Indian data centers (Mumbai or Delhi).

### Step 1: Install Fly CLI & Authenticate
```bash
# macOS
brew install flyctl

# Linux / Windows WSL
curl -L https://fly.io/install.sh | sh

fly auth login
```

### Step 2: Initialize & Launch
From the `khetisense` root directory:
```bash
# Launch app using existing fly.toml
fly launch --no-deploy
```

### Step 3: Create Persistent Storage Volume
```bash
fly volumes create khetisense_data --region bom --size 1
```

### Step 4: Set Environment Secrets
```bash
fly secrets set ANTHROPIC_API_KEY="sk-ant-..." \
  DATA_GOV_IN_API_KEY="..." \
  TELEGRAM_BOT_TOKEN="..."
```

### Step 5: Deploy
```bash
fly deploy
```

Verify deployment:
```bash
fly status
fly logs
```

---

## 6. Option 3: Deploy on Railway

1. Sign up at [Railway.app](https://railway.app).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select the `khetisense` repository.
4. Railway will automatically detect Node.js or Dockerfile.
5. In **Service Settings**:
   - Go to **Volumes** → Click **Add Volume** → Set Mount Path to `/app/data`.
   - Go to **Variables** → Add `PORT=3000`, `NODE_ENV=production`, and any API keys.
6. Generate a domain under **Networking** (e.g. `khetisense.up.railway.app`).

---

## 7. Option 4: Deploy on Ubuntu VPS (EC2 / DigitalOcean / Hetzner)

For production deployment on an Ubuntu 22.04 or 24.04 LTS server with PM2 and Nginx.

### Step 1: Server Preparation
SSH into your server:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw build-essential nginx certbot python3-certbot-nginx
```

### Step 2: Install Node.js 22 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v # Should display v22.x.x
npm -v
```

### Step 3: Install PM2 Globally
```bash
sudo npm install -g pm2
```

### Step 4: Clone & Setup KhetiSense
```bash
# Create application directory
sudo mkdir -p /var/www/khetisense
sudo chown -R $USER:$USER /var/www/khetisense

# Clone code into the directory
git clone <YOUR_GIT_REPO_URL> /var/www/khetisense
cd /var/www/khetisense

# Install production dependencies
npm ci --omit=dev

# Create production .env
cp .env.example .env
nano .env # Enter your API keys and configuration
```

### Step 5: Start Service with PM2
```bash
# Start with pre-configured ecosystem file
pm2 start ecosystem.config.cjs

# Save PM2 process list and configure auto-start on server reboot
pm2 save
pm2 startup # Run the generated command output by this step
```

### Step 6: Configure Nginx Reverse Proxy
Create `/etc/nginx/sites-available/khetisense`:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # File size limit for image scan uploads
    client_max_body_size 15M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket & SSE streaming support (required for /api/chat)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # SSE Buffering Disabled
        proxy_buffering off;
        proxy_read_timeout 300s;

        # Client IP Forwarding
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/khetisense /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 7: Enable SSL Certificate (Let's Encrypt)
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### Step 8: Configure Firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 8. Option 5: Self-Hosted Docker / Docker Compose

To deploy with Docker Compose on any server with Docker installed:

```bash
# 1. Clone repository
git clone <YOUR_GIT_REPO_URL>
cd khetisense

# 2. Configure .env
cp .env.example .env
# Edit .env with your keys

# 3. Start container in background
docker compose up -d --build

# 4. Check status and logs
docker compose ps
docker compose logs -f
```

The container automatically maps `./data` on your host machine to `/app/data` in the container, guaranteeing data persistence.

---

## 9. Verification & Smoke Testing Checklist

After deploying, run these commands to verify end-to-end functionality:

### 1. Health Endpoint Check
```bash
curl -s https://yourdomain.com/health | jq .
```
Expected output:
```json
{
  "status": "ok",
  "uptime": 12,
  "timestamp": "2026-10-23T...",
  "ai": true,
  "channels": { ... }
}
```

### 2. Configuration & Keys Check
```bash
curl -s https://yourdomain.com/api/config | jq .
```
Verify that `ai`, `mandi_key`, and `firms_key` accurately reflect your configured environment variables.

### 3. Farm Snapshot API Test (Punjab Wheat farm)
```bash
curl -s "https://yourdomain.com/api/snapshot?lat=30.9010&lon=75.8573&crop=wheat" | jq .location
```
Expected output: Returns parsed location, Open-Meteo weather data, SoilGrids, and rule engine alerts.

### 4. Mandi Price API Test
```bash
curl -s "https://yourdomain.com/api/mandi?crop=wheat&state=Punjab" | jq .summary
```
Expected output: Returns market arrivals, average modal price, best market, and MSP comparison.

### 5. AI Chat Test (Server-Sent Events)
```bash
curl -N -X POST https://yourdomain.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{"text":"Namaste, can I sow wheat today?"}'
```
Expected output: Stream of SSE events (`event: text`, `data: ...`).

---

## 10. Backup & Maintenance

### Backing Up Data Files
KhetiSense stores user subscriptions and accumulated market history in the `data/` folder:
```bash
# Archive data folder
tar -czvf khetisense-data-backup-$(date +%Y%m%d).tar.gz data/
```

### Updating to Latest Code
```bash
# On VPS with PM2:
cd /var/www/khetisense
git pull
npm ci --omit=dev
pm2 reload khetisense

# On Docker Compose:
docker compose pull
docker compose up -d --build
```
