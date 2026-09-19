# Backend Architecture — Guitar Neck Server

## Zasady architektoniczne

1. **Agent tools ≠ DB** — narzędzia domenowe (`show_pattern`, `show_interval` itd.) emitują `DomainCommand` do Angulara. Nie mają dostępu do bazy danych. DB to osobna warstwa.
2. **LangGraph Postgres checkpointer** — tylko dla stanu agenta (zamiennik `MemorySaver`). Nie dla tooli.
3. **HTTP-only cookie auth** — backend sam wie, który user wysyła request. Angular nie przesyła `userId`.
4. **Klucz OpenRouter per user** — szyfrowany AES-GCM, nie plaintext, nie w JWT, nie logowany.
5. **Monolit modularny** — jeden Express, foldery: `db/`, `auth/`, `users/`, `credentials/`, `progress/`, `chat/`, `agent/`.

## Kolejność wdrożenia

### P1 — PostgreSQL + Drizzle + migracje + Docker Compose

**Co:** Infrastruktura bazy danych i ORM.

- [`src/db/client.ts`](src/db/client.ts) — inicjalizacja Drizzle clienta z Postgres
- [`src/db/schema/`](src/db/schema/) — definicje tabel:
  - `users` — id, email, created_at, updated_at
  - `user_credentials` — id, user_id, provider, encrypted_api_key, updated_at
  - `user_profiles` — user_id, level, preferences jsonb
  - `lesson_progress` — user_id, lesson_id, status, current_step, started_at, completed_at, data jsonb
  - `exercise_results` — user_id, lesson_id, exercise_id, result, created_at
  - `chat_threads` — id, user_id, lesson_id nullable, created_at
- [`src/db/migrations/`](src/db/migrations/) — Drizzle migrations
- `docker-compose.yml` — postgres + caddy/nginx
- `Dockerfile` — dla backendu
- Rozszerzenie [`GET /api/health`](src/index.ts:12) o status DB

**Pliki:** `src/db/client.ts`, `src/db/schema/*.ts`, `docker-compose.yml`, `Dockerfile`

---

### P2 — Auth + users + GET /me

**Co:** Rejestracja, logowanie, wylogowanie, identyfikacja usera.

- `express-session` + `connect-pg-simple` — session store w Postgres
- `src/auth/` — middleware, routes:
  - `POST /api/auth/register` — tworzy usera, zakłada sesję
  - `POST /api/auth/login` — weryfikacja, zakłada sesję
  - `POST /api/auth/logout` — niszczy sesję
  - `GET /api/me` — zwraca dane bieżącego usera
- CORS: `credentials: true`, `origin` z env

**Pliki:** `src/auth/middleware.ts`, `src/auth/routes.ts`, `src/users/routes.ts`

---

### P3 — Encrypted user OpenRouter credentials

**Co:** Zarządzanie kluczem API per user.

- `USER_CREDENTIALS_ENCRYPTION_KEY` — sekret w env
- AES-GCM szyfrowanie/deszyfrowanie w `src/credentials/`
- Endpointy:
  - `PUT /api/credentials/openrouter` — zapisuje zaszyfrowany klucz
  - `GET /api/credentials/openrouter/status` — zwraca `{ configured: boolean }`
  - `DELETE /api/credentials/openrouter` — usuwa klucz

**Pliki:** `src/credentials/service.ts`, `src/credentials/routes.ts`, `src/credentials/crypto.ts`

---

### P3.5 — CORS + session middleware + refactor /api/chat

**Co:** Przygotowanie istniejącego `/api/chat` na autoryzację.

- Konfiguracja CORS z `credentials: true`
- Podpięcie session middleware do Expressa
- Refactor [`src/routes/chat.ts`](src/routes/chat.ts):
  - Auth middleware — sprawdza czy user zalogowany
  - Walidacja `threadId` — czy należy do tego usera (z `chat_threads`)
  - `ChatRequestBody` nie potrzebuje już `domainState` — backend odtwarza z bazy

**Pliki:** `src/routes/chat.ts`, `src/index.ts`

---

### P4 — /api/chat używa klucza zalogowanego usera

**Co:** Agent używa klucza OpenRouter z credentials usera, a nie globalnego z env.

- [`src/agent.ts`](src/agent.ts) — `createAgent` przyjmuje `apiKey` z credentials
- [`src/routes/chat.ts`](src/routes/chat.ts) — przed utworzeniem agenta:
  1. Auth middleware → userId
  2. `credentialsService.getDecryptedKey(userId, 'openrouter')`
  3. Tworzy agenta z tym kluczem
- Usunięcie `OPENROUTER_API_KEY` z env (opcjonalnie fallback dla dev)

**Pliki:** `src/agent.ts`, `src/routes/chat.ts`, `src/credentials/service.ts`

---

### P5 — lesson_progress

**Co:** Zapis i odczyt postępu lekcji.

- `src/progress/` — serwis i routes:
  - `GET /api/progress/:lessonId` — aktualny stan lekcji
  - `PUT /api/progress/:lessonId` — aktualizacja (status, current_step, data)
  - `GET /api/progress` — lista wszystkich lekcji usera
- Agent **nie zapisuje** do DB — to Angular wysyła progress po otrzymaniu `DomainCommand`

**Pliki:** `src/progress/service.ts`, `src/progress/routes.ts`

---

### P6 — LangGraph Postgres checkpointer

**Co:** Trwały checkpoint agenta — restart Expressa nie zabija lekcji.

- Zastąpienie [`MemorySaver`](src/agent.ts:10) `PostgresSaver` z LangGraph
- Checkpoint przechowuje: stan rozmowy agenta, pozycję w grafie, zmienne kontekstowe
- **Nie przechowuje** lesson_progress — to osobna tabela
- `threadId` ↔ `userId` ↔ `lessonId` — checkpoint jest powiązany z userem

**Pliki:** `src/agent.ts`, `src/db/schema/` (ew. tabela dla checkpointów)

---

### P7 — exercise_results / poziom użytkownika

**Co:** Historia ćwiczeń i poziom zaawansowania.

- `POST /api/exercises/result` — zapis wyniku ćwiczenia
- `GET /api/exercises/history` — historia wyników
- `user_profiles.level` — automatycznie aktualizowany na podstawie wyników

**Pliki:** `src/progress/exercises.ts`, `src/progress/routes.ts`

---

### P8 — Angular: konto / settings / progress

**Co:** Warstwa kliencka dla nowych endpointów.

- `auth/` — login, register, auth service
- `user/` — user service, GET /me
- `settings/llm-credentials/` — PUT/GET/DELETE klucza OpenRouter
- `lessons/progress.service.ts` — progress API
- `AgentApiService` — przestaje mieć hardcoded URL, idzie przez environment/proxy

**Pliki:** (frontend — osobne repo)

---

## Diagram przepływu danych

```
Angular
  │
  │ POST /api/chat { text, threadId }
  │ Cookie: session=...
  ▼
guitar-neck-agent / Express
  │
  ├─ auth middleware → userId
  │
  ├─ credentials service → decrypt OpenRouter key
  │
  ├─ createAgent(userApiKey)
  │   └─ LangGraph agent
  │       ├─ PostgresSaver (checkpoint)
  │       └─ Domain tools → DomainCommand
  │
  ├─ emit domain-command → Angular
  │
  └─ Angular → POST /api/progress (po DomainCommand)
```

## Kluczowe decyzje

| Decyzja | Wybór | Alternatywa |
|---------|-------|-------------|
| ORM | Drizzle | Prisma, TypeORM |
| Session store | express-session + connect-pg-simple | Własna implementacja |
| Auth | HTTP-only cookie | JWT w header |
| Klucz API | AES-GCM encrypted w DB | Plaintext, env globalny |
| Checkpointer | LangGraph PostgresSaver | MemorySaver (obecnie) |
| Agent ↔ DB | Rozdzielone — tool nie ma dostępu do DB | Bezpośrednie zapisy |
| Queue | Nie — LangChain FE SDK ogarnie | express-rate-limit per user |