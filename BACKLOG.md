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

## Chat Interface

### [ ] Chat message history + SDK migration
- **Problem:** Brak historii wiadomości (persystencja po wylogowaniu), brak listy wątków, brak streamowania token po tokenie.
- **Plan:** [`docs/deepagents-frontend-research.md`](docs/deepagents-frontend-research.md) — research porównujący NDJSON z DeepAgents SDK.
- **Werdykt:** SDK — tak, ale nie teraz. NDJSON działa i jest prostszy na obecnym etapie (live preview, jeden agent).
- **Konieczne zmiany (gdy przyjdzie czas):**
  - Nowa tabela `chat_messages` + migracja Drizzle
  - Endpointy: `GET /api/chat/threads`, `GET /api/chat/threads/:id/messages`, `DELETE /api/chat/threads/:id`
  - Zapis wiadomości przy `POST /api/chat`
  - Endpoint `POST /api/chat/suggestions`
  - Frontend: sidebar wątków, sugestie, markdown
- **Blocked by:** Decyzja o migracji na DeepAgents SDK

### [ ] Interleaved streaming — przeplatanie tokenów z domain commandami
- **Problem:** Obecnie backend zbiera cały tekst odpowiedzi w jeden event `token` na końcu requestu. Domain commandy są emitowane wcześniej, ale nie są przeplatane z tekstem. Frontend nie może wyświetlić zsynchronizowanego wyjaśnienia z demonstracją (np. "zobacz A" → pokaż A → "teraz D" → pokaż D).
- **Docelowe zachowanie:** Strumień eventów w kolejności chronologicznej: `token` → `domain-command` → `token` → `domain-command` → `interrupt` → `done`.
- **Do zrobienia:**
  - W `src/routes/chat.ts` emitować tokeny na bieżąco zamiast batchować do `finalText`
  - Sprawdzić czy `deepagents` / LangGraph `stream.messages` daje dostęp do tokenów w trakcie generowania
  - Frontend Angular musi umieć przetwarzać przeplatane eventy (nakładać command na gryf w trakcie wyświetlania tekstu)
- **Blocked by:** Decyzja o priorytecie — zmiana po stronie backendu i frontendu

## Lesson / Exercise Execution

### [x] Exercise initial state — showIntervals
- **Problem:** Agent nie może zainicjować ćwiczenia z widocznym stanem na gryfie. Np. pyta "znajdź kwinty od A" ale nie pokazuje A na gryfie — uczeń nie ma punktu odniesienia.
- **Plan:** [`plans/exercise-initial-state.md`](plans/exercise-initial-state.md)
- **Rozwiązanie:** Dodano opcjonalne pole `showIntervals` do `StartExerciseCommand` — agent określa które interwały wyświetlić na gryfie na starcie ćwiczenia.
- **Zrobione:**
  - [`src/types/contract.ts`](src/types/contract.ts) — dodano `showIntervals?: string[]` do `StartExerciseCommand`
  - [`src/tools/domain-tools.ts`](src/tools/domain-tools.ts) — dodano `showIntervals` do schemy i handlera
  - [`src/types/prompts.ts`](src/types/prompts.ts) — zaktualizowano prompt by agent używał `showIntervals`
  - [`src/tools/domain-tools.spec.ts`](src/tools/domain-tools.spec.ts) — dodano testy
  - **guitar-neck-ui** (frontend) — obsłużyć `showIntervals` w trybie ćwiczenia
- ~~**Blocked by:** Refaktor lesson execution (usunięcie LessonGuard)~~ — odblokowane, refaktor wdrożony

### [x] Refaktor lesson execution — usunięcie LessonGuard
- **Plan:** [`plans/refactor-lesson-execution.md`](plans/refactor-lesson-execution.md)
- **Zrobione:**
  - Usunięto `src/lesson-guard.ts` i `src/lesson-guard.spec.ts`
  - Dodano command sequencer (promise queue) w `src/routes/chat.ts`
  - Dodano `executeCommand` do `ToolContext` i `AgentRunContext`
  - Wszystkie tooli używają `await ctx.executeCommand(command)` zamiast `emitCommand`
  - Dodano `interactionDensity` config (`frequent` / `balanced` / `mostly-teach`)
  - Walidacja `LESSON_INTERACTION_DENSITY` przy starcie w `src/index.ts`
  - Iniekcja `{{interactionDensity}}` do `LESSON_SYSTEM_PROMPT`
  - Usunięto `emitCommand` jako dead code (cleanup)
  - Testy: 13/13 pass (multi-command, ordering, snapshot semantics)

## VPS Deployment

### [ ] Wdrożenie na VPS (Hetzner)
- **Plan:** [`plans/vps-deployment-plan.md`](plans/vps-deployment-plan.md) — kompletny blueprint wdrożenia.
- **Stan:** Infrastruktura deweloperska (Docker Compose, Caddy, Dockerfile) gotowa. VPS nie utworzony.
- **Do zrobienia:**
  - Utworzenie VPS CX21 w Hetzner
  - Konfiguracja SSH + firewall + fail2ban
  - Instalacja Docker + Docker Compose
  - Przygotowanie produkcyjnego docker-compose.yml (z n8n)
  - Przygotowanie produkcyjnego Caddyfile (z routowaniem na API + n8n)
  - Konfiguracja DNS (api.gitarneck.pl, n8n.gitarneck.pl → IP VPS)
  - Wdrożenie stacka + migracja bazy
  - Automatyczne backupy + monitoring