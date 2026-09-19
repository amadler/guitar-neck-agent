# Plan: `show_interval` — obsługa tablicy interwałów

## Cel

Rozszerzenie `ShowIntervalCommand` i toola `show_interval` w agencie, aby przyjmowały **tablicę interwałów** (`string[]`) zamiast pojedynczego stringa. Breaking change — czysty kontrakt.

## Zmiany

### 1. [`src/types/contract.ts`](src/types/contract.ts:43) — `ShowIntervalCommand`

**Przed:**
```typescript
export interface ShowIntervalCommand {
  type: 'show-interval';
  rootNote: string;
  interval: string;
}
```

**Po:**
```typescript
export interface ShowIntervalCommand {
  type: 'show-interval';
  rootNote: string;
  intervals: string[];
}
```

### 2. [`src/tools/domain-tools.ts`](src/tools/domain-tools.ts:29) — `showIntervalSchema` i handler

**Przed (schema):**
```typescript
const showIntervalSchema = z.object({
  rootNote: z.string().describe("Nuta podstawowa"),
  interval: z.string().describe("Nazwa interwału, np. b3, 3, 5, b7"),
});
```

**Po (schema):**
```typescript
const showIntervalSchema = z.object({
  rootNote: z.string().describe("Nuta podstawowa"),
  intervals: z.array(z.string()).describe("Lista interwałów, np. ['b3', '5', 'b7']"),
});
```

**Przed (handler — linia 148):**
```typescript
const command: DomainCommand = { type: "show-interval", rootNote: input.rootNote, interval: input.interval };
```

**Po (handler):**
```typescript
const command: DomainCommand = { type: "show-interval", rootNote: input.rootNote, intervals: input.intervals };
```

**Przed (return — linia 154):**
```typescript
return {
  action: "show-interval",
  rootNote: input.rootNote,
  interval: input.interval,
};
```

**Po (return):**
```typescript
return {
  action: "show-interval",
  rootNote: input.rootNote,
  intervals: input.intervals,
};
```

### 3. [`src/tools/domain-tools.spec.ts`](src/tools/domain-tools.spec.ts:139) — test

**Przed:**
```typescript
await showIntervalTool.invoke({ rootNote: "C", interval: "3" });
```

**Po:**
```typescript
await showIntervalTool.invoke({ rootNote: "C", intervals: ["3"] });
```

### 4. [`src/types/prompts.ts`](src/types/prompts.ts:17) — action link examples

**Przed (BASE_SYSTEM_PROMPT):**
```
- [[action:show-interval;root=A;interval=b3|b3]]
```

**Po (BASE_SYSTEM_PROMPT):**
```
- [[action:show-interval;root=A;intervals=b3|b3]]
- [[action:show-interval;root=A;intervals=b3,b5|b3 b5]]
```

Analogiczna zmiana w `LESSON_SYSTEM_PROMPT` (linia 45).

## Uwagi

- **Frontend** (`guitar-neck-ui`) musi dostosować się do nowego kontraktu — wysyłać `intervals: string[]` zamiast `interval: string`.
- **Action link format**: tablica interwałów w action linku będzie kodowana jako comma-separated values, np. `intervals=b3,b5`. Frontend musi to sparsować do `["b3", "b5"]`.
- **Brak zmian** w `agent.ts`, `lesson-guard.ts`, `routes/chat.ts` — zmiana dotyczy wyłącznie kontraktu i toola.