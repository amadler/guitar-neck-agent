# Plan: Runtime Lesson Round Guard

## Problem

Obecnie reguła "jedno narzędzie domenowe na rundę" jest egzekwowana wyłącznie przez system prompt. Agent może ją złamać — wywołać wiele domain command tooli w jednej rundzie, wywołać query tool po command toolu, lub kontynuować bez `wait_for_user`. Nie ma runtime guarda.

## Rozwiązanie

Dodać `LessonGuard` — per-request, mutable wrapper sprawdzający stan rundy przy każdym wywołaniu toola. Guard jest tworzony w `chat.ts` przy każdym requeście i przekazywany do tooli przez `ToolContext`. Po zakończeniu requestu (interrupt lub normalny koniec) guard jest odrzucany — następny request dostaje nowy, czysty guard.

## Architektura

```
chat.ts (request)
  → tworzy LessonGuard (committed = false)
  → createAgent({ lessonGuard })
    → createDomainTools({ lessonGuard })
      → domain command tools: guard.checkCommand()
      → query tools: guard.checkQuery()
    → createWaitForUserTool(guard)
      → guard.reset() przed interrupt()
  → agent.streamEvents(input)
    → LLM → tool calls → guard egzekwuje reguły
    → interrupt() → koniec rundy
```

## Stan guarda

Guard przechodzi przez trzy fazy w ramach jednego requestu:

1. **Początek**: `committed = false` — query tools dozwolone, command tools dozwolone (pierwszy)
2. **Po command toolu**: `committed = true` — tylko `wait_for_user` dozwolony
3. **Koniec requestu**: guard odrzucany, następny request dostaje nowy

## Zmiany w plikach

### 1. Nowy plik: `src/lesson-guard.ts`

```typescript
export class LessonGuard {
  private _committed = false;

  get committed(): boolean {
    return this._committed;
  }

  /**
   * Sprawdza czy można wykonać domain command tool.
   * Rzuca error jeśli już wykonano command w tej rundzie.
   */
  checkCommand(): void {
    if (this._committed) {
      throw new Error(
        "W tej rundzie został już wykonany jedno narzędzie domenowe. " +
        "Nie można wykonać kolejnego. Użyj wait_for_user, aby zakończyć rundę."
      );
    }
    this._committed = true;
  }

  /**
   * Sprawdza czy można wykonać query tool.
   * Dozwolone tylko przed pierwszym command toolem.
   */
  checkQuery(): void {
    if (this._committed) {
      throw new Error(
        "Po narzędziu domenowym nie można już wykonywać zapytań w tej rundzie. " +
        "Stan widoku został zmieniony. Użyj wait_for_user, aby zakończyć rundę."
      );
    }
  }

  /** Resetuje stan — wywoływane przed interrupt() w wait_for_user */
  reset(): void {
    this._committed = false;
  }
}
```

### 2. Modyfikacja: `src/tools/domain-tools.ts`

**Zmiany w `ToolContext`:**
```typescript
interface ToolContext {
  domainState: DomainState;
  emitCommand: (command: DomainCommand) => void;
  lessonGuard?: LessonGuard;  // NOWE: opcjonalny guard dla lesson mode
}
```

**Domain command tools** — każde wywołanie poprzedzone `ctx.lessonGuard?.checkCommand()`:
```typescript
tool(
  async (input: ShowPatternInput) => {
    ctx.lessonGuard?.checkCommand();  // ← DODANE
    const command: DomainCommand = { ... };
    ctx.emitCommand(command);
    return { ... };
  },
  { name: "show_pattern", ... }
)
```

To samo dla: `show_interval`, `compare_patterns`, `set_view`, `set_emphasis`, `clear_view`, `resolve_shape`, `set_ai_mode`, `start_exercise`.

**Query tools** — każde wywołanie poprzedzone `ctx.lessonGuard?.checkQuery()`:
```typescript
tool(
  async () => {
    ctx.lessonGuard?.checkQuery();  // ← DODANE
    const result = ctx.domainState;
    return { ... };
  },
  { name: "get_current_view", ... }
)
```

To samo dla: `get_exercise_result`.

**`waitForUserTool`** — zmiana z singletona na factory:
```typescript
export function createWaitForUserTool(guard?: LessonGuard) {
  return tool(
    async ({ prompt }) => {
      guard?.reset();  // reset przed interrupt
      return interrupt({ prompt });
    },
    {
      name: "wait_for_user",
      description: "Zatrzymuje lekcję i czeka na odpowiedź użytkownika.",
      schema: z.object({ prompt: z.string() }),
    }
  );
}
```

### 3. Modyfikacja: `src/agent.ts`

```typescript
import { LessonGuard } from "./lesson-guard.js";

export function createAgent(
  ctx: AgentRunContext,
  lessonMode: boolean,
  config: AgentConfig,
): DeepAgent<any> {
  const guard = lessonMode ? new LessonGuard() : undefined;  // ← NOWE

  const domainTools = createDomainTools({
    domainState: ctx.domainState,
    emitCommand: ctx.emitCommand,
    lessonGuard: guard,  // ← DODANE
  });

  const model = new ChatOpenRouter({ ... });

  return createDeepAgent({
    model,
    tools: lessonMode
      ? [...domainTools, createWaitForUserTool(guard)]  // ← factory z guardem
      : domainTools,
    checkpointer,
    systemPrompt: lessonMode
      ? LESSON_SYSTEM_PROMPT
      : BASE_SYSTEM_PROMPT,
  });
}
```

### 4. Modyfikacja: `src/types/prompts.ts`

Aktualizacja promptów, aby odzwierciedlić runtime enforcement:

**BASE_SYSTEM_PROMPT** — usunąć instrukcje o limicie tooli (nie dotyczy zwykłego chatu):
```typescript
export const BASE_SYSTEM_PROMPT =
    "Jesteś pomocnym asystentem gitarzysty. Mów po polsku, krótko i rzeczowo. " +
    "Gdy użytkownik poprosi o pokazanie skali lub akordu na gryfie, użyj narzędzia show_pattern. " +
    // ... reszta bez ograniczeń rundy
```

**LESSON_SYSTEM_PROMPT** — dodać informację o runtime guardzie:
```typescript
export const LESSON_SYSTEM_PROMPT =
    "Jesteś nauczycielem gitary prowadzącym lekcję krok po kroku. " +
    "System automatycznie wymusza limit jednego narzędzia domenowego na rundę. " +
    "Po wykonaniu narzędzia domenowego system zablokuje kolejne — musisz użyć wait_for_user. " +
    // ... reszta
```

### 5. Nowy plik: `src/lesson-guard.spec.ts`

```typescript
import { LessonGuard } from "./lesson-guard";

describe("LessonGuard", () => {
  let guard: LessonGuard;

  beforeEach(() => {
    guard = new LessonGuard();
  });

  it("pozwala na query przed command", () => {
    expect(() => guard.checkQuery()).not.toThrow();
    expect(() => guard.checkCommand()).not.toThrow();
  });

  it("pozwala na wiele query przed command", () => {
    expect(() => guard.checkQuery()).not.toThrow();
    expect(() => guard.checkQuery()).not.toThrow();
    expect(() => guard.checkCommand()).not.toThrow();
  });

  it("blokuje drugi command w tej samej rundzie", () => {
    guard.checkCommand();
    expect(() => guard.checkCommand()).toThrow();
  });

  it("blokuje query po command", () => {
    guard.checkCommand();
    expect(() => guard.checkQuery()).toThrow();
  });

  it("pozwala na command po resecie (nowa runda)", () => {
    guard.checkCommand();
    guard.reset();
    expect(() => guard.checkCommand()).not.toThrow();
  });

  it("pozwala na query po resecie", () => {
    guard.checkCommand();
    guard.reset();
    expect(() => guard.checkQuery()).not.toThrow();
  });

  it("działa poprawnie: query → command → reset → query → command", () => {
    guard.checkQuery();
    guard.checkCommand();
    guard.reset();
    guard.checkQuery();
    expect(() => guard.checkCommand()).not.toThrow();
  });

  it("zwraca poprawny stan committed", () => {
    expect(guard.committed).toBe(false);
    guard.checkCommand();
    expect(guard.committed).toBe(true);
    guard.reset();
    expect(guard.committed).toBe(false);
  });
});
```

### 6. Modyfikacja: `src/tools/domain-tools.spec.ts`

Dodać testy dla guarda w kontekście tooli — sprawdzić, że:
- `show_pattern` rzuca error gdy guard zablokowany
- `get_current_view` rzuca error gdy guard zablokowany
- `wait_for_user` resetuje guard

## Scenariusze testowe (zgodne z wymaganiami)

| Scenariusz | Oczekiwany rezultat |
|---|---|
| query → command → wait | ✅ Działa |
| query → query → command → wait | ✅ Działa |
| command → command | ❌ Blokowane (drugi command rzuca error) |
| command → query | ❌ Blokowane (query po command rzuca error) |
| Zwykły chat (lessonMode=false) | ✅ Brak limitu — guard nie istnieje |
| Resume po interrupt | ✅ Nowy guard, czysty stan |

## Diagram przepływu

```mermaid
flowchart TD
    A[Nowy request / Resume] --> B[Tworzenie LessonGuard\ncommitted = false]
    B --> C{LLM wybiera tool}
    C -->|query tool| D[guard.checkQuery]
    D -->|committed = false| E[Wykonaj query]
    D -->|committed = true| F[Rzuć error: query po command]
    E --> C
    C -->|domain command tool| G[guard.checkCommand]
    G -->|committed = false| H[Wykonaj command\ncommitted = true]
    G -->|committed = true| I[Rzuć error: drugi command]
    H --> C
    C -->|wait_for_user| J[guard.reset\ninterrupt{prompt}]
    J --> K[Koniec rundy\nCzekaj na użytkownika]
    F --> C
    I --> C
```

## Uwagi

- **Per-request, nie per-agent**: Guard jest tworzony w `createAgent()` przy każdym wywołaniu. Agent LangGraph może być teoretycznie współdzielony, ale w praktyce `chat.ts` tworzy nowego agenta na każdy request.
- **Brak zmian w kontrakcie domenowym**: `DomainCommand`, `DomainState`, `emitCommand` pozostają bez zmian.
- **Brak custom StateGraph**: DeepAgent pozostaje nietknięty. Guard działa na poziomie tool wrappera.
- **Brak workaroundów**: Nie używamy `reject + feedback`, `approve/edit/reject/respond`, ani `interruptOn`. Czysty `interrupt()` z LangGraph.
- **wait_for_user resetuje guard**: Przed `interrupt()` guard jest resetowany, ale to tylko zabezpieczenie — interrupt i tak kończy request.