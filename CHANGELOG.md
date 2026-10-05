# Changelog

## 2026-10-05 — Refaktor lesson execution + cleanup emitCommand

### Refaktor lesson execution
- **Cel:** Usunięcie `LessonGuard` (one-command-per-round), umożliwienie wielu sekwencyjnych komend w lesson mode, dodanie konfiguracji gęstości interakcji.
- **Zmiany:**
  - Usunięto [`src/lesson-guard.ts`](src/lesson-guard.ts) i [`src/lesson-guard.spec.ts`](src/lesson-guard.spec.ts) — cały mechanizm guarda usunięty
  - Dodano **command sequencer** (promise queue) w [`src/routes/chat.ts`](src/routes/chat.ts) — gwarantuje deterministyczną kolejność emisji przy równoległych tool callach LLM
  - Dodano `executeCommand` do [`src/tools/domain-tools.ts`](src/tools/domain-tools.ts) i [`src/agent.ts`](src/agent.ts) — wszystkie tooli używają `await ctx.executeCommand(command)`
  - Dodano `interactionDensity` config (`frequent` / `balanced` / `mostly-teach`) — walidacja w [`src/index.ts`](src/index.ts), iniekcja do `LESSON_SYSTEM_PROMPT` w [`src/agent.ts`](src/agent.ts)
  - Zaktualizowano testy w [`src/tools/domain-tools.spec.ts`](src/tools/domain-tools.spec.ts) — usunięto guard tests, dodano multi-command, ordering, snapshot-semantics (13 testów)

### Cleanup: usunięcie dead code — emitCommand
- `emitCommand` był zdefiniowany w `AgentRunContext` i `ToolContext`, ale żaden tool go nie wołał — wszystkie szły przez `executeCommand`.
- Usunięto z 4 plików: [`src/agent.ts`](src/agent.ts), [`src/tools/domain-tools.ts`](src/tools/domain-tools.ts), [`src/routes/chat.ts`](src/routes/chat.ts), [`src/tools/domain-tools.spec.ts`](src/tools/domain-tools.spec.ts)

---

## 2026-10-04 — Weryfikacja planów i archiwizacja

Zweryfikowano wszystkie 8 planów względem kodu. Zaktualizowano BACKLOG i zarchiwizowano zrealizowane plany.

### Zmiany

- **Nowe:** [`docs/`](docs/) — katalog z dokumentacją (przeniesiono z `plans/`):
  - [`docs/frontend-integration-instructions.md`](docs/frontend-integration-instructions.md) — instrukcje integracji frontendu
  - [`docs/deepagents-frontend-research.md`](docs/deepagents-frontend-research.md) — research DeepAgents SDK
- **Archiwum:** [`archived-plans-04.10.2026.zip`](archived-plans-04.10.2026.zip) — zarchiwizowane zrealizowane plany:
  - `backend-architecture.md` (P1–P7 w pełni wdrożone)
  - `fix-db-connection-and-error-handling.md` (wszystkie 11 itemów wdrożone)
  - `lesson-round-guard.md` (w pełni wdrożone)
  - `show-interval-array.md` (w pełni wdrożone)
- **Aktualizacja:** [`BACKLOG.md`](BACKLOG.md) — oczyszczono z wykonanych itemów, przeniesiono do osobnego pliku

---

## 2026-09-19 — Fix: LessonGuard return zamiast throw

`LessonGuard.checkCommand()` i `checkQuery()` zmienione z `throw Error` na `return string | null`.
Tool sprawdza return value i zwraca `{ error, action: "blocked" }` zamiast crashować stream przez `pending.rejectOutput`.

---

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