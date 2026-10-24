# Deploying KhetiSense on Railway (Step-by-Step)

This guide walks you through deploying KhetiSense to [Railway.app](https://railway.app) smoothly.

---

## 1. Why Did "failed to fetch snapshot" Happen?

If you saw:
```text
All aboard, next stop: builder v4
failed to fetch snapshot
```
This error occurs **before** any code, Dockerfile, or Node.js commands run. It means Railway's builder attempted to fetch the Git repository tarball from GitHub and timed out or was rejected by GitHub.

### Quick Fixes for "failed to fetch snapshot":
1. **Click "Redeploy"**: In your Railway Dashboard under the **Deployments** tab, click **Redeploy** on the latest commit. This forces Railway to assign a fresh builder runner.
2. **Refresh GitHub Permissions**: If your repository was recently created or pushed, ensure the **Railway GitHub App** has access to `glalit52/khetsense-new`:
   - Go to GitHub → **Settings** → **Applications** → **Railway App** → **Repository Access** → Select `glalit52/khetsense-new`.
3. **Reconnect in Railway**: In Railway service settings, click **Disconnect** and reconnect `glalit52/khetsense-new`.

---

## 2. Seamless 1-Click Deployment Setup

The repository now contains a native [railway.json](./railway.json) configuration:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "node server.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

Railway will automatically detect this configuration, build using the optimized [Dockerfile](./Dockerfile) (with no illegal `VOLUME` directives), and monitor the application via `/health`.

---

## 3. Recommended Railway Settings

### A. Environment Variables
In your Railway Service → **Variables** tab, add:
| Variable | Value | Notes |
|---|---|---|
| `PORT` | `3000` | (Railway will automatically route to this port) |
| `NODE_ENV` | `production` | Enables production optimizations |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Optional: Enables AI chat, crop scan, and brief |
| `DATA_GOV_IN_API_KEY` | `...` | Optional: Personal key for 1000+ mandi records |
| `ALERT_INTERVAL_MIN` | `60` | Background alert check interval |

### B. Persistent Volume (Subscriptions & Price History)
To preserve farmer alerts and accumulated price trends across redeploys:
1. Open your project on Railway.
2. Click **+ New** → **Volume** (or Service Settings → **Volumes**).
3. Set **Mount Path** to:
   ```text
   /app/data
   ```
4. Attach the volume to your `khetisense` service.

---

## 4. Alternative: Deploy via Railway CLI in 10 Seconds

If you want to bypass GitHub webhook snapshotting entirely:

```bash
# 1. Install Railway CLI
brew install railway

# 2. Login
railway login

# 3. Link your project
railway link

# 4. Deploy directly from local directory
railway up
```
This directly uploads your source code and triggers the build immediately.
