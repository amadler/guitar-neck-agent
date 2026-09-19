# Changelog

## 2026-09-18 — Runtime Lesson Round Guard

Dodano `LessonGuard` — per-request runtime guard egzekwujący regułę "jedno narzędzie domenowe na rundę" w lesson mode.

### Zmiany

- **Nowy:** [`src/lesson-guard.ts`](src/lesson-guard.ts) — klasa `LessonGuard` z `checkCommand()`, `checkQuery()`, `reset()`
- **Nowy:** [`src/lesson-guard.spec.ts`](src/lesson-guard.spec.ts) — 10 testów jednostkowych
- **Zmiana:** [`src/tools/domain-tools.ts`](src/tools/domain-tools.ts) — `ToolContext` dostaje `lessonGuard?`, wszystkie tooly sprawdzają guard, `waitForUserTool` zmieniony na factory
- **Zmiana:** [`src/agent.ts`](src/agent.ts) — `createAgent` tworzy `LessonGuard` per request w lesson mode
- **Zmiana:** [`src/types/prompts.ts`](src/types/prompts.ts) — `BASE_SYSTEM_PROMPT` bez ograniczeń rundy, `LESSON_SYSTEM_PROMPT` informuje o runtime guardzie
- **Zmiana:** [`src/tools/domain-tools.spec.ts`](src/tools/domain-tools.spec.ts) — przepisany na obecne API, testuje guard integration

### Zasady guarda

| Scenariusz | Rezultat |
|---|---|
| query → command → wait | ✅ |
| query → query → command → wait | ✅ |
| command → command | ❌ blokowane |
| command → query | ❌ blokowane |
| zwykły chat (lessonMode=false) | ✅ brak limitu |
| resume po interrupt | ✅ nowy guard, czysty stan |

---

## 2026-09-19 — Fix: LessonGuard return zamiast throw

`LessonGuard.checkCommand()` i `checkQuery()` zmienione z `throw Error` na `return string | null`.
Tool sprawdza return value i zwraca `{ error, action: "blocked" }` zamiast crashować stream przez `pending.rejectOutput`.

---

# Backlog

## Dependency Upgrades (Major Version Bumps)

### [ ] Migrate to zod v4
- **Current:** `^3.23.0`
- **Latest:** `4.6.5`
- **Risk:** Breaking changes — project uses `z.object()`, `z.string()`, `z.number()`, `z.enum()`, `z.array()`, `z.boolean()`, `z.infer()`, `.optional()`, `.describe()`, `.min()`, `.max()`, `.length()`. Need to audit which v3 APIs changed in v4.
- **Blocked by:** Code audit of zod usage patterns

### [ ] Migrate to express v5
- **Current:** `^4.21.0`
- **Latest:** `5.2.1`
- **Risk:** Breaking changes — removed callback-based middleware signatures, changed error handling.
- **Blocked by:** Code audit of route handlers and middleware in [`src/index.ts`](src/index.ts) and [`src/routes/chat.ts`](src/routes/chat.ts)

### [ ] Migrate to TypeScript v7
- **Current:** `^5.6.0`
- **Latest:** `7.0.2`
- **Risk:** Breaking changes — new syntax restrictions, potential compilation errors.
- **Blocked by:** Code audit of TypeScript features used

### [ ] Migrate to vitest v5
- **Current:** `^2.0.0`
- **Latest:** `5.0.1`
- **Risk:** Breaking changes — API changes, config format changes.
- **Blocked by:** Code audit of test files and vitest config

### [ ] Update @types/express to v5
- **Current:** `^4.17.21`
- **Latest:** `5.0.6`
- **Risk:** Requires express v5 — blocked until express migration is done.
- **Blocked by:** express v5 migration

## Domain

### [ ] show_interval — obsługa tablicy interwałów
- **Problem:** Frontend wysyła `window.__ds.execute({ type: "show-interval", rootNote: "A", interval: "[5,b2,b7]" })`, ale [`ShowIntervalCommand`](src/types/contract.ts:43) i schema toola w [`domain-tools.ts`](src/tools/domain-tools.ts:26) oczekują pojedynczego `interval: string`.
- **Konieczne zmiany:**
  - [`src/types/contract.ts`](src/types/contract.ts) — `ShowIntervalCommand.interval` zmienić na `string[]`
  - [`src/tools/domain-tools.ts`](src/tools/domain-tools.ts) — schema `showIntervalSchema` zmienić na `z.array(z.string())`
  - [`src/tools/domain-tools.spec.ts`](src/tools/domain-tools.spec.ts) — testy dla tablicy interwałów
  - Frontend — sprawdzić czy już wysyła tablicę
- **Blocked by:** Uzgodnienie kontraktu z frontendem

## Security

### [ ] Fix npm audit vulnerabilities
- **Status:** 5 vulnerabilities (3 moderate, 1 high, 1 critical)
- **Action:** Run `npm audit` to identify specific packages, then `npm audit fix` or manual upgrades.

## Backend Architecture (P1–P8)

### [ ] P1 — PostgreSQL + Drizzle + Docker Compose
- **What:** Infrastruktura bazy danych. Drizzle client, schemy tabel, migracje, Docker Compose z Postgres i Caddy. Rozszerzony health check.
- **Blocked by:** None — can start immediately
- **Pliki:** `src/db/client.ts`, `src/db/schema/`, `src/db/migrations/`, `docker-compose.yml`, `Dockerfile`

### [ ] P2 — Auth + users + GET /me
- **What:** Rejestracja, logowanie, wylogowanie. HTTP-only cookie session. Endpoint GET /api/me. CORS z credentials: true.
- **Blocked by:** P1 (potrzebuje DB dla users i sessions)
- **Pliki:** `src/auth/middleware.ts`, `src/auth/routes.ts`, `src/users/routes.ts`

### [ ] P3 — Encrypted OpenRouter credentials
- **What:** Per-user szyfrowane klucze OpenRouter. AES-GCM. Endpointy PUT/GET status/DELETE.
- **Blocked by:** P2 (potrzebuje userId z sesji)
- **Pliki:** `src/credentials/service.ts`, `src/credentials/routes.ts`, `src/credentials/crypto.ts`

### [ ] P3.5 — CORS + session middleware + refactor /api/chat
- **What:** Przygotowanie istniejącego `/api/chat` na autoryzację. Auth middleware, walidacja threadId, CORS.
- **Blocked by:** P2 (potrzebuje session middleware i auth)
- **Pliki:** `src/routes/chat.ts`, `src/index.ts`

### [ ] P4 — /api/chat używa klucza zalogowanego usera
- **What:** Agent używa klucza OpenRouter z credentials usera zamiast globalnego z env.
- **Blocked by:** P3 (potrzebuje credentials), P3.5 (potrzebuje refactored chat)
- **Pliki:** `src/agent.ts`, `src/routes/chat.ts`, `src/credentials/service.ts`

### [ ] P5 — lesson_progress
- **What:** Zapis i odczyt postępu lekcji. Agent nie zapisuje do DB — robi to Angular po otrzymaniu DomainCommand.
- **Blocked by:** P2 (potrzebuje userId z sesji)
- **Pliki:** `src/progress/service.ts`, `src/progress/routes.ts`

### [ ] P6 — LangGraph PostgresSaver
- **What:** Trwały checkpoint agenta. Zastąpienie MemorySaver PostgresSaver. Restart Expressa nie zabija lekcji.
- **Blocked by:** P1 (potrzebuje Postgres)
- **Pliki:** `src/agent.ts`, `src/db/schema/` (ew. tabela dla checkpointów)

### [ ] P7 — exercise_results / user level
- **What:** Historia ćwiczeń i poziom zaawansowania. Automatyczna aktualizacja `user_profiles.level`.
- **Blocked by:** P5 (potrzebuje progress)
- **Pliki:** `src/progress/exercises.ts`, `src/progress/routes.ts`

### [ ] P8 — Angular: konto / settings / progress
- **What:** Warstwa kliencka. Login, register, settings z kluczem OpenRouter, progress.
- **Blocked by:** P2, P3, P4, P5, P7 (potrzebuje backendowych endpointów)
- **Pliki:** (frontend — osobne repo)