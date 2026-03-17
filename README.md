# AutoQA

AI-driven fullstack web application that generates and executes browser test cases

The backend parses Axure HTML exports (or plain text requirements) into structured test steps stored in MySQL. During execution, the system reads these steps and drives a real browser through one of three engines. A MJPEG stream sends browser frames to the frontend via Chrome DevTools Protocol so users can watch execution in real time.

![demo](screenshots/demo1.gif)

---

## How It Works

### Phase 1 — Parse & Store
1. The user uploads an **Axure HTML export** or pastes requirement text.
2. The backend (`axureParseService.ts`) uses `cheerio` to traverse the DOM and extract interactive elements, labels, and page type (form vs. list) using heuristic rules.
3. The parsed context is sent to the LLM alongside retrieved business rules from a **Qdrant** vector store (RAG). The LLM returns a JSON object with test steps and expected results.
4. Steps are saved to MySQL as structured records.

### Phase 2 — Execute
5. The user selects a test case and an execution engine. The run enters the task queue.
6. For **MCP engine**: the backend connects to a `@playwright/mcp` subprocess via stdio. For each step, it sends the current DOM snapshot and the step text to the LLM, which returns a JSON browser command (e.g. `{ "name": "browser_click", "args": { "ref": "12" } }`). The MCP client forwards the command to the subprocess.
7. For **native Playwright engine**: the backend imports `playwright` directly, holds the `Page` object, and maps pre-parsed steps to Playwright API calls (click, fill, navigate) without LLM involvement at runtime.
8. For **Midscene engine**: same as native Playwright, but element location uses `@midscene/web`'s `PlaywrightAgent`, which identifies elements by natural-language description and screenshot rather than CSS/XPath selectors.
9. The browser's current frame is pushed to the frontend via a **CDP screencast stream** (for native Playwright and Midscene paths) or via MCP screenshot polling (for the MCP path). Logs are broadcast via WebSocket.

---

## Technical Highlights

### Multi-Engine Execution Routing
Each test case carries an `executionEngine` flag (`mcp | playwright | midscene`) that determines the runtime path. The three engines have fundamentally different behaviors: the MCP engine calls the LLM at every step to dynamically decide the next browser action based on the current page state, making it adaptive to unpredictable navigation. The native Playwright and Midscene engines execute a fixed, pre-parsed sequence without runtime LLM calls, making them faster and more deterministic. Midscene's distinct value is AI-based visual element location — useful when selectors are unstable or unavailable.

### Resource-Adaptive Concurrency Control
Rather than setting a fixed thread pool, the scheduler monitors OS-level metrics via Node.js built-in APIs and adjusts the global concurrency limit at runtime:

- **Memory** (`os.freemem() / os.totalmem()`): The primary signal. Chromium instances run as child processes invisible to `process.memoryUsage()`, so only OS-level free memory accurately reflects system pressure. When free memory drops below the danger threshold, concurrency hard-resets to 1 (circuit breaker).
- **Event Loop Lag** (`perf_hooks.monitorEventLoopDelay`): The p99 percentile lag reflects Node.js scheduler health and serves as a proxy for CPU pressure (especially on Windows, where `os.loadavg()` always returns `[0,0,0]`).
- **Hysteresis**: Scale-up and scale-down use different thresholds (e.g. >40% free to grow, <15% to cut) with a 5-second cooldown between adjustments, preventing oscillation near boundary values.

A second layer (`UserConcurrencyGuard`) caps each user's concurrent submissions at 2 via a promise-queue backpressure mechanism, preventing a single user from saturating the global pool.

### Multi-Layer Cache
The system caches at several levels to reduce redundant LLM calls:

| Cache | Key | Storage | TTL |
|-------|-----|---------|-----|
| Operation cache | step text + page element fingerprint | L1 memory Map + L2 `ai_operation_cache` table | 7 days |
| Assertion cache | assertion text + page fingerprint | L1 memory Map + L2 `ai_assertion_cache` table | 7 days |
| Element match cache | URL + selector + snapshot fingerprint | L1 memory Map + L2 `ai_element_cache` table | 24 hours |
| Post-click snapshot | per run | in-memory, attached to run state | 10 s, consumed once |
| MJPEG frame buffer | per runId | in-memory Map | until run ends |
| Midscene vision cache | task prompt (yaml) | file (`midscene_run/cache/*.cache.yaml`) | framework-managed |

The L1/L2 design ensures cache survives server restarts. L1 is hydrated from L2 on startup; dirty L1 entries are flushed to L2 periodically and on shutdown.

### CDP-Based Live Preview
For the native Playwright and Midscene paths, the backend holds a direct `Page` object and establishes a Chrome DevTools Protocol session via `page.context().newCDPSession(page)`. It subscribes to `Page.screencastFrame` events, which the browser pushes automatically after each rendered frame. Each frame (base64 JPEG) is immediately forwarded to connected HTTP clients as an MJPEG multipart stream. A `frameBuffer` per run stores the last frame so reconnecting clients receive an immediate image on connect. The MCP path (which does not expose a `Page` object) falls back to interval-based screenshot polling via the MCP `browser_screenshot` tool.

### Assertion Framework
A strategy-pattern `AssertionService` handles post-step verification. Five strategies are registered at startup: `ElementVisibility`, `TextContent`, `PageState`, `Popup`, and `FileDownload`. Each strategy receives a `VerificationContext` (page handle + expected value) and returns a typed pass/fail result.

### Human-in-the-loop Workflow
When a UI changes, the system supports batch-updating affected test cases: it runs a **dry-run** that generates a diff proposal for each affected case (LLM-computed JSON Patch), saves the proposals to a session, and lets the user review and selectively apply them. Before applying, the original steps are versioned in a `case_versions` table for rollback.

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Ant Design, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: MySQL 8.0+, Prisma ORM
- **Vector DB**: Qdrant (RAG knowledge base)
- **AI / LLM**: any OpenAI-compatible API
- **Browser automation**: Playwright, `@playwright/mcp`, `@midscene/web`
- **Queue**: p-queue

---

## Local Setup

**Prerequisites**: Node.js v18+, MySQL 8.0+, Docker (for Qdrant)

### Step 1 — Create the database
```sql
CREATE DATABASE autoQA CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Step 2 — Start Qdrant
```bash
docker run -d -p 6333:6333 -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant
```

### Step 3 — Configure environment
Create a `.env` file in the project root following `.env.example`

### Step 4 — Install and migrate
```bash
npm install
npx playwright install chromium
npx prisma migrate dev
npx tsx scripts/create-admin.ts
```

### Step 5 — Run
```bash
# Terminal 1
npm run dev:server

# Terminal 2
npm run dev:frontend
```

Open `http://localhost:5173`. Default login: `admin` / `admin`.

---

## Troubleshooting

- **"Can't reach database server"** — check that MySQL is running and `DATABASE_URL` matches your credentials.
- **"Qdrant connection refused"** — ensure the Docker container is up (`docker ps`).
- **Browser launches but pages time out** — increase `PLAYWRIGHT_TIMEOUT` in `.env`; MCP engine requires network access to the target site.
