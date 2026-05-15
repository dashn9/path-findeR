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
CLI (Rust)  --HTTP-->  Service (Go)  --CGo/FFI-->  Core (Rust)
                           |
                  +--------+--------+
                  S3      Jobs     MongoDB
                (corpus)  (state)  (manifests)
```

| Component | Language | Role |
|-----------|----------|------|
| `path-finder-core` | Rust | All parsing, analysis, and selector logic (shared lib with C FFI) |
| `path-finder-service` | Go | Chi HTTP API, job orchestration, S3 + MongoDB storage |
| `path-finder-cli` | Rust | Thin CLI client (clap) over the service API |

## Requirements

- Rust 2024 edition
- Go 1.23+
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
go build -o path-finder-service ./cmd/server
```

## Running the service

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_BUCKET` | `path-finder-corpus` | S3 bucket for HTML corpus |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGO_DB` | `path_finder` | MongoDB database name |
| `BIND_ADDR` | `0.0.0.0:8000` | Service listen address |
| `AI_ENDPOINT` | `https://api.anthropic.com/v1/messages` | LLM endpoint URL |
| `AI_MODEL` | `claude-sonnet-4-20250514` | LLM model |
| `ANTHROPIC_API_KEY` | (none) | API key for the LLM |

```bash
./path-finder-service
```

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

## HTML feeders

Two implementations:

- **FunctionFeeder** — direct in-process feeding, used by the API endpoints
- **RedisStreamFeeder** — consumes `(url, html, job_id)` messages from a Redis stream; triggers the pipeline when page count reaches `min_pages` or `force()` is called

## License

Proprietary.
