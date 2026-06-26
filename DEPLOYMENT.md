# Deployment Guide: OrbitalGuard AI

This guide explains how to deploy the **OrbitalGuard AI - Space Traffic Management** frontend and backend to separate cloud platforms.

---

## 🚀 Backend Deployment (Python/FastAPI)

The backend is a FastAPI application that runs on Python 3.11. The easiest hosting options are **Render**, **Railway**, or **Fly.io**.

### Option A: Render (Web Service)
1. Sign in to [Render](https://render.com).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository.
4. Configure the service settings:
   - **Name**: `orbitalguard-backend`
   - **Language**: `Docker` (Render will automatically detect the `backend/Dockerfile`)
   - **Root Directory**: `backend` (Ensure Render points to the `backend` folder where the `Dockerfile` is located)
5. Select the **Free** instance type.
6. Add the following **Environment Variables** (under the "Env Vars" tab):
   - `ALLOWED_ORIGINS`: Set this to your deployed frontend URL (e.g., `https://orbitalguard.vercel.app`) to enable CORS protection.
7. Click **Create Web Service**. Render will build and deploy the container.

### Option B: Railway
1. Sign in to [Railway](https://railway.app).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Choose your repository.
4. In the service settings, set:
   - **Root Directory**: `/backend`
5. Add the **Variables**:
   - `ALLOWED_ORIGINS`: `https://your-frontend-url.vercel.app`
6. Railway will automatically build the `Dockerfile` and deploy the service.

---

## 🎨 Frontend Deployment (React/Vite)

The frontend is a static React application built with Vite. It can be hosted for free on **Vercel** or **Netlify**.

### Option A: Vercel
1. Sign in to [Vercel](https://vercel.com).
2. Click **Add New** -> **Project**.
3. Import your GitHub repository.
4. Configure the project:
   - **Framework Preset**: `Vite` (automatically detected)
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Expand the **Environment Variables** section and add:
   - **Key**: `VITE_API_URL`
   - **Value**: The URL of your deployed backend (e.g., `https://orbitalguard-backend.onrender.com`)
6. Click **Deploy**. Vercel will build and serve your static application.

### Option B: Netlify
1. Sign in to [Netlify](https://netlify.com).
2. Click **Add new site** -> **Import an existing project**.
3. Connect to GitHub and select the repository.
4. Set the site settings:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/dist`
5. Go to **Site Configuration** -> **Environment variables** and add:
   - `VITE_API_URL`: Your deployed backend URL (e.g., `https://orbitalguard-backend.onrender.com`).
6. Trigger a deploy.

---

## 🔒 Security Best Practices

1. **Restrict CORS**: Always set the `ALLOWED_ORIGINS` environment variable on the backend to your exact frontend domain. Avoid leaving it at `*` in production.
2. **HTTPS**: Both Vercel/Netlify and Render/Railway enforce HTTPS by default. Make sure your `VITE_API_URL` uses `https://` and not `http://`.
