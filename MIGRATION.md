# PickMeUpDaddy — Claude Code Migration Guide

Complete instructions for continuing development in Claude Code (or any local environment).

---

## 1. Project Overview

**에듀-패스 (Edu-Pass / PickMeUpDaddy)** — Family Mobility OS for dual-income Korean parents.  
pnpm monorepo · TypeScript 5.9 · React + Vite frontend · Express 5 backend · PostgreSQL + Drizzle ORM

**Live URL**: https://pickmeupdaddy.replit.app / https://pickmeupdaddy.com

---

## 2. Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 24.x |
| pnpm | 9.x or later |
| PostgreSQL | 14+ (local or cloud) |

```bash
# Install pnpm globally
npm install -g pnpm@latest

# Verify
node --version   # v24.x
pnpm --version   # 9.x
```

---

## 3. Repository Structure

```
pickmeupdaddy/
├── artifacts/
│   ├── api-server/          # Express 5 API (@workspace/api-server)
│   │   ├── src/
│   │   │   ├── index.ts     # Entry point — starts server + scheduler
│   │   │   ├── app.ts       # Express app, middleware, route mounting
│   │   │   ├── routes/      # auth, children, dashboard, family, health,
│   │   │   │                #   location, mobility, notifications, places,
│   │   │   │                #   schedules, search, sos, time-slots
│   │   │   ├── scheduler.ts # Push notification scheduler (1-min interval)
│   │   │   └── lib/         # logger, kakao-geocode, etc.
│   │   ├── build.mjs        # esbuild bundle script → dist/index.mjs
│   │   └── package.json
│   │
│   └── edu-pass/            # React + Vite PWA (@workspace/edu-pass)
│       ├── src/
│       │   ├── App.tsx       # Router + AuthGuard + MobileLayout
│       │   ├── pages/        # login, register, onboarding, dashboard,
│       │   │                 #   planner, child-schedules, children, sos,
│       │   │                 #   settings, map, family, join, terms
│       │   ├── components/   # UI components (shadcn/ui based)
│       │   └── lib/          # auth-context, device-user-context, utils
│       ├── public/           # PWA manifest, sw.js, icons
│       ├── index.html
│       └── vite.config.ts
│
├── lib/
│   ├── db/                  # Drizzle ORM schema + migrations (@workspace/db)
│   │   ├── src/schema/      # users, families, invitations, children,
│   │   │                    #   schedules, mobility, sos-toss, notifications,
│   │   │                    #   locations, aliases
│   │   ├── migrations/      # SQL migration files
│   │   └── drizzle.config.ts
│   │
│   ├── api-spec/            # OpenAPI 3.1 spec + Orval codegen config
│   │   ├── openapi.yaml     # Single source of truth for all API types
│   │   └── orval.config.ts  # Generates api-client-react + api-zod
│   │
│   ├── api-client-react/    # Generated React Query hooks (@workspace/api-client-react)
│   │   └── src/
│   │       ├── generated/   # Auto-generated hooks (do not edit manually)
│   │       ├── custom-fetch.ts  # Fetch with credentials: "include"
│   │       └── index.ts
│   │
│   └── api-zod/             # Generated Zod schemas (@workspace/api-zod)
│       └── src/generated/   # Auto-generated (do not edit manually)
│
├── scripts/
│   └── post-merge.sh        # Runs after git merges: pnpm install + db push
│
├── package.json             # Root — orchestration scripts only
├── pnpm-workspace.yaml      # Workspace + catalog (pinned versions)
├── tsconfig.base.json       # Shared strict TS config
└── tsconfig.json            # Solution file for composite libs
```

---

## 4. Environment Variables

Create a `.env` file at the **project root** (or set these in your environment). The API server reads them at runtime.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string — `postgresql://user:pass@host:5432/dbname` |
| `SESSION_SECRET` | Long random string for express-session cookie signing |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |
| `RESEND_API_KEY` | Resend email API key (family invitation emails) |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |
| `KAKAO_REST_API_KEY` | Kakao REST API key (server-side geocoding) |

### Frontend (Vite)

| Variable | Description |
|----------|-------------|
| `VITE_KAKAO_JS_KEY` | Kakao JavaScript SDK key (map page) |

### Runtime-injected (set by server host / dev scripts)

| Variable | Description |
|----------|-------------|
| `PORT` | Port for each service (API: 8080, frontend: any free port) |
| `BASE_PATH` | URL base path for the Vite frontend (e.g. `/` or `/edu-pass`) |
| `NODE_ENV` | `development` or `production` |

### Optional

| Variable | Description |
|----------|-------------|
| `KAKAO_CLIENT_SECRET` | Kakao OAuth (if Kakao login is enabled) |
| `RESEND_FROM_EMAIL` | Sender email address (defaults to `no-reply@...`) |
| `LOG_LEVEL` | Pino log level (`info`, `debug`, `warn`, `error`) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI key (AI route deviation detection) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI base URL override |
| `VAPID_PUBLIC_KEY` | Same key that is served to the frontend for push subscription |

### Generating VAPID keys

```bash
npx web-push generate-vapid-keys
```

---

## 5. Initial Setup

```bash
# 1. Unzip the project
unzip pickmeupdaddy-export.zip -d pickmeupdaddy
cd pickmeupdaddy

# 2. Install all dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env   # (or create .env manually — see Section 4)
# Edit .env with your values

# 4. Push the database schema
#    (creates all tables; safe to run on an empty DB)
pnpm --filter @workspace/db run push

# 5. Run codegen (only needed if you change openapi.yaml)
pnpm --filter @workspace/api-spec run codegen
```

---

## 6. Running Locally

Open **two terminals**:

### Terminal 1 — API Server (port 8080)

```bash
PORT=8080 BASE_PATH=/api NODE_ENV=development \
  pnpm --filter @workspace/api-server run dev
```

The `dev` script: builds with esbuild → starts `node dist/index.mjs`.

### Terminal 2 — Frontend (port 5173)

```bash
PORT=5173 BASE_PATH=/ NODE_ENV=development \
  pnpm --filter @workspace/edu-pass run dev
```

Open http://localhost:5173 in your browser.

> **Note**: The frontend calls `/api/*` — in development it relies on the browser  
> hitting the same origin. If frontend and API are on different ports, add a Vite proxy:
>
> ```ts
> // vite.config.ts → server section
> server: {
>   proxy: {
>     '/api': 'http://localhost:8080'
>   }
> }
> ```

---

## 7. Key Development Commands

```bash
# Full typecheck (libs first, then artifacts)
pnpm run typecheck

# Build everything
pnpm run build

# Regenerate API client hooks + Zod schemas from openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes to your database
pnpm --filter @workspace/db run push

# Typecheck a single artifact
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/edu-pass run typecheck
```

---

## 8. API Contract Workflow (contract-first)

This project is **contract-first**: all API types flow from `lib/api-spec/openapi.yaml`.

```
openapi.yaml
    │
    ├─→ lib/api-client-react/src/generated/   (React Query hooks)
    └─→ lib/api-zod/src/generated/            (Zod schemas)
         (run: pnpm --filter @workspace/api-spec run codegen)
```

1. Edit `lib/api-spec/openapi.yaml` to add/change an endpoint
2. Run codegen: `pnpm --filter @workspace/api-spec run codegen`
3. Implement the route in `artifacts/api-server/src/routes/`
4. Use the generated hook in the frontend via `@workspace/api-client-react`

**Never edit files inside `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` manually** — they are overwritten by codegen.

---

## 9. Database Schema Summary

All tables are in `lib/db/src/schema/`:

| Table | Description |
|-------|-------------|
| `users` | Auth + profile. `role`: `owner` or `guardian`. `passwordHash` nullable (Google OAuth users). |
| `families` | One family per group of users |
| `invitations` | Email invitations to join a family |
| `children` | Children belonging to a family |
| `places` | Locations per family (school/academy/care/home). Has `lat`/`lng` from Kakao geocoding. |
| `time_slots` | Per-child, per-day schedule entries linked to a place |
| `mobility` | Transport info linked to time_slots |
| `sosToss` / `sos_requests` | Emergency pickup handoff system |
| `push_subscriptions` | Web Push subscription payloads |
| `notification_preferences` | Per-user push notification settings |
| `family_locations` | Real-time GPS positions (one row per user, upserted) |

**Schema changes**: Edit the schema files → run `pnpm --filter @workspace/db run push`.  
**Migrations folder** (`lib/db/migrations/`) contains historical SQL migrations.  
**Startup migrations** are also applied in `artifacts/api-server/src/index.ts` via `runStartupMigrations()` — these apply additive `ALTER TABLE IF NOT EXISTS` statements on every server start (safe to run repeatedly).

---

## 10. Authentication

- **Session-based**: `express-session` with `httpOnly`, `sameSite: lax` cookies
- **Password auth**: `crypto.scrypt` (Node built-in) — no bcrypt dependency needed at runtime
- **Google OAuth 2.0**: `/api/auth/google` → callback → creates/links user
- **Session store**: In-memory by default (restarting the server logs everyone out)
  - For production: swap to `connect-pg-simple` or `connect-redis`
- **Authorization**: Every route verifies `req.session.userId` and checks family membership

### Google OAuth setup

1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Authorized redirect URIs: `https://yourdomain.com/api/auth/google/callback`
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

---

## 11. Web Push Notifications

The push scheduler runs every 60 seconds inside the API server process.

```bash
# Generate VAPID keys once, store permanently
npx web-push generate-vapid-keys
# → Copy VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to your .env
```

The VAPID public key is also served to the frontend at `/api/notifications/vapid-public-key` so the service worker can subscribe. The service worker is at `artifacts/edu-pass/public/sw.js`.

---

## 12. Kakao Integration

| Feature | Key | Where used |
|---------|-----|-----------|
| Map display (JS SDK) | `VITE_KAKAO_JS_KEY` | Frontend — `artifacts/edu-pass/src/pages/map.tsx` |
| Geocoding (REST API) | `KAKAO_REST_API_KEY` | Backend — `artifacts/api-server/src/lib/kakao-geocode.ts` |

Get keys at https://developers.kakao.com → My Application.

---

## 13. Removing Replit-specific Plugins

The Vite config loads three Replit plugins in development only:

```ts
// artifacts/edu-pass/vite.config.ts
// These are guarded by: process.env.REPL_ID !== undefined
// → They won't load outside Replit automatically
import('@replit/vite-plugin-cartographer')
import('@replit/vite-plugin-dev-banner')
import('@replit/vite-plugin-runtime-error-modal')   // always loaded
```

For a clean non-Replit setup, remove these lines from `vite.config.ts`:

```diff
- import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
  ...
  plugins: [
    react(),
    tailwindcss(),
-   runtimeErrorOverlay(),
-   ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
-     ? [
-         await import("@replit/vite-plugin-cartographer").then(...),
-         await import("@replit/vite-plugin-dev-banner").then(...),
-       ]
-     : []),
  ],
```

Also remove from `package.json` devDependencies:
- `@replit/vite-plugin-cartographer`
- `@replit/vite-plugin-dev-banner`
- `@replit/vite-plugin-runtime-error-modal`

And remove from `pnpm-workspace.yaml` catalog.

---

## 14. Routing (URL Path Structure)

The API server serves at `/api/*`.  
The frontend is a SPA served at `/` (or `BASE_PATH`).

In production, configure your reverse proxy (nginx/Caddy) to:

```nginx
location /api/ {
    proxy_pass http://localhost:8080;
}

location / {
    root /path/to/edu-pass/dist/public;
    try_files $uri $uri/ /index.html;
}
```

Or with Caddy:

```
yourdomain.com {
    handle /api/* {
        reverse_proxy localhost:8080
    }
    handle {
        root * /path/to/edu-pass/dist/public
        file_server
        try_files {path} /index.html
    }
}
```

---

## 15. Production Build

```bash
# Build API server → artifacts/api-server/dist/index.mjs
PORT=8080 BASE_PATH=/api NODE_ENV=production \
  pnpm --filter @workspace/api-server run build

# Build frontend → artifacts/edu-pass/dist/public/
PORT=8080 BASE_PATH=/ NODE_ENV=production \
  pnpm --filter @workspace/edu-pass run build

# Start API server in production
PORT=8080 BASE_PATH=/api NODE_ENV=production \
  node --enable-source-maps artifacts/api-server/dist/index.mjs
```

---

## 16. Pending Features (not yet implemented)

- **Task #87**: Kakao address search mode — needs `/search/addresses` endpoint, OpenAPI spec update, `KakaoKeywordSearch` UI address mode

---

## 17. Tech Stack Quick Reference

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS 4, shadcn/ui (Radix UI), TanStack Query v5, Wouter (routing), Framer Motion |
| Backend | Express 5, express-session, Pino (logging), web-push, Resend |
| Database | PostgreSQL, Drizzle ORM, drizzle-zod |
| API contracts | OpenAPI 3.1 (Orval codegen → React Query hooks + Zod schemas) |
| Auth | Session cookies + Google OAuth 2.0 |
| Maps | Kakao Maps JS SDK, Kakao REST API (geocoding) |
| Build | esbuild (API), Vite (frontend) |
| Package manager | pnpm workspaces with catalog |
