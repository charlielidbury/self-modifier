# Limitations: In-Process Agent & HMR

The agent runs inside the Next.js dev server process. When files change, Next.js may reload modules or restart entirely, which can interrupt the agent mid-turn.

Session state is persisted to disk by the agent SDK (`~/.claude/projects/.../<session-id>.jsonl`), so completed turns are never lost. But an interrupted turn means partial work — some tool calls may have executed (files written, packages installed) while the response stream to the frontend is cut.

**Recovery:** The frontend can resume the session by ID. The agent picks up from the last completed message and can assess what was partially done.

## What triggers what

| Edit target | What happens | Agent interrupted? |
|---|---|---|
| `src/app/**/*.tsx` (pages, components) | Frontend-only HMR. Browser updates. | No |
| `src/app/**/page.tsx` (new pages) | Frontend-only HMR. New route appears. | No |
| `public/*` | Static file served immediately. | No |
| Any `.css` / Tailwind classes | Frontend-only HMR. | No |
| `src/app/api/chat/route.ts` | API route module reloads on next request. In-flight request may be killed. | Yes |
| `src/app/api/**/route.ts` (other API routes) | Only that route's module reloads. Chat route unaffected. | No |
| `src/lib/**`, `src/utils/**` | Depends on who imports it. If imported by the chat API route, that route reloads. | Maybe |
| `next.config.ts` | Full dev server restart. | Yes |
| `tailwind.config.ts` | PostCSS rebuilds. No server restart. | No |
| `tsconfig.json` | Full dev server restart. | Yes |
| `package.json` | No automatic restart, but often paired with `npm install`. | No |
| `npm install` / `npm uninstall` | Modifies `node_modules`. Can trigger full restart if Next.js detects dependency changes. | Yes |
| `.env` / `.env.local` | Full dev server restart. | Yes |

## Safe vs dangerous edits

**Always safe** (agent can do freely mid-conversation):
- Creating/editing frontend pages and components
- Creating new API routes (not the chat route)
- Writing data files, scripts, SQLite databases
- Running read-only bash commands

**Dangerous** (may kill the agent's current turn):
- Editing `src/app/api/chat/route.ts` or files it imports
- Editing `next.config.ts`, `tsconfig.json`, `.env`
- Running `npm install`

## Mitigation

The system prompt should instruct the agent to:
1. Batch dangerous edits together and do them last in a turn
2. Warn the user before making changes that will interrupt the session
3. Avoid editing the chat API route unless specifically asked

If the agent's turn is interrupted, the user sends a new message to resume. The agent SDK reloads the session from disk and continues.

## Future improvement

If this becomes a frequent problem, extract the agent into a separate long-lived process (see `initial-plan.md` option 2). The Next.js app becomes a pure frontend proxy and can restart freely without affecting the agent.
