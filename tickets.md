# Tickets: Backend Architecture — Guitar Neck Server

Rozbicie planu na pionowe (vertical) slice'y. Każdy ticket to kompletna, demoowalna funkcjonalność.

Work the **frontier**: ticketi bez blockerów można zaczynać od razu.

---

## P1 — PostgreSQL + Drizzle + Docker Compose

**What to build:** Infrastruktura bazy danych. Drizzle client, schemy tabel, migracje, Docker Compose z Postgres i Caddy. Rozszerzony health check.

**Blocked by:** None — can start immediately

- [ ] `src/db/client.ts` — inicjalizacja Drizzle z Postgres
- [ ] `src/db/schema/` — tabele: users, user_credentials, user_profiles, lesson_progress, exercise_results, chat_threads
- [ ] `src/db/migrations/` — pierwsza migracja
- [ ] `docker-compose.yml` — postgres + caddy/nginx
- [ ] `Dockerfile` — dla backendu
- [ ] Rozszerzenie `GET /api/health` o status DB

---

## P2 — Auth + users + GET /me

**What to build:** Rejestracja, logowanie, wylogowanie. HTTP-only cookie session. Endpoint GET /api/me. CORS z credentials: true.

**Blocked by:** P1 (potrzebuje DB dla users i sessions)

- [ ] `express-session` + `connect-pg-simple` — session store w Postgres
- [ ] `POST /api/auth/register` — tworzy usera, zakłada sesję
- [ ] `POST /api/auth/login` — weryfikacja, zakłada sesję
- [ ] `POST /api/auth/logout` — niszczy sesję
- [ ] `GET /api/me` — zwraca dane bieżącego usera
- [ ] CORS: `credentials: true`, `origin` z env

---

## P3 — Encrypted OpenRouter credentials

**What to build:** Per-user szyfrowane klucze OpenRouter. AES-GCM. Endpointy PUT/GET status/DELETE.

**Blocked by:** P2 (potrzebuje userId z sesji)

- [ ] `USER_CREDENTIALS_ENCRYPTION_KEY` w env
- [ ] `src/credentials/crypto.ts` — AES-GCM szyfrowanie/deszyfrowanie
- [ ] `PUT /api/credentials/openrouter` — zapisuje zaszyfrowany klucz
- [ ] `GET /api/credentials/openrouter/status` — zwraca `{ configured: boolean }`
- [ ] `DELETE /api/credentials/openrouter` — usuwa klucz

---

## P3.5 — CORS + session middleware + refactor /api/chat

**What to build:** Przygotowanie istniejącego `/api/chat` na autoryzację. Auth middleware, walidacja threadId, CORS.

**Blocked by:** P2 (potrzebuje session middleware i auth)

- [ ] Auth middleware — sprawdza czy user zalogowany, wstrzykuje userId do req
- [ ] Walidacja `threadId` — czy należy do tego usera (z `chat_threads`)
- [ ] Refactor `ChatRequestBody` — `domainState` opcjonalne, backend odtwarza z bazy
- [ ] Podpięcie session middleware i CORS do Expressa

---

## P4 — /api/chat używa klucza zalogowanego usera

**What to build:** Agent używa klucza OpenRouter z credentials usera zamiast globalnego z env.

**Blocked by:** P3 (potrzebuje credentials), P3.5 (potrzebuje refactored chat)

- [ ] `createAgent` przyjmuje `apiKey` z credentials zamiast z env
- [ ] `/api/chat` przed utworzeniem agenta: auth → decrypt key → create agent
- [ ] Usunięcie `OPENROUTER_API_KEY` z env (opcjonalnie fallback dla dev)

---

## P5 — lesson_progress

**What to build:** Zapis i odczyt postępu lekcji. Agent nie zapisuje do DB — robi to Angular po otrzymaniu DomainCommand.

**Blocked by:** P2 (potrzebuje userId z sesji)

- [ ] `GET /api/progress/:lessonId` — aktualny stan lekcji
- [ ] `PUT /api/progress/:lessonId` — aktualizacja (status, current_step, data)
- [ ] `GET /api/progress` — lista wszystkich lekcji usera

---

## P6 — LangGraph PostgresSaver

**What to build:** Trwały checkpoint agenta. Zastąpienie MemorySaver PostgresSaver. Restart Expressa nie zabija lekcji.

**Blocked by:** P1 (potrzebuje Postgres)

- [ ] Zastąpienie `MemorySaver` `PostgresSaver` z LangGraph
- [ ] Checkpoint powiązany z `threadId` ↔ `userId` ↔ `lessonId`
- [ ] Test: restart Expressa → lekcja kontynuowana

---

## P7 — exercise_results / user level

**What to build:** Historia ćwiczeń i poziom zaawansowania. Automatyczna aktualizacja `user_profiles.level`.

**Blocked by:** P5 (potrzebuje progress)

- [ ] `POST /api/exercises/result` — zapis wyniku ćwiczenia
- [ ] `GET /api/exercises/history` — historia wyników
- [ ] Automatyczna aktualizacja `user_profiles.level` na podstawie wyników

---

## P8 — Angular: konto / settings / progress

**What to build:** Warstwa kliencka. Login, register, settings z kluczem OpenRouter, progress.

**Blocked by:** P2, P3, P4, P5, P7 (potrzebuje backendowych endpointów)

- [ ] `auth/` — login, register, auth service
- [ ] `user/` — user service, GET /me
- [ ] `settings/llm-credentials/` — PUT/GET/DELETE klucza OpenRouter
- [ ] `lessons/progress.service.ts` — progress API
- [ ] `AgentApiService` — URL z environment/proxy, nie hardcoded

---

## Graf zależności

```
P1 ──────────────────────────────────────────────────┐
 │                                                     │
 ├── P2 ──────────────────────────────────────────┐    │
 │     │                                          │    │
 │     ├── P3 ──────────────────────────────┐     │    │
 │     │     │                              │     │    │
 │     │     └── P4 ◀ P3.5 ────────────┐   │     │    │
 │     │           │                   │   │     │    │
 │     └── P5 ─────┼────────────────┐   │   │     │    │
 │           │     │                │   │   │     │    │
 │           └── P7 ◀───────────────┘   │   │     │    │
 │                                      │   │     │    │
 └── P6 ────────────────────────────────┘   │     │    │
                                            │     │    │
                                            └── P8 ◀───┘
```

Frontier: **P1** (start), potem **P2**, potem równolegle **P3**, **P3.5**, **P5**, **P6**.