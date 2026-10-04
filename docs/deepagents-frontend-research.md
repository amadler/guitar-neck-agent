# DeepAgents Frontend SDK — Research & Comparison

> **Source:** https://docs.langchain.com/oss/javascript/deepagents/frontend/overview
> **Date researched:** 2026-10-04
> **SDK packages:** `@langchain/react`, `@langchain/vue`, `@langchain/svelte`, `@langchain/angular`

---

## 1. Overview

The DeepAgents frontend SDK (v1) is a set of framework-specific packages that provide a **declarative, reactive stream abstraction** for building UIs that display real-time agent workflows. It is built on top of the LangGraph runtime and the same `useStream` API used by single-agent LangChain apps.

The SDK is available for four frontend frameworks:

| Package | Framework |
|---------|-----------|
| `@langchain/react` | React (hooks-based) |
| `@langchain/vue` | Vue (composables) |
| `@langchain/svelte` | Svelte (stores) |
| `@langchain/angular` | Angular (injectable services) |

### Architecture

```
┌─────────────────────────────────────────────────┐
│                  Frontend (useStream)            │
│  ┌─────────────┐  ┌──────────┐  ┌────────────┐ │
│  │ stream.     │  │ stream.  │  │ stream.    │ │
│  │ messages    │  │ subagents│  │ values     │ │
│  └─────────────┘  └──────────┘  └────────────┘ │
│         │               │              │         │
└─────────┼───────────────┼──────────────┼─────────┘
          │               │              │
          ▼               ▼              ▼
┌─────────────────────────────────────────────────┐
│              LangGraph API / Backend             │
│         createDeepAgent() / createAgent()        │
└─────────────────────────────────────────────────┘
```

The SDK connects to a LangGraph API server (typically at `http://localhost:2024` during development) and provides **structured projections** of the agent's state:

| Projection | Purpose |
|------------|---------|
| `stream.messages` | The coordinator conversation (AI + Human messages) |
| `stream.subagents` | Live discovery of specialist subagents (Deep Agents only) |
| `stream.values` | Shared state such as todos, plans, or any custom key the agent writes |
| `stream.isLoading` | Whether the agent is currently processing |
| Tool-call state | Rendering tool calls as rich UI cards with progress and results |
| Interrupts | Pausing for user approval or input without losing run state |

---

## 2. Key Features

### 2.1 Streaming (`useStream`)

The core primitive is `useStream<typeof agent>({ apiUrl, assistantId })`. It returns a reactive stream object that automatically updates as the agent processes:

```ts
import { useStream } from "@langchain/react";

const stream = useStream<typeof myAgent>({
  apiUrl: "http://localhost:2024",
  assistantId: "agent",
});

// Reactive — updates automatically
stream.messages   // Array of AI/Human messages
stream.isLoading  // boolean
```

**What it handles automatically:**
- Connecting to the LangGraph API
- Polling or SSE for stream updates
- Parsing messages, tool calls, and state changes
- Type-safe inference from the agent definition
- Reconnection and thread management

### 2.2 Tool Calling

The SDK provides `useToolCalls(stream)` and `useToolCalls(stream, subagent)` selector hooks that render tool calls as rich, type-safe UI cards with pending, completed, and failed states. Each tool call is automatically associated with the AI message that invoked it.

### 2.3 Interrupts (Human-in-the-Loop)

The SDK supports pausing agent execution for user input via the `interrupt` API. On the frontend, interrupts are surfaced through the stream state, allowing the UI to show a prompt and collect user input before resuming.

### 2.4 Subagent Streaming (Deep Agents)

For coordinator-worker architectures, the SDK exposes:
- `stream.subagents` — a map of `SubagentDiscoverySnapshot` objects
- `useMessages(stream, subagent)` — selector for a specific subagent's messages
- `useToolCalls(stream, subagent)` — selector for a specific subagent's tool calls

Each subagent has its own status (`running`, `complete`, `error`), name, and scoped message/tool-call streams.

### 2.5 Custom State (`stream.values`)

Agents can write arbitrary structured data to shared state, accessible via `stream.values`. This enables patterns like:
- **Todo lists** — `stream.values.todos` with `pending` → `in_progress` → `completed` transitions
- **Task plans** — structured plan objects
- **Sandbox metadata** — file paths, execution results

### 2.6 Sandbox / IDE UI

For coding agents, the SDK supports a three-panel IDE layout (file tree, code/diff viewer, chat) backed by a sandbox execution environment. The frontend syncs files in real time by watching tool calls (`write_file`, `edit_file`, `execute`) in the stream.

### 2.7 Markdown Messages

Messages are rendered with proper markdown formatting and streaming support out of the box.

### 2.8 Join & Rejoin Streams

The SDK supports reconnecting to a running agent session after page reload or tab switch without losing progress, via thread ID persistence.

---

## 3. What's Automatic vs Custom

### Handled Automatically by the SDK

| Feature | SDK handles |
|---------|-------------|
| **Stream connection** | Connecting to the LangGraph API, managing SSE/polling |
| **Message parsing** | Parsing AI/Human messages, tool calls, tool results |
| **Type inference** | Type-safe stream state from agent definition |
| **Reactive updates** | Automatic re-rendering when stream state changes |
| **Subagent discovery** | Detecting and exposing subagent snapshots |
| **Tool call lifecycle** | Tracking pending → complete → failed states |
| **Interrupt detection** | Surfacing interrupt state from the agent |
| **Thread management** | Creating threads, persisting thread IDs |
| **Reconnection** | Rejoining a running stream after page reload |
| **Error handling** | Surfacing agent errors to the UI |

### Requires Custom Implementation

| Feature | You build |
|---------|-----------|
| **UI layout** | Chat bubbles, subagent cards, todo list rendering |
| **Domain-specific tool cards** | Custom rendering for your domain tools (e.g., guitar neck visualizations) |
| **Interrupt UI** | Prompt dialogs, input forms for human-in-the-loop |
| **Custom state rendering** | How `stream.values` data is displayed (e.g., progress bars, task lists) |
| **Authentication** | Auth flow, session management, API key storage |
| **File sync logic** | For sandbox/IDE: watching tool calls and refreshing files |
| **Diff rendering** | Showing file diffs when the agent modifies code |
| **Progress persistence** | Saving progress to your database |
| **Error recovery UI** | Retry buttons, fallback messages |

---

## 4. Comparison: NDJSON Approach vs SDK

### Current NDJSON Approach (guitar-neck-agent)

The current implementation in [`src/routes/chat.ts`](src/routes/chat.ts) uses a custom NDJSON streaming protocol:

**Backend** ([`src/routes/chat.ts`](src/routes/chat.ts)):
```ts
const emit = (event: ChatResponseEvent) => {
  res.write(JSON.stringify(event) + "\n");
};

// ... after agent processes ...
emit({ type: "token", text: finalText });
emit({ type: "domain-command", command: { ... } });
emit({ type: "interrupt", waitingForUser: true });
emit({ type: "done" });
```

**Event types** ([`src/types/contract.ts`](src/types/contract.ts)):
```ts
type ChatResponseEvent =
  | { type: "token"; text: string }
  | { type: "domain-command"; command: DomainCommand }
  | { type: "interrupt"; waitingForUser: boolean }
  | { type: "error"; message: string }
  | { type: "done" };
```

**Frontend** reads line-by-line from an HTTP response stream, parsing each JSON line.

### Side-by-Side Comparison

| Dimension | NDJSON Approach | DeepAgents SDK |
|-----------|----------------|----------------|
| **Protocol** | Custom NDJSON over HTTP `res.write()` | Standardized LangGraph stream protocol (SSE/polling) |
| **Message model** | Custom `ChatResponseEvent` union type | Typed `AIMessage` / `HumanMessage` / `ToolMessage` from `langchain` |
| **Tool calls** | Emitted as `domain-command` events, manually tracked | First-class `ToolMessage` objects with lifecycle tracking |
| **Streaming tokens** | Batched — waits for full message, emits once | True token-by-token streaming via `message.text` async iterator |
| **Interrupts** | Custom `{ type: "interrupt", waitingForUser }` event | Built-in `interrupt()` API with automatic state surfacing |
| **Subagents** | Not supported (single agent) | First-class subagent discovery and scoped streams |
| **Custom state** | Not supported (only domain commands) | `stream.values` for arbitrary structured data |
| **Type safety** | Manual TypeScript union types | Auto-inferred from agent definition |
| **Reconnection** | Not supported (one-shot HTTP request) | Built-in via thread ID persistence |
| **Error handling** | Custom `{ type: "error" }` event | Structured error surfacing through stream |
| **Framework support** | Any (raw HTTP) | React, Vue, Svelte, Angular |
| **Dependencies** | None (raw HTTP) | Requires `@langchain/react` (or framework variant) + LangGraph backend |
| **Backend coupling** | Works with any backend that writes NDJSON | Requires LangGraph API server |
| **Real-time updates** | Manual — frontend reads line-by-line | Automatic reactive updates |
| **Domain commands** | Custom `domain-command` event type | Would need custom tool call rendering |

### Key Differences

1. **Token streaming**: The NDJSON approach batches the entire AI response into a single `{ type: "token", text: "..." }` event. The SDK supports true token-by-token streaming via `message.text` async iterators, enabling real-time character-by-character display.

2. **Tool call model**: In the NDJSON approach, domain commands are a custom event type that the frontend must parse and handle manually. In the SDK, tool calls are first-class `ToolMessage` objects with automatic lifecycle tracking (pending → complete → failed).

3. **State management**: The NDJSON approach is stateless — each request is a one-shot HTTP call. The SDK maintains a persistent stream connection with thread-based state, enabling reconnection and multi-turn context.

4. **Protocol**: NDJSON is a simple custom protocol. The SDK uses LangGraph's standardized stream protocol, which is more feature-rich but also more opinionated about the backend architecture.

---

## 5. Benefits of Adopting the SDK

### 5.1 Reduced Frontend Boilerplate

The SDK eliminates the need to:
- Write a custom NDJSON line-by-line parser
- Manually track tool call lifecycle states
- Build reconnection logic
- Manage thread creation and persistence
- Parse and type-check stream events

### 5.2 True Token Streaming

Instead of batching the full AI response, the SDK enables character-by-character streaming, providing a more responsive chat experience.

### 5.3 Type Safety

The SDK infers stream types from the agent definition, eliminating the need to manually maintain `ChatResponseEvent` union types and ensuring frontend-backend contract alignment.

### 5.4 Subagent Support

If the agent is upgraded to a coordinator-worker architecture (e.g., a research agent that delegates to specialist subagents), the SDK provides first-class subagent UI patterns without any frontend protocol changes.

### 5.5 Custom State

The `stream.values` mechanism allows the agent to expose arbitrary structured data (todos, plans, progress) that the frontend can render with custom UI components, without defining new event types.

### 5.6 Reconnection & Resilience

Thread-based state persistence means users can reload the page or switch tabs without losing the agent's context. The NDJSON approach loses all state on page reload.

### 5.7 Framework Integration

The SDK provides idiomatic integrations for React, Vue, Svelte, and Angular, with hooks, composables, stores, and injectables that fit naturally into each framework's patterns.

### 5.8 Production Patterns

The SDK documentation includes production deployment patterns for:
- Authentication and session management
- Rate limiting and error handling
- Data privacy and guardrails
- Multi-tenant sandbox isolation
- LangSmith deployment integration

---

## 6. Migration Considerations

### 6.1 Backend Changes Required

The current backend uses Express with `res.write()` to stream NDJSON. The SDK requires a **LangGraph API server** (typically `langgraph dev` or a LangSmith deployment). This means:

- The Express chat route at [`src/routes/chat.ts`](src/routes/chat.ts) would be replaced by the LangGraph API
- The agent creation in [`src/agent.ts`](src/agent.ts) already uses `createDeepAgent` from `deepagents`, which is compatible
- Custom domain tools in [`src/tools/domain-tools.ts`](src/tools/domain-tools.ts) would continue to work as-is
- The `emitCommand` callback pattern would need to be adapted — instead of writing to `res.write()`, domain commands would be returned as tool results and rendered on the frontend via `useToolCalls`

### 6.2 Frontend Changes Required

| Current | SDK Equivalent |
|---------|----------------|
| Custom `AgentApiService.chat()` with NDJSON parsing | `useStream()` / `injectStream()` |
| Manual `ChatResponseEvent` type handling | Auto-inferred stream types |
| Custom interrupt event handling | Built-in interrupt API |
| Manual thread ID management | Automatic via `onThreadId` callback |
| Custom error event handling | Structured stream error surfacing |

### 6.3 Domain Command Adaptation

The biggest migration challenge is the **domain command pattern**. Currently:

1. Agent calls a tool → tool calls `ctx.emitCommand(command)` → backend writes `{ type: "domain-command", command }` → frontend parses and renders

With the SDK, this would become:

1. Agent calls a tool → tool returns a result → the result appears as a `ToolMessage` in the stream → frontend uses `useToolCalls(stream)` to render custom tool call cards

The domain commands (show-pattern, start-exercise, etc.) would need corresponding **custom tool call renderers** on the frontend that interpret the tool results and trigger the appropriate UI actions (showing a scale on the fretboard, starting an exercise, etc.).

### 6.4 Incremental Migration Path

A possible incremental approach:

1. **Phase 1 — SDK on frontend, NDJSON on backend**: Replace the frontend's NDJSON parser with the SDK's `useStream`, but keep the Express backend writing NDJSON. This requires an adapter layer.

2. **Phase 2 — LangGraph API server**: Deploy the agent as a LangGraph API server alongside the Express backend. Route chat requests to the LangGraph API.

3. **Phase 3 — Domain command migration**: Convert domain commands to typed tool results with custom frontend renderers.

4. **Phase 4 — Remove Express chat route**: Once all functionality is migrated, remove the NDJSON streaming code.

### 6.5 Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Backend coupling** | SDK requires LangGraph API server | Already using `createDeepAgent` — compatible |
| **Domain command pattern** | Core interaction model needs redesign | Can be adapted to tool call renderers |
| **Frontend framework** | Angular support may lag behind React | Check `@langchain/angular` package status |
| **Learning curve** | Team needs to learn SDK patterns | Well-documented with interactive examples |
| **Dependency** | Adds `@langchain/react` dependency | Stable, maintained by LangChain team |

---

## 7. Summary

The DeepAgents frontend SDK provides a **richer, more standardized streaming protocol** compared to the custom NDJSON approach, with built-in support for:

- **Reactive stream state** with automatic updates
- **First-class tool calls** with lifecycle tracking
- **Subagent discovery** for coordinator-worker architectures
- **Custom state** via `stream.values`
- **Thread persistence** for reconnection
- **Type-safe inference** from agent definitions

The main trade-off is **increased coupling to the LangGraph ecosystem** — the SDK requires a LangGraph API server rather than working with any HTTP backend. For the guitar-neck-agent, which already uses `createDeepAgent` from `deepagents`, this coupling is already present on the backend, making the SDK a natural fit.

The **domain command pattern** is the most significant architectural difference and would require the most migration effort. However, it can be adapted to the SDK's tool call rendering model without losing functionality.