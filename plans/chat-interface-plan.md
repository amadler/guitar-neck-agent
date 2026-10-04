# Plan interfejsu czatu — Guitar Neck

## 1. Cel

Zdefiniować docelowy interfejs czatu i określić, czy migracja na DeepAgents Frontend SDK (`@langchain/angular`) jest opłacalna.

---

## 2. Wymagania użytkownika

- [ ] Historia czatu (persystencja po wylogowaniu)
- [ ] Sugerowanie odpowiedzi (AI generuje 2-3 podpowiedzi)
- [ ] Linki w tekście (markdown)
- [ ] Persystencja wątków po wylogowaniu (threadId → PostgreSQL)
- [ ] Lista wątków (sidebar)
- [ ] Streamowanie token po tokenie (zamiast batchowania całej odpowiedzi)

---

## 3. Obecna architektura (NDJSON)

```
Frontend (Angular)                    Backend (Express)
       │                                      │
       │  POST /api/chat (NDJSON stream)      │
       │─────────────────────────────────────►│
       │  { type: "message", text,            │
       │    threadId, domainState }            │
       │                                      │── createDeepAgent
       │  ◄── NDJSON stream:                  │── tools → DomainCommand
       │  { type: "token", text }             │── interruptOn
       │  { type: "domain-command", cmd }     │── MemorySaver
       │  { type: "interrupt" }               │
       │  { type: "done" }                    │
```

### Pliki do zmiany po stronie backendu

| Plik | Co zmienić | Szac. linii |
|------|-----------|-------------|
| [`src/tools/domain-tools.ts`](src/tools/domain-tools.ts) | Usunąć `ctx.emitCommand(command)` z 8 tooli. Zostawić `return { action: "...", ... }`. | ~8 |
| [`src/tools/domain-tools.ts`](src/tools/domain-tools.ts) | Usunąć `emitCommand` z interfejsu `ToolContext` | ~1 |
| [`src/routes/chat.ts`](src/routes/chat.ts) | Usunąć `emitCommand` z `AgentRunContext`, usunąć NDJSON (`res.write`, `res.setHeader`) | ~15 |
| [`src/routes/chat.ts`](src/routes/chat.ts) | Zamiast NDJSON — zwrócić JSON z `threadId` | ~10 |
| [`src/types/contract.ts`](src/types/contract.ts) | Usunąć `ChatResponseEvent` (niepotrzebne) | ~10 |
| **Razem backend** | **~45 linii** | **~2-3h** |

### Pliki do zmiany po stronie frontendu

| Co zmienić | Szac. linii |
|-----------|-------------|
| Dodać `@langchain/angular` do zależności | 1 |
| Usunąć własny NDJSON parser | ~-50 |
| Dodać `injectStream()` w serwisie czatu | ~10 |
| Przerobić `show-pattern` na tool call renderer | ~30 |
| Przerobić `show-intervals` na tool call renderer | ~20 |
| Przerobić `start-exercise` na tool call renderer | ~30 |
| Przerobić pozostałe 5 tooli | ~50 |
| Dodać `useToolCalls(stream)` do komponentu czatu | ~5 |
| **Razem frontend** | **~200 linii** | **~1-2 dni** |

### Nowy serwis: LangGraph API server

| Co zmienić | Szac. czas |
|-----------|-----------|
| Dodać osobny endpoint LangGraph API obok Express (lub osobny serwis w Docker) | ~4-5h |

---

## 4. Porównanie: NDJSON vs SDK

| Aspekt | NDJSON (obecnie) | SDK (`@langchain/angular`) |
|--------|------------------|---------------------------|
| **Streamowanie** | Batch — cała odpowiedź w jednym `{ type: "token" }` | Token po tokenie (async iterator) |
| **Tool calls** | `emitCommand()` → `res.write()` → frontend parsuje | ToolMessage z lifecycle (pending → complete → failed) |
| **Stan po reloadzie** | Ginie | Wznawianie przez threadId |
| **Subagenci** | Brak | Gotowe wsparcie |
| **Typowanie** | Ręczne `ChatResponseEvent` union | Auto-inferred z agent definition |
| **Frontend boilerplate** | Własny NDJSON parser + switch po event.type | `useStream()` + `useToolCalls()` |
| **Backend** | Express + `res.write()` | LangGraph API server |
| **Zależności** | Żadne | `@langchain/angular` + LangGraph API |

---

## 5. Decyzja: SDK czy nie?

### Za SDK
- Mniej boilerplate na froncie (NDJSON parser znika)
- Prawdziwe streamowanie tokenów (lepsze UX)
- Tool call lifecycle za darmo
- Wznawianie po reloadzie
- Subagenci w przyszłości

### Przeciw SDK
- Nowa zależność (`@langchain/angular`)
- Konieczność LangGraph API servera (osobny serwis)
- Domain commands trzeba przerobić na tool call renderery (~200 linii frontend)
- Na razie jest jeden agent, subagenci niepotrzebni

### Werdykt
**SDK — tak, ale nie teraz.** Na obecnym etapie (live preview, jeden agent) NDJSON działa i jest prostszy. SDK daje korzyści przy:
- przejściu na wielu subagentów
- potrzebie streamowania token po tokenie
- rozbudowie UI o tool call lifecycle

Wtedy migracja zajmie ~3-4 dni robocze.

---

## 6. Co robimy teraz (bez SDK)

Niezależnie od SDK, te rzeczy są potrzebne i można je zrobić od razu:

### 6.1 Historia czatu — nowa tabela + endpointy

**Nowa tabela** [`src/db/schema/chat_messages.ts`](src/db/schema/chat_messages.ts):
```ts
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(), // "ai" | "human"
  content: text("content").notNull(),
  domainCommands: jsonb("domain_commands"), // tablica DomainCommand
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Nowe endpointy** [`src/routes/chat.ts`](src/routes/chat.ts):
- `GET /api/chat/threads` — lista wątków użytkownika (id, title, lastMessageAt)
- `GET /api/chat/threads/:id/messages` — historia wiadomości
- `DELETE /api/chat/threads/:id` — usunięcie wątku

**Zapis wiadomości** — przy każdym `POST /api/chat`:
- zapisać wiadomość użytkownika (`role: "human"`)
- po zakończeniu agenta: zapisać odpowiedź AI (`role: "ai"`) + domain commands

### 6.2 Sugerowanie odpowiedzi

**Nowy endpoint** `POST /api/chat/suggestions`:
- Przyjmuje `{ threadId, context }`
- Agent AI generuje 2-3 krótkie sugestie
- Zwraca `{ suggestions: ["Pokaż C-dur", "Wyjaśnij interwały", "Ćwiczenie"] }`

**Frontend**: wyświetla jako przyciski pod ostatnią wiadomością

### 6.3 Linki w tekście

- Backend już zwraca markdown w `{ type: "token", text }`
- Frontend renderuje markdown → linki działają automatycznie
- Można dodać custom linki: `[Lekcja 1](/lessons/1)` → Angular router

### 6.4 Sidebar wątków

- `GET /api/chat/threads` → lista
- Frontend: lewy panel z listą wątków
- Przycisk "Nowy wątek" → `POST /api/chat` z nowym `threadId`

---

## 7. Szacowany czas (bez SDK)

| Zadanie | Czas |
|---------|------|
| Tabela `chat_messages` + migracja Drizzle | 1h |
| Endpoint `GET /api/chat/threads` | 1h |
| Endpoint `GET /api/chat/threads/:id/messages` | 1h |
| Zapis wiadomości przy `POST /api/chat` | 2h |
| Endpoint `POST /api/chat/suggestions` | 2h |
| Sidebar wątków (frontend) | 4h |
| Renderowanie sugestii (frontend) | 2h |
| Markdown + linki (frontend) | 1h |
| **Razem** | **~14h (2 dni)** |

---

## 8. Pliki do utworzenia / zmiany

### Nowe pliki backend
- [`src/db/schema/chat_messages.ts`](src/db/schema/chat_messages.ts) — schema Drizzle
- Migracja Drizzle (`drizzle-kit generate`)

### Zmienione pliki backend
- [`src/routes/chat.ts`](src/routes/chat.ts) — zapis wiadomości, nowe endpointy
- [`src/db/schema/index.ts`](src/db/schema/index.ts) — eksport nowej schemy
- [`src/index.ts`](src/index.ts) — nowe route'y

### Zmienione pliki frontend (guitar-neck-ui)
- Serwis czatu — nowe metody (getThreads, getMessages)
- Komponent czatu — sidebar, sugestie, markdown