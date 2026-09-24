# PDF Parser MERN

React and Express application that converts supported distributor PDF and XLSX reports into a normalized Excel workbook.

## Local development

1. Install Node.js 22 or newer.
2. Copy `.env.example` to `server/.env`.
3. Start MongoDB, or set `EMBEDDED_MONGO=true` for local-only development.
4. Run `npm run install:all`.
5. Run `npm run dev`.

The default development command runs the backend without file watching because embedded MongoDB owns a persistent database directory and rapid restarts can contend for its lock. With an external MongoDB server (`EMBEDDED_MONGO=false`), backend auto-reload is available through `npm run dev:watch --prefix server`.

`npm run dev` starts the backend (`api`) and frontend (`web`) together with `concurrently`. Open `http://localhost:5173`; Vite proxies `/api` to the backend on the `PORT` set in `server/.env` (default 5051), so no origin or URL configuration is needed. In production Express serves the built client from the same origin. Set `CLIENT_ORIGIN` only if the frontend is hosted on a different domain than the API. `VITE_API_PROXY_TARGET` overrides the development proxy target.
When `EMBEDDED_MONGO=true`, MongoDB listens at `mongodb://127.0.0.1:27017/pdf_parser`, which is also the connection URI for MongoDB Compass. The fixed port lets a restarted backend reuse the existing embedded database safely. Keep the backend running while using Compass. If port 27017 is occupied, change `EMBEDDED_MONGO_PORT` and use that same port in Compass. Note that the backend reuses *any* MongoDB already listening on `MONGODB_URI`, so if another project's MongoDB runs on 27017 the app connects to an empty `pdf_parser` database and no distributors appear. The local `server/.env` therefore uses port 27018.

## Production requirements

- Use an external authenticated MongoDB instance. Embedded MongoDB is rejected when `NODE_ENV=production`.
- The landing page and API are public (no login) by default. To require a login, set `AUTH_REQUIRED=true`, `ADMIN_USERNAME`, a strong `ADMIN_PASSWORD`, and a random `SESSION_SECRET` of at least 32 characters.
- Serve the application through HTTPS.
- Persist and back up the MongoDB and `server/saved-files` volumes.
- Replace the in-process rate limiter with a shared store before running multiple application replicas.

Copy `.env.production.example` to a private deployment environment and replace every placeholder. Never commit production secrets.

## Docker

Set `MONGO_USERNAME` and `MONGO_PASSWORD`, then run:

```sh
docker compose up --build -d
```

Terminate containers gracefully with `docker compose down` so the application closes HTTP requests and database connections cleanly.

## Validation

```sh
npm test
npm run build
npm run audit:samples --prefix server -- /path/to/reports /path/to/expected-totals.json
```

The sample audit reports `PARSED` when rows were extracted but no trusted totals were supplied, `VERIFIED` when row count and totals match the expectations file, and `MISMATCH` or `ERROR` on failure. A template is available at `server/sample-expectations.example.json`.

## API

- `GET /api/live` — process liveness
- `GET /api/ready` — database readiness
- `GET /api/health` — parser and catalog status
- `GET /api/auth/status`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/companies`
- `GET /api/distributors`
- `GET /api/history?limit=5`
- `POST /api/parse` — multipart field `pdf_file`, optional `save_file=true`
- `GET /api/files/:id/download`

All catalog, history, download, and parse routes require a valid signed session when authentication is enabled.
