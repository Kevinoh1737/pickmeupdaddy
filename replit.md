# Workspace

## Overview

에듀-패스 (Edu-Pass) — Family Mobility OS for dual-income parents managing children's school/academy schedules, pickup responsibilities, and commute logistics. pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (mobile-first, teal/blue-green palette)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: Session-based (express-session, Node.js crypto scrypt) + Google OAuth 2.0
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Architecture

### Frontend (artifacts/edu-pass)
- React + Vite app at root path `/`
- Pages: Login, Register, Onboarding (3-step new user flow), Dashboard, 7-day Planner, Children CRUD, Child Schedules (Weekly Timetable), Family (Place Management + Children + Members), SOS Toss, Settings, Map (실시간 가족 위치)
- Auth via AuthContext wrapping `useGetMe` hook
- All API calls use generated hooks from `@workspace/api-client-react` with `credentials: "include"` for session cookies
- Mobile-first layout with bottom navigation (Dashboard, Planner, Map, Family, SOS)
- Calming teal/ocean blue palette (primary: HSL 175 70% 35%)
- Kakao Maps JS SDK loaded dynamically in map page (key from VITE_KAKAO_JS_KEY env var)
- GPS tracking via browser geolocation API → sends to PUT /api/location, auto-refresh every 15s

### Backend (artifacts/api-server)
- Express 5 API at port 8080, mounted at `/api`
- Session-based auth with `express-session` (sameSite: lax, httpOnly)
- Routes: auth, children, places (per family - GET/POST /family/places, PATCH/DELETE /places/:id), time-slots (per child, CRUD including PUT update), family/invites, dashboard (today/weekly/warnings/leave-at/stats), mobility, sos-toss, notifications (push subscribe/unsubscribe, preferences), location (PUT /location, GET /family/locations with 12h staleness filter, DELETE /location/child/:childId)
- Push notification scheduler: 1-minute interval, sends web push alerts N minutes before pickup endTime or shuttle arrival time based on user preferences
- Authorization: all endpoints verify user belongs to the family that owns the resource
- Kakao Geocoding: places creation/update auto-geocodes address via Kakao REST API (KAKAO_REST_API_KEY)

### Database Schema (lib/db)
- Tables: users, families, invitations, children, places, time_slots, mobility, sosToss, sos_requests, push_subscriptions, notification_preferences, family_locations
- Users: passwordHash is nullable (Google OAuth users have no password), googleId (unique, nullable), avatarUrl (nullable)
- Places: registered locations (school/academy/care) per **family** (familyId FK → families table) with name, address; lat/lng for geocoded coordinates; migrated from per-child to per-family in task-25
- TimeSlots: per-child, per-day schedule entries linked to a place, with dayOfWeek (0-6), startTime, endTime, guardian assignments, parentAccompany (boolean for school entries)
- Mobility: linked to time_slots (was previously linked to schedules)
- FamilyLocations: one row per user (upsert), stores lat/lng/accuracy/updatedAt for real-time location sharing

### Shared Libraries
- `lib/api-spec`: OpenAPI 3.1 spec + Orval codegen
- `lib/api-client-react`: Generated React Query hooks + custom fetch with credentials
- `lib/api-zod`: Generated Zod schemas for request/response validation
- `lib/db`: Drizzle ORM schema + migrations

## Key Features
1. **Smart Planner**: 7-day timeline with day-of-week schedule filtering
2. **Overlap/Gap Detector**: Warns when schedules overlap or have < 15min gaps
3. **LeaveAt Alerts**: GPS-based departure time calculation (server-side only for privacy)
4. **SOS Toss**: Emergency pickup transfer to another family guardian (bulk) + individual SOS request/approve system per time slot
5. **Dashboard**: Today's pickups, stats cards, warnings, schedule timeline
6. **Place Edit**: PATCH /places/{id} to update place name, address, phone, type
7. **Bulk Delete**: DELETE /time-slots/{id}?deleteAll=true deletes all slots for same child+place
8. **School Automation**: School slots auto-set start time to 08:20 (fixed), academy slots require school slot on same day, parentAccompany toggle for school slots
9. **Web Push Notifications**: Browser push alerts for pickup/shuttle times, configurable N-minute advance warning (5-60min, 5min intervals), settings page toggle + dropdown, service worker for background delivery
10. **실시간 가족 위치 지도**: Kakao Maps JS SDK, GPS watchPosition → PUT /api/location (upsert), GET /api/family/locations every 15s, custom color markers per member, fit-bounds, "내 위치로" center button
11. **장소 주소 좌표 변환**: Places creation/update auto-geocodes via Kakao REST API → stores lat/lng in places table
