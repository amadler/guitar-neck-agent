# guitar-neck-agent

Node backend for the Guitar Neck UI AI agent. Runs DeepAgents in its natural Node.js runtime, enabling stable HITL (Human-In-The-Loop) for interactive guitar lessons.

## Architecture

```
Angular SPA (guitar-neck-ui)          Node backend (guitar-neck-agent)
         │                                    │
         │  POST /api/chat (NDJSON stream)    │
         │──────────────────────────────────► │
         │  { type: 'message', text,          │
         │    threadId, domainState }          │
         │                                    │── createDeepAgent
         │  ◄── NDJSON stream:                │── tools → DomainCommand
         │  { type: 'token', text }           │── interruptOn
         │  { type: 'domain-command', cmd }   │── MemorySaver
         │  { type: 'interrupt' }             │
         │  { type: 'done' }                  │
         │                                    │
         │  domainService.execute(command)    │
         │  (local, async)                    │
```

## Key Design Decisions

- **Two repos**: `guitar-neck-ui` (Angular SPA on Cloudflare Workers) and `guitar-neck-agent` (Node on VPS)
- **Transport**: Fetch streaming with NDJSON (`application/x-ndjson`)
- **One endpoint**: `POST /api/chat` with `type: 'message' | 'resume'`
- **DomainCommand as contract**: Tools return serializable `DomainCommand` objects instead of executing them
- **DomainState snapshot**: Sent with every request (request-scoped, not stored in checkpoint)
- **No round-trip**: Node does not wait for Angular to execute commands. Flow: `DomainCommand → wait_for_user → next request with new snapshot`
- **Tonal.js stays in Angular**: Node agent has no access to music theory queries

## Getting Started

### Prerequisites

- Node.js 20+
- OpenRouter API key

### Installation

```bash
git clone <repo-url>
cd guitar-neck-agent
npm install
```

### Configuration

Copy `.env.example` to `.env` and fill in your OpenRouter API key:

```bash
cp .env.example .env
```

Required:
- `OPENROUTER_API_KEY` — Your OpenRouter API key

Optional:
- `OPENROUTER_MODEL` — Model name (default: `deepseek/deepseek-v4-flash`)
- `PORT` — Server port (default: `3001`)
- `CORS_ORIGIN` — CORS origin for development (default: `*`)

### Development

```bash
npm run dev
```

Starts the server with hot-reload via `tsx watch`.

### Production

```bash
npm run build
npm start
```

## API

### `POST /api/chat`

Sends a message to the AI agent and receives a streaming NDJSON response.

**Request body:**

```json
{
  "type": "message",
  "threadId": "uuid-123",
  "text": "pokaż C-dur",
  "domainState": { ... }
}
```

- `type`: `"message"` for new messages, `"resume"` for resuming after interrupt
- `threadId`: Unique conversation identifier
- `text`: Message text
- `domainState`: Current DomainState snapshot (request-scoped)

**Response (NDJSON stream):**

```
{"type":"token","text":"Oto C-dur..."}
{"type":"domain-command","command":{"type":"show-pattern","patternType":"scale","patternName":"major","rootNote":"C"}}
{"type":"interrupt","waitingForUser":true}
{"type":"done"}
```

Event types:
- `token` — Text token from the LLM
- `domain-command` — A DomainCommand for Angular to execute locally
- `interrupt` — Agent is waiting for user input (HITL)
- `error` — An error occurred
- `done` — Stream complete

### `GET /api/health`

Health check endpoint.

## Project Structure

```
src/
├── index.ts              # Express app entry point
├── agent.ts              # DeepAgents setup (createDeepAgent)
├── types/
│   └── contract.ts       # Shared types (DomainCommand, DomainState, etc.)
├── tools/
│   └── domain-tools.ts   # Agent tool definitions
└── routes/
    └── chat.ts           # POST /api/chat handler
```

## Deployment

Recommended: VPS (DigitalOcean, Hetzner) or Node platform (Railway, Fly.io).

Not compatible with Cloudflare Workers (needs full Node.js runtime for DeepAgents).

## Related

- [guitar-neck-ui](https://github.com/your-org/guitar-neck-ui) — Angular SPA frontend