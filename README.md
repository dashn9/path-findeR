# path-findeR

## What it solves

Writing CSS selectors for a new site is grunt work, and the selectors you hand-write today drift the moment the site re-templates. path-findeR takes that off your plate: feed it a handful of pages from the same template and it returns a stable selector manifest for the content that actually matters — title, price, body, images, whatever the LLM identifies as a meaningful zone.

The output is a JSON manifest keyed by `parser_id` that your scraper can load and use directly. When the site changes, regenerate from a fresh corpus; the API is the same.

## How it works

```
HTML input → URL pattern detection → parse → analyze + score → LLM labels → derive selectors → validate
                    │                                                            │
              (gate: min 2 pages)                                     (retry on miss, mark unresolved)
```

1. **URL pattern detection** compares 2+ source URLs to extract a common shape (`/products/{}`). Dynamic segments are recorded and used to deprioritize instance-specific text in the analyzer.
2. **Parser** turns each HTML page into a DOM tree, strips scripts/styles/comments, normalizes whitespace.
3. **Analyzer** drops obvious junk (nav, cookie banners, ads, etc.) and scores survivors by text density, semantic tag, and link density.
4. **Semantic doc builder** compacts the top-scored nodes into an LLM-friendly representation. Below `max_direct_kb` (default 300KB) the raw HTML goes through instead.
5. **LLM** identifies content zones and returns `(label, gen_id)` pairs plus similarity clusters. It never writes selectors — only points at nodes.
6. **Selector builder** derives CSS from each labeled gen_id at multiple specificity levels (ID, class, tag+class, structural path).
7. **Validator** runs every selector across the corpus, retries on miss, and marks labels `unresolved` when nothing holds.

## How to use it

### 1. Run the service

```bash
cp .env.example .env       # fill in API keys + storage choice
make run                   # builds the Rust core and starts the service on :7117
```

Other Makefile targets: `make build` (release artifacts), `make test` (Rust + Go), `make clean`.

`.env` highlights:

- `STORAGE_ADAPTER` — `s3` (default) or `local` (writes to `LOCAL_STORAGE_PATH`)
- `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — only needed when `STORAGE_ADAPTER=s3`
- `MONGO_URI`, `MONGO_DB` — where manifests are persisted
- `AI_ADAPTER` — `anthropic` | `openai` | `openrouter`; set the matching `*_API_KEY`

### 2. Feed pages

Pick a `job_id` you'll reuse for the corpus. Feed at least 2 pages from the same template:

```bash
# CLI
path-finder feed "https://shop.example.com/products/123" page1.html --job-id myshop
path-finder feed "https://shop.example.com/products/456" page2.html --job-id myshop

# or HTTP
curl -X POST http://localhost:7117/feed \
  -H 'content-type: application/json' \
  -d '{"url":"https://shop.example.com/products/123","html":"<html>…","job_id":"myshop"}'
```

The pipeline runs automatically once `min_pages` is reached (default 2). Force it early with `path-finder force myshop` or `POST /force`.

### 3. Get the manifest

```bash
path-finder get myshop
# or
curl http://localhost:7117/parser/myshop
```

Output:

```json
{
  "parser_id": "myshop",
  "url_pattern": { "host": "shop.example.com", "pattern": "/products/{}" },
  "parser": {
    "title": {
      "selectors": [{ "css": "main > article > h1.product-title" }, { "css": ".product-hero h1" }],
      "concrete_types": ["Text"],
      "abstract_types": ["Title", "Headline"],
      "array": false,
      "unresolved": false
    },
    "price":  { "selectors": [{ "css": ".price-now" }], "concrete_types": ["Float"], "array": false, "unresolved": false },
    "images": { "selectors": [{ "css": ".gallery img" }], "array": true, "unresolved": false }
  }
}
```

In your scraper, walk the `parser` map: try selectors in order, use `querySelectorAll` when `array: true`, fall back / log when `unresolved: true`.

### 4. Regenerate when a site changes

```bash
path-finder regenerate myshop                      # all labels
path-finder regenerate myshop -l price -l in_stock # just those two
path-finder regenerate myshop --force              # override the "newer pages exist" check
```

### 5. (Optional) Web UI

```bash
cd frontend && npm install && npm run dev
```

`http://localhost:3000` — Feed pages, browse history, inspect the manifest tree, test selectors against pasted HTML, and watch the run trace (candidate scores, cross-corpus validation grid, LLM rationale).
