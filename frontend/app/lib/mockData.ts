// Frontend-only constants. All server-derived state flows through
// react-query — see lib/hooks/api/queries.

export const PATH_FINDER_URL_DEFAULT = "http://localhost:7117";

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
