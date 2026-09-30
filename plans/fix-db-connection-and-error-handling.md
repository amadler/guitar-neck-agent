# Plan: Fix Database Connection & Error Handling Audit

## Overview

The app crashes with `ECONNREFUSED` on every database operation because PostgreSQL is not accessible. Beyond this immediate blocker, the codebase has several error-handling gaps and missing validations that need attention.

---

## 🔴 Tier 1 — Blocker (must fix first)

### 1. PostgreSQL not running (ECONNREFUSED) + Unified startup

**Root cause:** The app is running outside Docker (`tsx watch --env-file .env src/index.ts`) but tries to connect to `localhost:5432`. PostgreSQL only runs inside Docker via `docker-compose.yml`.

**Problem:** The README doesn't mention PostgreSQL at all — no prerequisites, no setup instructions. There's no single unified way to start the app.

**Solution — unified approach:**
- Always use Docker for PostgreSQL, even in local dev
- Document the two-terminal workflow:
  ```bash
  # Terminal 1: Start PostgreSQL
  docker compose up -d postgres

  # Terminal 2: Run app with hot-reload
  npm run dev
  ```
- The `.env` file should set `DATABASE_URL=postgres://guitarneck:guitarneck@localhost:5432/guitarneck`
- Production uses full `docker compose up` (postgres + caddy + backend)

**Files:** [`README.md`](README.md), [`docker-compose.yml`](docker-compose.yml), [`src/db/client.ts`](src/db/client.ts:5)

---

## 🟠 Tier 2 — Crash-level bugs (will crash without DB)

### 2. Chat route thread validation NOT wrapped in try-catch

**Location:** [`src/routes/chat.ts:38-55`](src/routes/chat.ts:38)

**Problem:** The thread validation block (SELECT/INSERT) runs **outside** the try-catch. If DB is down, this throws an unhandled promise rejection → the request hangs with no response sent.

**Fix:** Wrap lines 38-55 in a try-catch that returns a 503 JSON error.

### 3. Session save failure leaves partial state in register

**Location:** [`src/auth/routes.ts:37-45`](src/auth/routes.ts:37)

**Problem:** User is INSERTed into DB first, then `req.session.save()` is called. If session save fails, the user exists in DB but cannot log in (no session). No cleanup/rollback.

**Fix:** Delete the just-created user if session save fails, or restructure to create session first then user.

### 4. Database client has no connection resilience

**Location:** [`src/db/client.ts:7`](src/db/client.ts:7)

**Problem:** Single `postgres()` client created at module load with no retry, no pool config, no connection timeout. If DB is temporarily unavailable at startup, the entire app fails to load.

**Fix:** Add connection retry logic, connection timeout, and a health-check wrapper.

---

## 🟡 Tier 3 — Validation gaps (will cause confusing errors)

### 5. No email format validation in register/login

**Location:** [`src/auth/routes.ts:12-22`](src/auth/routes.ts:12), [`src/auth/routes.ts:55-61`](src/auth/routes.ts:55)

**Problem:** Any string is accepted as email. `"not-an-email"` passes validation and gets stored in DB.

**Fix:** Add a simple email regex or use `zod` (already in dependencies) to validate email format.

### 6. Progress PUT endpoint has no body validation

**Location:** [`src/progress/routes.ts:72-89`](src/progress/routes.ts:72)

**Problem:** `startedAt` / `completedAt` are passed through `new Date()` with no validation. Invalid input produces `Invalid Date` which gets stored in DB.

**Fix:** Validate date strings before passing to `new Date()`, or use zod schema.

### 7. Unsafe type assertion in exercises.ts getTotalCorrect

**Location:** [`src/progress/exercises.ts:46`](src/progress/exercises.ts:46)

**Problem:** `r.result as { correct?: boolean; correctCount?: number }` — JSONB data can have any shape. If stored data doesn't match, this silently returns wrong counts.

**Fix:** Use runtime validation (zod or manual check) instead of type assertion.

---

## 🟢 Tier 4 — Hardening (defense-in-depth)

### 8. Add rate limiting to auth endpoints

**Location:** [`src/auth/routes.ts`](src/auth/routes.ts)

**Problem:** No protection against brute-force login attempts or registration spam.

**Fix:** Add `express-rate-limit` middleware to `/api/auth/*` routes.

### 9. Add request body size limits

**Location:** [`src/index.ts:26`](src/index.ts:26)

**Problem:** `express.json()` has no size limit — a malicious client could send a huge payload.

**Fix:** Add `express.json({ limit: '1mb' })`.

### 10. Add global error handler middleware

**Location:** [`src/index.ts`](src/index.ts)

**Problem:** If any route throws outside its try-catch (e.g., the chat route issue above), Express returns a raw HTML 500 with stack trace.

**Fix:** Add a global Express error handler that returns `{ error: "Internal server error" }` as JSON.

### 11. Session secret default is insecure

**Location:** [`src/auth/middleware.ts:18`](src/auth/middleware.ts:18)

**Problem:** Fallback `"change-me-in-production"` is hardcoded. If `.env` is missing, sessions are signed with a known key.

**Fix:** Warn on startup if `SESSION_SECRET` is not set, or throw an error in production.

---

## Implementation Order

| Priority | Task | File(s) | Effort |
|----------|------|---------|--------|
| P0 | Update README with PostgreSQL + unified startup | `README.md` | small |
| P0 | Wrap chat thread validation in try-catch | `src/routes/chat.ts` | small |
| P0 | Add DB connection retry | `src/db/client.ts` | small |
| P1 | Add email format validation | `src/auth/routes.ts` | small |
| P1 | Handle session save failure | `src/auth/routes.ts` | small |
| P1 | Validate progress PUT body | `src/progress/routes.ts` | small |
| P1 | Fix unsafe type assertion | `src/progress/exercises.ts` | small |
| P2 | Add rate limiting | `src/auth/routes.ts` | medium |
| P2 | Add body size limit | `src/index.ts` | tiny |
| P2 | Add global error handler | `src/index.ts` | small |
| P2 | Warn on missing SESSION_SECRET | `src/auth/middleware.ts` | tiny |

---

## Architecture Diagram: Current Error Flow

```mermaid
flowchart TD
    Client["Client App"] -->|POST /api/auth/register| Auth["auth/routes.ts"]
    Auth -->|db.select| DB[(PostgreSQL)]
    Auth -->|db.insert| DB
    Auth -->|session.save| Session["Session Store<br/>connect-pg-simple"]
    
    DB -.->|ECONNREFUSED| Error["❌ Crash<br/>Unhandled error<br/>Returns 500"]
    Session -.->|ECONNREFUSED| Error2["❌ Partial state<br/>User created but<br/>no session"]
    
    Client -->|POST /api/chat| Chat["routes/chat.ts"]
    Chat -->|thread validation| DB
    DB -.->|ECONNREFUSED| Error3["❌ Unhandled rejection<br/>No response sent<br/>Request hangs"]
```

## Architecture Diagram: Fixed Error Flow

```mermaid
flowchart TD
    Client["Client App"] -->|Request| Global["Global Error Handler<br/>src/index.ts"]
    Global --> Rate["Rate Limiter<br/>express-rate-limit"]
    Rate --> Body["Body Size Limit<br/>1mb"]
    Body --> Route["Route Handler"]
    
    Route --> DB[(PostgreSQL)]
    DB -.->|ECONNREFUSED| Retry["DB Retry Logic<br/>src/db/client.ts"]
    Retry -->|Still failing| Health["Health Check<br/>GET /api/health"]
    Health -->|503| Client
    
    Route -->|try-catch| Error["JSON Error Response"]
    Error --> Client
    
    subgraph "Auth Flow Fixed"
        Auth["auth/routes.ts"] -->|Validate email| Valid{"Valid email?"}
        Valid -->|No| BadReq["400 Bad Request"]
        Valid -->|Yes| DB2["DB Operations"]
        DB2 -->|Session fails| Cleanup["Delete created user"]
    end
    
    subgraph "Chat Flow Fixed"
        Chat["routes/chat.ts"] -->|try-catch| ThreadVal["Thread Validation"]
        ThreadVal -->|DB down| Err503["503 Service Unavailable"]
    end
```

## Unified Startup Flow

```mermaid
flowchart LR
    subgraph "Local Development"
        A["docker compose up -d postgres"] -->|PostgreSQL on :5432| B["npm run dev<br/>tsx watch"]
        B -->|DATABASE_URL from .env| A
    end
    
    subgraph "Production"
        C["docker compose up -d"] -->|All services| D["postgres + caddy + backend"]
    end
    
    E[".env file"] -->|DATABASE_URL| B
    E -->|SESSION_SECRET| B
    E -->|OPENROUTER_API_KEY| B