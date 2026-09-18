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

## Security

### [ ] Fix npm audit vulnerabilities
- **Status:** 5 vulnerabilities (3 moderate, 1 high, 1 critical)
- **Action:** Run `npm audit` to identify specific packages, then `npm audit fix` or manual upgrades.