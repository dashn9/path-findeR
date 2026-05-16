# path-findeR

Takes a corpus of similar HTML pages, figures out what content matters, and returns stable CSS selectors for that content. No network requests for HTML — callers supply raw HTML.

## How it works

```
HTML input  ->  URL pattern detection  ->  Parser  ->  Analyzer  ->  AiParserBuilder  ->  Selector builder  ->  Manifest
                       |                                               ^                   |
                  (gate: min 2)                                        '--- validator -----'
```

1. **URL pattern detection** — compares 2+ source URLs to extract a common pattern (`/products/{}`) and identifies dynamic segments
2. **Parser** — parses raw HTML into a DOM tree, strips scripts/styles/comments, normalizes whitespace
3. **Analyzer** — removes excluded content (nav, ads, cookies, etc.), scores remaining nodes by text density, semantic tag type, and link density
4. **Semantic document builder** — converts scored nodes into a compact LLM-friendly format with gen_ids, squashed text, and attributes
5. **AiParserBuilder** — sends semantic documents to an LLM which identifies and labels content zones as `(label, gen_id)` pairs
6. **Selector builder** — derives CSS selectors from gen_ids at multiple specificity levels (ID, class, tag+class, structural path)
7. **Validator** — runs selectors against the full corpus, retries on failure, marks unresolved labels

## Architecture

```
CLI / Frontend  --HTTP-->  Service (Go)  --CGo/FFI-->  Core (Rust)
                              |
                     +--------+--------+
                     S3      Jobs     MongoDB
                   (corpus)  (state)  (manifests)
```

| Component | Language | Role |
|-----------|----------|------|
| `path-finder-core` | Rust | Parsing, analysis, selector logic, LLM adapters (Anthropic / OpenAI / OpenRouter). Shared lib with C FFI |
| `path-finder-service` | Go | Chi HTTP API, job orchestration, pluggable storage (S3 or local FS), MongoDB manifests |
| `path-finder-cli` | Rust | Thin CLI client (clap) over the service API |
| `frontend` | TypeScript (Next.js 16) | Web UI — Feed, History, Settings, Manifest with Inspector / Tester / Raw tabs |

## Requirements

- Rust 2024 edition
- Go 1.23+ with CGo enabled (requires a C toolchain on PATH — gcc / clang / MSVC)
- Node.js 20+ (frontend)
- MongoDB
- AWS S3 (or S3-compatible storage)
- Redis (optional, for stream-based feeding)

## Build

### Rust core + CLI

```bash
cargo build --release
```

This builds `libpath_finder_core.so` (or `.dylib`/`.dll`) and the `path-finder` CLI binary.

### Go service

```bash
# Build the Rust core first (the Go service links against it)
cargo build --release

cd path-finder-service
go mod tidy   # first time only — generates go.sum
go build -o path-finder-service ./cmd/server
```

### Frontend

```bash
cd frontend
cp .env.example .env.local   # first time only
npm install
npm run dev                  # http://localhost:3000
```

The frontend talks directly to the Go service. Set the base URL via `NEXT_PUBLIC_PATH_FINDER_URL` in `.env.local`, or override at runtime from the `/settings` screen. Default is `http://localhost:8000`.

## Running the service

The service loads `.env` from its working directory on startup. Process-level
env vars always override the file, so production deployments can ignore the
file and set vars directly. Override the file path with `ENV_FILE=path/to/env`.

```bash
cp .env.example .env       # first time only
./path-finder-service
```

Config is grouped by domain so credentials sit next to the thing they unlock —
AWS keys live on `S3Config`, model + key live on the chosen LLM adapter, etc.
See `.env.example` for the full set; the highlights:

| Group | Vars | Description |
|---|---|---|
| Server | `BIND_ADDR` | Listen address (default `0.0.0.0:8000`) |
| Storage | `STORAGE_ADAPTER`, `LOCAL_STORAGE_PATH` | `s3` (default) or `local`; local uses `./data/corpus` |
| S3 | `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `S3_ENDPOINT_URL`, `S3_FORCE_PATH_STYLE` | Blank creds fall back to the AWS SDK chain; endpoint + path-style cover MinIO / R2 / etc. |
| MongoDB | `MONGO_URI`, `MONGO_DB`, `MONGO_COLLECTION` | Manifest store |
| LLM | `AI_ADAPTER` (`anthropic`\|`openai`\|`openrouter`), plus the chosen provider's `*_API_KEY`, `*_BASE_URL`, `*_MODEL` | Only the active adapter's block needs to be set |
| Pipeline | `PIPELINE_*` knobs | Optional overrides; sensible defaults in code |

## CLI usage

Set `PATH_FINDER_URL` to point at the service (default: `http://localhost:8000`).

### Feed HTML pages

```bash
path-finder feed "https://shop.example.com/products/123" page1.html --job-id my-job
path-finder feed "https://shop.example.com/products/456" page2.html --job-id my-job
```

The pipeline triggers automatically when the minimum page count (default: 2) is reached.

### Force-trigger

```bash
path-finder force my-job
```

### Check status

```bash
path-finder status <parser-id>
```

### Retrieve manifest

```bash
path-finder get <parser-id>
```

### Regenerate a broken parser

```bash
path-finder regenerate <parser-id>
path-finder regenerate <parser-id> -l title -l price --force
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/feed` | Feed a `(url, html, job_id)` tuple |
| `POST` | `/force` | Force-trigger pipeline for a job |
| `GET` | `/parser/{id}` | Retrieve a parser manifest |
| `POST` | `/regenerate` | Request parser regeneration |
| `GET` | `/health` | Health check |

## Output format

```json
{
  "parser_id": "a3f9c1",
  "url_pattern": { "host": "shop.example.com", "pattern": "/products/{}" },
  "parser": {
    "article_title": {
      "selectors": [{ "css": "main > article > h1" }, { "css": ".post-header > h1" }],
      "concrete_types": ["Text"],
      "abstract_types": ["Title", "Headline"],
      "array": false,
      "unresolved": false
    },
    "price": {
      "selectors": [{ "css": "span.price" }],
      "concrete_types": ["Float"],
      "abstract_types": ["Price", "Currency"],
      "array": false,
      "unresolved": false
    },
    "tags": {
      "selectors": [{ "css": "ul.tags > li" }],
      "concrete_types": ["Text"],
      "abstract_types": ["Tag"],
      "array": true,
      "unresolved": false
    }
  }
}
```

## Configuration

All configurable via `Config` in `path-finder-core`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `ai_endpoint` | Anthropic API | LLM endpoint URL |
| `ai_model` | `claude-sonnet-4-20250514` | LLM model |
| `max_direct_kb` | 300 | Threshold (KB) for direct HTML feed vs semantic doc |
| `top_n_nodes` | 30 | Max nodes sent to LLM |
| `max_sentences` | 3 | Text squash: max sentences per node |
| `max_sentence_chars` | 500 | Text squash: max chars per sentence |
| `similarity_threshold` | 0.75 | Cluster similarity threshold for array detection |
| `max_retries` | 3 | Validator retry limit before marking unresolved |
| `output_format` | `json` | `json` or `toml` |
| `exclusions` | `[]` | Additional exclusion patterns (class/id fragments) |
| `min_pages` | 2 | Minimum pages required (floor: 2) |

## Running tests

### Rust (core + CLI)

```bash
cargo test --workspace
```

### Go (service)

```bash
cd path-finder-service
go test ./...
```

### Frontend

```bash
cd frontend
npm run lint       # eslint
npx tsc --noEmit   # type-check
```

## HTML feeders

Two implementations:

- **FunctionFeeder** — direct in-process feeding, used by the API endpoints
- **RedisStreamFeeder** — consumes `(url, html, job_id)` messages from a Redis stream; triggers the pipeline when page count reaches `min_pages` or `force()` is called

## Frontend

Next.js 16 (App Router) + React 19 + Tailwind v4 + `lucide-react`. Lives in `frontend/`.

Routes:

| Path | Screen |
|------|--------|
| `/feed` | Paste URL + HTML, watch the queue fill, optionally force-run |
| `/history` | Table of recent parser manifests (status, host, label count, unresolved, created) |
| `/parser/{id}` | Manifest detail with four tabs: **Manifest** (selector tree), **Inspector** (candidate scores, DOM context, cross-corpus validation grid, LLM rationale, activity log), **Test selectors** (run the manifest against pasted HTML in the browser), **Raw JSON** |
| `/settings` | `PATH_FINDER_URL` field + read-only view of the pipeline config |

Layout:

```
frontend/app/
  layout.tsx                      Geist + JetBrains Mono fonts, StoreProvider, AppShell chrome
  globals.css                     Tailwind v4 import + @theme tokens (warm-paper palette)
  page.tsx                        redirect → /feed
  feed/page.tsx
  history/page.tsx
  settings/page.tsx
  parser/[id]/page.tsx
  lib/
    types.ts                      ParserDoc, LabelDef, ParserTrace, etc.
    mockData.ts                   demo manifests + inspector traces
    store.tsx                     React Context: parsers, queue, toasts, mock handlers
    utils.ts                      cn(), fmtTime(), relTime()
  components/
    app-shell.tsx                 topbar + sidebar + toast region
    feed-screen.tsx, history-screen.tsx, settings-screen.tsx, manifest-screen.tsx
    ui/                           button, input, field, checkbox, badge, status-pill,
                                  selector-chip, toast, modal, tabs, json-block, empty-state
    inspector/                    run-inspector, dom-context, validation-grid, activity-log
    manifest/                     label-group, selector-tester, regenerate-modal
```

The mock store under `lib/store.tsx` simulates the service responses (toasts, status transitions on `force` / `regenerate`). Replace it with a real fetcher against the Go API to go live.

## License

Proprietary.
