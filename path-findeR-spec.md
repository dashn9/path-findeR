# path-findeR spec

**Languages:** Rust (core + CLI) · Go (service) · **Status:** Draft

---

## What it does

Takes a corpus of similar HTML pages, figures out what content matters, and returns stable CSS selectors for that content. No network requests — callers supply raw HTML.

A minimum of 2 pages is required. path-findeR compares their source URLs to detect the URL pattern, identifies dynamic segments, and uses that pattern as part of the parser's identity.

---

## Pipeline

```
HTML input  →  URL pattern detection  →  Parser  →  Analyzer  →  AiParserBuilder  →  Selector builder  →  Manifest
                       |                                               ↑                   |
                  (gate: min 2)                                        └─── validator ──────┘
```

---

## Modules

### URL pattern detection

**Prerequisite gate** — the pipeline refuses to start if fewer than 2 HTML pages with source URLs are submitted. With 2+ URLs, path-findeR compares them to extract a common pattern using `{}` position markers.

Examples:
- `shop.example.com/products/123` + `shop.example.com/products/456` → `shop.example.com/products/{}`
- `example.com/blog/2024/intro` + `example.com/blog/2024/update` → `example.com/blog/2024/{}`

Dynamic segments are marked with `{}` — simple position markers with no naming required. The detected pattern and host are stored in the manifest. The dynamic segment values extracted from each URL are used to flag nodes whose text matches those values — those nodes are instance-specific and deprioritized by the Analyzer.

### Parser

Parses raw HTML into a DOM tree using `scraper`. Strips scripts, styles, and comments. Normalizes whitespace. Outputs a `ParsedPage`.

### Semantic document builder

Before the AiParserBuilder is called, each `ParsedPage` is converted into a compact, LLM-friendly semantic document — a flat node-leaf structure where every node carries its tag name, all attributes, a gen_id, and squashed text content. This document is what the LLM reasons over.

**Gen ID:** Every node is assigned a stable generated ID at parse time. This is the primary key the LLM uses to refer to nodes. After the LLM returns `(label, gen_id)` pairs, Rust uses the gen_id to look up the node and derive the CSS selector deterministically. The LLM never generates selectors.

**Text squashing:** Each node's text content is reduced before being included in the semantic document:
- Maximum 3 sentences per node (configurable via `max_sentences`)
- If more than 3 sentences exist, sentences are sampled at equal distance — first, last, and evenly spaced between
- Each surviving sentence is truncated to a maximum of 500 characters (configurable via `max_sentence_chars`), cut at the nearest word boundary

**Direct feed vs. semantic document:** If the total HTML corpus is under 300KB (configurable via `max_direct_kb`), the raw HTML is fed directly to the LLM without building semantic documents. Above this threshold the semantic document representation is used instead.

### Analyzer

Strips obviously useless content from the parsed DOM before scoring. A node is discarded if it is empty, purely structural with no meaningful text, or matches the exclusion list. Everything that survives is scored by content importance using signals: text density, semantic tag type, and link density. Outputs a `ScoredTree`.

### Exclusion list

A set of patterns — tags, class/id fragments, and structural signatures — that are never surfaced as selector targets. Built-in exclusions:

**Tag-based:** `<nav>`, `<iframe>`, `<script>`, `<style>`, `<noscript>`

**Pattern-based (class/id/role signals):** cookie consent, GDPR notices, chat widgets, social share bars, newsletter signup forms, breadcrumbs, pagination controls, print/share/save buttons, author bio footers, site-wide alert/announcement bars, comment sections, related/recommended content rails, ad slots, sponsored content blocks, sticky headers, skip-to-content links, language/region selectors, search bars.

The exclusion list is fully extensible — callers can append custom patterns via config. Excluded nodes are stripped before scoring and never appear in the semantic document.

### AiParserBuilder

Receives the semantic documents (or raw HTML if under threshold) and calls the LLM once per corpus. The LLM is asked to:

1. Identify and label content zones, returning `(label, gen_id)` per zone
2. Report clusters of gen_ids that represent similar content, along with a similarity score

Similarity grouping is used to detect array candidates. The similarity threshold defaults to `0.75` (configurable via `similarity_threshold`). Rust owns all selector generation — the LLM only identifies and labels nodes.

### Array detection

If any selector derived from a gen_id matches more than one node on a page, that label is immediately tagged as an array. Additionally, gen_id clusters returned by the LLM with similarity at or above the threshold are also candidates for array tagging. Array labels signal to the caller that `query_all` should be used rather than `query`.

### Selector builder

For each `(label, gen_id)` pair, Rust derives CSS candidates at multiple specificity levels in order of preference: ID-based (`#title`), semantic class (`.article-title`), tag + class (`h1.headline`), structural path (`main > article > h1`). Prefers selectors that are neither too broad nor too brittle.

**Selector divergence:** When no single selector passes validation across the full corpus, the builder partitions the corpus into groups and emits one `Selector` per group. The caller tries each selector in order until one matches.

### Validator

Runs every selector against the full corpus. Failures feed back into the analyzer for re-scoring. After `max_retries` failed iterations (default: 3) a label is marked `unresolved`.

---

## Value types

Each `Parser` carries a `concrete_types` array and an optional `abstract_types` array describing what the selector value is expected to be. `concrete_types` defaults to `[Text]` when undetermined.

**Concrete types** (data format only): `Text`, `Integer`, `Float`, `Boolean`

**Abstract types** (semantic meaning): `Date`, `DateTime`, `Time`, `Duration`, `Url`, `Email`, `PhoneNumber`, `ImageUrl`, `VideoUrl`, `Color`, `Currency`, `Percentage`, `Title`, `Headline`, `Byline`, `Author`, `Description`, `Summary`, `Price`, `Rating`, `ReviewCount`, `ProductName`, `Category`, `Tag`, `Label`, `Badge`, `Status`, `Address`, `PostalCode`, `GeoCoordinate`, `Language`, `Identifier`, `Count`, `Rank`, `Score`

---

## Broken parser / regeneration

A **parser** is the full selector manifest produced from a corpus run, identified by a `parser_id`. Callers can report a parser as broken by submitting a `RegenerationRequest`.

**Payload:**
- `parser_id` — the manifest to regenerate
- `labels` — specific labels to regenerate, or `All`
- `force` — default `false`

**Behaviour:**
- If HTML pages exist that were processed *after* this parser was generated → refuse and report, unless `force=true`
- If no newer pages exist, or `force=true` → re-run the full pipeline scoped to the specified labels (or all labels if `All`)

The intent of the refusal is to avoid regenerating a parser from a stale HTML context. If newer pages have been processed, those pages likely represent a structural change in the site — regeneration should happen from the latest corpus, not the old one.

---

## Output

```json
{
  "parser_id": "a3f9c1",
  "url_pattern": { "host": "shop.example.com", "pattern": "/products/{}" },
  "parser": {
    "article_title": {
      "selectors": ["main > article > h1", ".post-header > h1"],
      "concrete_types": ["Text"],
      "abstract_types": ["Title", "Headline"],
      "array": false,
      "unresolved": false
    },
    "price": {
      "selectors": ["span.price"],
      "concrete_types": ["Float"],
      "abstract_types": ["Price", "Currency"],
      "array": false,
      "unresolved": false
    },
    "tags": {
      "selectors": ["ul.tags > li"],
      "concrete_types": ["Text"],
      "abstract_types": ["Tag"],
      "array": true,
      "unresolved": false
    }
  }
}
```

---

## Key types

```rust
/// A single node in the semantic document, representing one DOM element.
/// gen_id is stable within a corpus run and is the key the LLM uses to
/// identify nodes. Rust derives CSS selectors from gen_id — the LLM never
/// generates selectors directly.
/// score is a 0.0–1.0 importance rating — higher scored nodes are prioritized
/// when building the compact representation sent to the AiParserBuilder.
pub struct SemanticNode {
    pub gen_id: String,
    pub tag: String,
    pub attributes: HashMap<String, String>,
    pub text: String,          // squashed: max N sentences, each max M chars
    pub score: f32,
}

/// A CSS selector variant. Multiple variants exist when the same content
/// zone uses different markup across page templates. The caller tries
/// each in order until one matches.
pub struct Selector {
    pub css: String,
}

/// Raw data format of the selector value. Defaults to Text when undetermined.
pub enum ConcreteType {
    Text, Integer, Float, Boolean,
}

/// Semantic meaning of the selector value.
pub enum AbstractType {
    Date, DateTime, Time, Duration,
    Url, Email, PhoneNumber, ImageUrl, VideoUrl,
    Color, Currency, Percentage,
    Title, Headline, Byline, Author, Description, Summary,
    Price, Rating, ReviewCount, ProductName, Category,
    Tag, Label, Badge, Status, Address, PostalCode,
    GeoCoordinate, Language, Identifier, Count, Rank, Score,
}

/// The final output for a single content label.
/// array=true means query_all should be used — the selector returns
/// multiple nodes per page by design.
/// concrete_types describes the raw data format(s) — always present, defaults to [Text].
/// abstract_types describes semantic meaning(s) — optional, may be empty.
pub struct Parser {
    pub label: String,
    pub selectors: Vec<Selector>,
    pub concrete_types: Vec<ConcreteType>,
    pub abstract_types: Vec<AbstractType>,
    pub array: bool,
    pub unresolved: bool,
}

/// The detected URL pattern for the corpus.
/// Dynamic segments are marked with {} — no named params, just position markers.
/// e.g. host: "shop.example.com", pattern: "/products/{}/reviews/{}"
/// Dynamic segment values per page are extracted and used to deprioritize
/// instance-specific nodes in the Analyzer.
pub struct UrlPattern {
    pub host: String,                 // e.g. "shop.example.com"
    pub pattern: String,              // e.g. "/products/{}/reviews/{}"
}

/// Request to regenerate a broken parser.
pub struct RegenerationRequest {
    pub parser_id: String,
    pub labels: RegenerationScope,
    pub force: bool,
}

pub enum RegenerationScope {
    All,
    Labels(Vec<String>),
}
```

---

## Config

```rust
pub struct Config {
    pub ai_endpoint: String,
    pub ai_model: String,
    pub max_direct_kb: usize,        // threshold for direct feed vs semantic doc (default: 300)
    pub top_n_nodes: usize,          // nodes sent to AI (default: 30)
    pub max_sentences: usize,        // text squash sentence limit (default: 3)
    pub max_sentence_chars: usize,   // per-sentence char limit (default: 500)
    pub similarity_threshold: f32,   // array grouping threshold (default: 0.75)
    pub max_retries: usize,          // validator retry limit (default: 3)
    pub output_format: Format,       // Json | Toml
    pub exclusions: Vec<String>,     // additional exclusion patterns
    pub min_pages: usize,            // minimum pages required (default: 2, not configurable below 2)
}
```

---

## System design

### Components

- `path-finder-core` — Rust library (`cdylib` + `rlib`), all parsing/analysis/selector logic, exposes C FFI
- `path-finder-service` — Go (Chi), HTTP API, job orchestration, storage, calls Rust core via CGo
- `path-finder-cli` — Rust (clap), thin HTTP client over the service API

```
CLI (Rust)  ──HTTP──→  Service (Go)  ──CGo/FFI──→  Rust core (cdylib)
                           │
                  ┌────────┼────────┐
                  S3      Jobs     MongoDB
                (corpus)  (state)  (manifests)
```

---

### Rust core boundary (C FFI)

A single entry point exposed via `extern "C"`. Takes JSON strings for pages and config, returns a heap-allocated JSON string with the manifest. The caller must free the returned string. All internal modules are unexposed.

```c
// path_finder_core.h

// Run the pipeline. Returns heap-allocated JSON manifest, or NULL on error.
char* pfr_run(const char* pages_json, const char* config_json);

// Free a string returned by pfr_run.
void pfr_free(char* ptr);

// Get the last error message (thread-local). NULL if no error.
const char* pfr_last_error(void);
```

Go calls via CGo:

```go
// #cgo LDFLAGS: -lpath_finder_core
// #include "path_finder_core.h"
import "C"

func RunPipeline(pages [][2]string, config PipelineConfig) (json.RawMessage, error) {
    // marshal pages + config to JSON, call C.pfr_run, unmarshal result
}
```

---

### HTML feeder

An interface for feeding `(url, html)` pairs into the system. Two implementations:

**Redis stream** — consumes messages off a Redis stream. Each message is a single `(url, html)` pair. Pages accumulate per stream group until the min page count is hit, at which point a pipeline run is triggered automatically. The caller can also force a trigger at any count explicitly.

**Function feeder** — direct in-process feeding for API use. Same accumulation logic, same trigger conditions.

```go
type FunctionFeeder struct { ... }
func (f *FunctionFeeder) Feed(ctx context.Context, url, html, jobID string) error
func (f *FunctionFeeder) Force(ctx context.Context, jobID string)

type RedisStreamFeeder struct { ... }
func (f *RedisStreamFeeder) Start(ctx context.Context) error
func (f *RedisStreamFeeder) Feed(ctx context.Context, url, html, jobID string) error
func (f *RedisStreamFeeder) Force(ctx context.Context, jobID string)
```

---

### Storage

**HTML corpus — AWS S3**

One object per page, stored under a `job_id` prefix. The source URL is stored as object metadata so it can be retrieved alongside the HTML without a separate index.

```
s3://bucket/{job_id}/{page_index}.html
  metadata: { "url": "https://shop.example.com/products/123" }
```

Interface:

```go
type CorpusStore struct { ... }
func (s *CorpusStore) Put(ctx context.Context, jobID string, index int, url, html string) error
func (s *CorpusStore) GetAll(ctx context.Context, jobID string) ([][2]string, error)
func (s *CorpusStore) Delete(ctx context.Context, jobID string) error
```

**Parser manifests — MongoDB**

One document per manifest. Embeds job metadata alongside the parser output.

```json
{
  "_id": "a3f9c1",
  "job_id": "a3f9c1",
  "status": "done",
  "created_at": "...",
  "completed_at": "...",
  "error": null,
  "url_pattern": { "host": "shop.example.com", "pattern": "/products/{}" },
  "parser": { ... }
}
```

Interface:

```go
type ParserStore struct { ... }
func (s *ParserStore) Save(ctx context.Context, doc *ManifestDoc) error
func (s *ParserStore) Get(ctx context.Context, parserID string) (*ManifestDoc, error)
func (s *ParserStore) UpdateStatus(ctx context.Context, parserID string, status JobStatus, errMsg *string) error
func (s *ParserStore) UpdateResult(ctx context.Context, parserID string, result json.RawMessage) error
```

---

### Job lifecycle

```
feed(url, html) × N
       │
  min_pages hit or force()
       │
       ▼
  job created → corpus fetched from S3 → Rust core invoked via CGo FFI
       │
       ├── success → manifest saved to MongoDB → status: done
       └── failure → error saved to MongoDB   → status: failed
```
