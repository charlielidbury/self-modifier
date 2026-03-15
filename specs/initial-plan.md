# Self-Modifying App — Initial Plan

## What we're building

A Next.js app with a ChatGPT-style interface where the AI agent can modify the application's own source code. Powered by `@anthropic-ai/claude-agent-sdk`.

## Architecture

```
self-modifier/
  src/
    app/
      page.tsx                # Main layout: sidebar + chat
      api/
        chat/route.ts         # Stream agent responses (POST)
        sessions/route.ts     # List sessions (GET)
        sessions/[id]/route.ts # Get session messages (GET)
      layout.tsx              # Root layout
    lib/
      agent.ts                # claude-agent-sdk wrapper
      types.ts                # Shared event types
  package.json
  next.config.ts
  tsconfig.json
  tailwind.config.ts
```

## Frontend layout

```
+------------------+------------------------------------------+
| Sessions         | Chat                                     |
|                  |                                          |
| [+ New Agent]    |  [assistant] I'll edit the page...       |
|                  |    > Edit src/app/page.tsx                |
| > Session 1      |  [assistant] Done!                       |
| > Session 2      |                                          |
| > Session 3      |                                          |
|                  |                                          |
|                  |                                          |
|                  | [Type a message...            ] [Send]   |
+------------------+------------------------------------------+
```

### Sidebar

- Calls `GET /api/sessions` on mount → returns list of session IDs + metadata
- Backend uses `listSessions({ dir: process.cwd() })` from the agent SDK
- Each item shows session ID (truncated) or first user message as label
- Clicking a session loads its history via `GET /api/sessions/[id]`
- Backend uses `getSessionMessages(id, { dir: process.cwd() })` from the agent SDK
- "New Agent" button clears the chat and starts a fresh session

### Chat area

- Shows messages for the active session
- On send: `POST /api/chat` with `{ message: string, sessionId?: string }`
  - If `sessionId` provided → resumes that session
  - If omitted → starts a new session, returns new `sessionId` in the stream
- Reads response as NDJSON stream, renders incrementally

## API Routes

### `POST /api/chat`

Request: `{ message: string, sessionId?: string }`

Calls `query()` from agent SDK:
```ts
query({
  prompt: message,
  options: {
    cwd: process.cwd(),
    resume: sessionId,           // omitted for new sessions
    includePartialMessages: true, // enables streaming deltas
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
  }
})
```

Transforms SDK events into NDJSON stream:

| SDK event | Our event |
|---|---|
| `SystemMessage` (subtype: init) | `{ type: "session", sessionId: "..." }` |
| `stream_event` (content_block_delta, text_delta) | `{ type: "text", content: "..." }` |
| `AssistantMessage` with tool_use content | `{ type: "tool_use", tool: "Edit", input: {...} }` |
| `UserMessage` (tool results) | `{ type: "tool_result", tool: "Edit", summary: "..." }` |
| `ResultMessage` | `{ type: "done", sessionId: "..." }` |

### `GET /api/sessions`

Returns: `Array<{ id: string, label: string, createdAt: string }>`

Uses `listSessions({ dir: process.cwd() })`. Label derived from first user message.

### `GET /api/sessions/[id]`

Returns: session messages for rendering history.

Uses `getSessionMessages(id, { dir: process.cwd() })`.

## Agent wrapper (`lib/agent.ts`)

- System prompt: "You are an AI assistant embedded in a Next.js application. You can read and modify the application's source code, including the code that powers this very chat interface. The project root is your cwd. Do whatever the user asks."
- Async generator that yields our simplified event types
- Translates SDK message types → our stream protocol

## Shared types (`lib/types.ts`)

```ts
type StreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; content: string }
  | { type: "tool_use"; tool: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool: string; summary: string }
  | { type: "done"; sessionId: string };
```

Both the API route and the frontend import this. No Cap'n Web or extra RPC layer needed for now — a shared type file is sufficient for the PoC.

## Tech stack

- **Next.js 15** (App Router)
- **React 19**
- **@anthropic-ai/claude-agent-sdk** — agent with built-in file tools
- **Tailwind CSS v4** — minimal styling
- **TypeScript**

## Session management

Sessions are persisted to disk automatically by the agent SDK at:
```
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```

Where `<encoded-cwd>` replaces non-alphanumeric chars with `-`.

The frontend is stateless except for the current `sessionId`. On page load, it fetches the session list. On refresh, the current session can be reloaded from history. No in-memory state to lose.

**Flow:**
```
Frontend                         Backend
  |  POST {message, sessionId?}    |
  | ==============================> |  query({ resume: sessionId })
  |  <NDJSON stream>               |  SDK persists to disk
  | <============================== |
  |                                 |
  |  GET /api/sessions              |  listSessions()
  | ==============================> |
  |  <session list>                |
  | <============================== |
```

## Emergent patterns

A key property of this app: **we don't need to build features the agent can build for itself.** The PoC only needs the bare minimum chat interface and agent integration. Everything else is the agent's job.

Examples of things we do NOT build:
- **File upload** — user asks the agent to add file upload, it implements it
- **Database viewers** — agent builds these on demand
- **Auth, settings, themes** — agent can add any of these if asked
- **Better chat UI** — the agent can improve its own interface

The only things we must hand-build are the pieces the agent needs to exist in the first place: the chat UI, the streaming API route, and the agent SDK integration. Everything else is emergent.

## Open questions

- **`listSessions` / `getSessionMessages` exact return shapes**: Need to verify these match what we expect. The plan assumes they exist based on SDK docs.
- **HMR of API route**: If the agent edits `api/chat/route.ts`, the module reloads and in-flight requests may die. Session state on disk is safe, but the current stream is interrupted. See `specs/limitations.md`.
