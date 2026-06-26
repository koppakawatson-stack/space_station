# Deployment Preparation Tasks

- [x] Modify frontend API fetches to use dynamic URL
  - [x] Add `API_URL` constant in `App.jsx`
  - [x] Update fetch URLs in `App.jsx`
  - [x] Create `frontend/.env.example`
- [x] Prepare backend configuration
  - [x] Make `main.py` CORS origins configurable via environment variables
  - [x] Create `backend/Dockerfile`
- [x] Add deployment documentation
  - [x] Create `DEPLOYMENT.md` in workspace root
- [x] Verify frontend build
  - [x] Run `npm run build` in the `frontend` directory
- [x] Verify backend dependencies and startup
  - [x] Install python dependencies if needed and verify backend startup check
- [x] Manual verification
  - [x] Check local operation and compatibility
