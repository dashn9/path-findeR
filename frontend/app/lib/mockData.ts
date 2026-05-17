import type { ParserDoc, PipelineConfig, ParserTrace } from "./types";

export const MOCK_PARSERS: ParserDoc[] = [
  {
    _id: "a3f9c1",
    job_id: "a3f9c1",
    status: "done",
    created_at: "2026-05-15T14:02:11Z",
    completed_at: "2026-05-15T14:02:48Z",
    error: null,
    url_pattern: { host: "shop.example.com", pattern: "/products/{}" },
    pages_seen: 6,
    parser: {
      title: {
        selectors: [
          { css: "main > article > h1.product-title" },
          { css: ".product-hero h1" },
        ],
        concrete_types: ["Text"],
        abstract_types: ["Title", "Headline"],
        array: false,
        unresolved: false,
      },
      price: {
        selectors: [
          { css: "main > article .price-now" },
          { css: '.product-hero span[itemprop="price"]' },
        ],
        concrete_types: ["Float"],
        abstract_types: ["Price"],
        array: false,
        unresolved: false,
      },
      images: {
        selectors: [{ css: ".gallery img" }],
        concrete_types: ["Text"],
        abstract_types: ["Url"],
        array: true,
        unresolved: false,
      },
      description: {
        selectors: [{ css: ".product-description" }, { css: "#desc" }],
        concrete_types: ["Text"],
        abstract_types: ["Description"],
        array: false,
        unresolved: false,
      },
      sku: {
        selectors: [{ css: "[data-sku]" }],
        concrete_types: ["Text"],
        abstract_types: ["Identifier"],
        array: false,
        unresolved: true,
      },
      in_stock: {
        selectors: [{ css: ".stock-badge.in-stock" }],
        concrete_types: ["Boolean"],
        abstract_types: ["Availability"],
        array: false,
        unresolved: true,
      },
    },
  },
  {
    _id: "7c1e22",
    job_id: "7c1e22",
    status: "running",
    stage: 2,
    created_at: "2026-05-15T15:11:03Z",
    completed_at: null,
    error: null,
    url_pattern: { host: "blog.example.org", pattern: "/posts/{}" },
    pages_seen: 4,
    parser: null,
  },
  {
    _id: "b80f4d",
    job_id: "b80f4d",
    status: "done",
    created_at: "2026-05-14T09:34:00Z",
    completed_at: "2026-05-14T09:34:32Z",
    error: null,
    url_pattern: { host: "news.example.io", pattern: "/article/{}" },
    pages_seen: 5,
    parser: {
      headline: { selectors: [{ css: "article header h1" }], concrete_types: ["Text"], abstract_types: ["Headline"], array: false, unresolved: false },
      byline: { selectors: [{ css: ".byline .author" }], concrete_types: ["Text"], abstract_types: ["Author"], array: false, unresolved: false },
      published_at: { selectors: [{ css: "time[datetime]" }], concrete_types: ["Text"], abstract_types: ["Datetime"], array: false, unresolved: false },
      body: { selectors: [{ css: "article .body p" }], concrete_types: ["Text"], abstract_types: ["Body"], array: true, unresolved: false },
    },
  },
  {
    _id: "4d2a91",
    job_id: "4d2a91",
    status: "failed",
    fail_stage: 1,
    created_at: "2026-05-13T17:20:10Z",
    completed_at: "2026-05-13T17:20:14Z",
    error: "minimum pages not reached after timeout",
    url_pattern: { host: "docs.example.dev", pattern: "/guide/{}" },
    pages_seen: 1,
    parser: null,
  },
];

export const MOCK_CONFIG: PipelineConfig = {
  ai_endpoint: "https://api.openai.com/v1",
  ai_model: "gpt-4o-mini",
  max_direct_kb: 300,
  top_n_nodes: 30,
  max_sentences: 3,
  max_sentence_chars: 500,
  similarity_threshold: 0.75,
  max_retries: 3,
  output_format: "json",
  exclusions: ["nav", "footer", ".cookie-banner"],
  min_pages: 2,
};

export const PATH_FINDER_URL_DEFAULT = "http://localhost:7117";

export const MOCK_TRACES: Record<string, ParserTrace> = {
  a3f9c1: {
    activity: [
      { t: "14:02:11.402", kind: "feed/accepted", payload: "url=…/87423  size=12.4kb" },
      { t: "14:02:11.798", kind: "feed/accepted", payload: "url=…/19022  size=11.2kb" },
      { t: "14:02:12.014", kind: "feed/accepted", payload: "url=…/40911  size=12.0kb" },
      { t: "14:02:12.380", kind: "feed/accepted", payload: "url=…/55214  size=12.9kb" },
      { t: "14:02:12.612", kind: "feed/accepted", payload: "url=…/61803  size=12.1kb" },
      { t: "14:02:12.901", kind: "feed/accepted", payload: "url=…/77502  size=11.7kb" },
      { t: "14:02:13.044", kind: "pattern/detected", payload: "host=shop.example.com  pattern=/products/{}" },
      { t: "14:02:13.221", kind: "parse/done", payload: "nodes=412  median=387  σ=21" },
      { t: "14:02:13.612", kind: "score/top_n", payload: "n=30  threshold=0.62" },
      { t: "14:02:14.880", kind: "llm/labelled", payload: "labels=6  model=gpt-4o-mini  tokens=2,418" },
      { t: "14:02:15.402", kind: "selectors/derived", payload: "count=10  multi=2" },
      { t: "14:02:15.602", kind: "validate/start", payload: "pages=6  labels=6" },
      { t: "14:02:16.244", kind: "validate/match", payload: "label=title           ok=6/6" },
      { t: "14:02:16.260", kind: "validate/match", payload: "label=price           ok=6/6" },
      { t: "14:02:16.281", kind: "validate/match", payload: "label=images          ok=6/6" },
      { t: "14:02:16.304", kind: "validate/match", payload: "label=description     ok=5/6" },
      { t: "14:02:16.328", kind: "validate/miss", payload: "label=sku             ok=3/6  unresolved" },
      { t: "14:02:16.351", kind: "validate/miss", payload: "label=in_stock        ok=2/6  unresolved" },
      { t: "14:02:16.612", kind: "emit/manifest", payload: "parser_id=a3f9c1  bytes=2,108" },
      { t: "14:02:16.788", kind: "done", payload: "duration=5.39s  unresolved=2" },
    ],
    pages: [
      { url: "https://shop.example.com/products/87423", short: "/87423" },
      { url: "https://shop.example.com/products/19022", short: "/19022" },
      { url: "https://shop.example.com/products/40911", short: "/40911" },
      { url: "https://shop.example.com/products/55214", short: "/55214" },
      { url: "https://shop.example.com/products/61803", short: "/61803" },
      { url: "https://shop.example.com/products/77502", short: "/77502" },
    ],
    labels: {
      title: {
        rationale:
          'h1 in <article> appears in 6/6 sampled pages. Class `product-title` is consistent. Sibling text resembles a product noun phrase ("Aeropress Go", "Hario V60", …). Stable across the corpus.',
        candidates: [
          { score: 0.97, css: "main > article > h1.product-title", note: "consistent across 6/6 pages" },
          { score: 0.91, css: ".product-hero h1", note: "fallback — matches when hero variant used" },
          { score: 0.74, css: "article h1", note: "matches but ambiguous in /blog/" },
          { score: 0.48, css: "h1", note: "too broad — picks up nav h1 on /55214" },
          { score: 0.22, css: '[itemprop="name"]', note: "present on 2/6 pages only" },
        ],
        chosen: 0,
        validation: [[1,1,1,1,1,1],[1,1,0,1,0,1],[1,1,1,1,1,1],[0,0,1,1,1,1],[0,1,0,0,1,0]],
        dom: [
          { i: 0, t: "<main>" },
          { i: 1, t: '  <article class="product-hero">' },
          { i: 2, t: '    <h1 class="product-title">Aeropress Go</h1>', match: true },
          { i: 3, t: '    <span class="price-now">$39.95</span>' },
          { i: 4, t: '    <div class="product-description">…</div>' },
          { i: 5, t: '    <div class="gallery">…</div>' },
          { i: 6, t: "  </article>" },
          { i: 7, t: "</main>" },
        ],
        values: ["Aeropress Go", "Hario V60", "Chemex 6-cup", "Fellow Stagg EKG", "Comandante C40", "Baratza Encore"],
      },
      price: {
        rationale:
          'Element matches Price (Float). Currency-prefixed token "$NN.NN" present in 6/6 pages. Class `price-now` distinguishes current from strike-through `price-was` in 4/6 pages.',
        candidates: [
          { score: 0.94, css: "main > article .price-now", note: "matches 6/6 — currency parsed" },
          { score: 0.88, css: '.product-hero span[itemprop="price"]', note: "fallback when itemprop set" },
          { score: 0.62, css: "[data-price]", note: "matches 4/6 — feature-flagged" },
          { score: 0.41, css: ".price", note: "ambiguous with strikethrough" },
          { score: 0.18, css: ".product-info > div:nth-child(2)", note: "position fragile" },
        ],
        chosen: 0,
        validation: [[1,1,1,1,1,1],[1,1,1,1,0,1],[1,1,0,1,1,0],[1,0,0,1,0,1],[0,0,1,0,0,0]],
        dom: [
          { i: 0, t: "<main>" },
          { i: 1, t: '  <article class="product-hero">' },
          { i: 2, t: '    <h1 class="product-title">Aeropress Go</h1>' },
          { i: 3, t: '    <span class="price-now">$39.95</span>', match: true },
          { i: 4, t: '    <span class="price-was">$45.00</span>' },
          { i: 5, t: '    <div class="product-description">…</div>' },
          { i: 6, t: "  </article>" },
          { i: 7, t: "</main>" },
        ],
        values: ["$39.95", "$22.50", "$48.00", "$199.00", "$334.95", "$169.99"],
      },
      images: {
        rationale:
          "Array label. <img> children of `.gallery` count between 2 and 8 per page. `src` attribute selected as concrete value. Consistent container across the corpus.",
        candidates: [
          { score: 0.92, css: ".gallery img", note: "queryAll → 2-8 matches per page" },
          { score: 0.71, css: "figure.product-media img", note: "alt container on 3/6 pages" },
          { score: 0.55, css: 'img[loading="lazy"]', note: "too broad — includes thumbnails" },
        ],
        chosen: 0,
        validation: [[1,1,1,1,1,1],[1,1,1,0,1,1],[0,1,1,0,1,0]],
        dom: [
          { i: 0, t: '<div class="gallery">' },
          { i: 1, t: '  <img src="/img/1.jpg" alt="front"/>', match: true },
          { i: 2, t: '  <img src="/img/2.jpg" alt="back"/>', match: true },
          { i: 3, t: '  <img src="/img/3.jpg" alt="detail"/>', match: true },
          { i: 4, t: "</div>" },
        ],
        values: ["/img/1.jpg", "/img/2.jpg", "/img/3.jpg"],
      },
      description: {
        rationale:
          "Paragraph-like text region near top of <article>. Sentence count within max_sentences=3 on 5/6 pages; on /55214 the description is rendered inside a tab panel and missed.",
        candidates: [
          { score: 0.83, css: ".product-description", note: "matches 5/6 — missing on /55214" },
          { score: 0.79, css: "#desc", note: "fallback on 4/6 pages" },
          { score: 0.51, css: "article > p", note: "too eager — picks reviews on /77502" },
        ],
        chosen: 0,
        validation: [[1,1,1,0,1,1],[1,1,0,1,1,0],[0,0,1,0,1,1]],
        dom: [
          { i: 0, t: '<article class="product-hero">' },
          { i: 1, t: '  <h1 class="product-title">…</h1>' },
          { i: 2, t: '  <div class="product-description">Compact travel-friendly coffee press.</div>', match: true },
          { i: 3, t: '  <div class="gallery">…</div>' },
          { i: 4, t: "</article>" },
        ],
        values: ["Compact travel-friendly coffee press.", "Conical filter for 1–6 cups.", "Heat-resistant borosilicate.", "(missing on /55214)", "Precise variable-temperature kettle.", "Hand-built burr grinder."],
      },
      sku: {
        rationale:
          "data-sku attribute present on 3 of 6 pages. On the remaining pages the SKU is rendered as plain text inside the spec table, with no stable selector. Marked unresolved — feed more pages or label manually.",
        candidates: [
          { score: 0.62, css: "[data-sku]", note: "matches 3/6 — feature-flagged" },
          { score: 0.41, css: ".spec-table tr:nth-child(1) td", note: "matches 2/6 — row order varies" },
          { score: 0.34, css: ".product-meta .sku", note: "matches 1/6 — legacy template" },
        ],
        chosen: -1,
        unresolved: true,
        validation: [[1,1,0,1,0,0],[0,0,1,1,0,0],[1,0,0,0,1,0]],
        dom: [
          { i: 0, t: '<article class="product-hero">' },
          { i: 1, t: '  <span data-sku="AP-GO-001">SKU: AP-GO-001</span>', match: true },
          { i: 2, t: "  <!-- on /55214, /61803, /77502 the data-sku attr is absent -->" },
          { i: 3, t: "</article>" },
        ],
        values: ["AP-GO-001", "HV-60-CER", "(missing)", "FS-EKG-BLK", "(missing)", "(missing)"],
      },
      in_stock: {
        rationale:
          'Visual stock indicator differs by template: `.stock-badge.in-stock` (2 pages), `[aria-label="In stock"]` (1 page), inferred from disabled button state (3 pages). No stable selector covers ≥ similarity_threshold.',
        candidates: [
          { score: 0.55, css: ".stock-badge.in-stock", note: "matches 2/6 — current template only" },
          { score: 0.39, css: '[aria-label="In stock"]', note: "matches 1/6" },
          { score: 0.28, css: "button.buy:not([disabled])", note: "inferred from disabled state" },
        ],
        chosen: -1,
        unresolved: true,
        validation: [[1,1,0,0,0,0],[0,0,1,0,0,0],[1,1,0,1,1,0]],
        dom: [
          { i: 0, t: '<article class="product-hero">' },
          { i: 1, t: '  <span class="stock-badge in-stock">In stock</span>', match: true },
          { i: 2, t: "  <!-- on 4/6 pages the in_stock state is not exposed in markup -->" },
          { i: 3, t: "</article>" },
        ],
        values: ["true", "true", "(inferred)", "(inferred)", "(inferred)", "(missing)"],
      },
    },
  },
};

export const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Demo product</title></head>
<body>
  <main>
    <article>
      <h1 class="product-title">Aeropress Go</h1>
      <span class="price-now">$39.95</span>
      <div class="product-description">Compact travel-friendly coffee press.</div>
      <div class="gallery">
        <img src="/img/1.jpg" alt="front"/>
        <img src="/img/2.jpg" alt="back"/>
      </div>
    </article>
  </main>
</body>
</html>`;
