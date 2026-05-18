//! Structural shape of a page.
//!
//! Two signal sets per page:
//!
//! - **paths**: depth-capped root-to-node tag paths (`"html>body>main>article"`).
//!   Tag names only, no attributes/text. Cheap, robust to cosmetic drift,
//!   weak on div-soup sites.
//! - **marks**: stable identifiers — `id` attribute values, `role`,
//!   `aria-*` keys, and "stable-looking" classes (auto-generated
//!   CSS-in-JS hashes filtered out). Tiebreaks #1's weakness when frameworks
//!   render everything as nested divs.
//!
//! The Go feeder Jaccards both and combines them (currently 0.7*paths +
//! 0.3*marks). Paths matching alone is not enough on modern sites; marks
//! alone is too noisy (frameworks recycle classes). Together they discriminate
//! reasonably without an LLM.

use scraper::Html;
use serde::Serialize;

/// Hard cap on emitted path depth. Deeper nodes get truncated to N levels;
/// pages with deep structures still match each other because they truncate
/// identically.
const MAX_DEPTH: usize = 8;

#[derive(Serialize)]
pub struct Shape {
    pub paths: Vec<String>,
    pub marks: Vec<String>,
    pub id: String,
}

/// Short, stable ID derived from a sorted path set. FNV-1a — deterministic,
/// no external dep.
pub fn id(paths: &[String]) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for p in paths {
        for b in p.as_bytes() {
            h ^= *b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:08x}", (h & 0xffffffff) as u32)
}

/// Jaccard similarity |A ∩ B| / |A ∪ B| on two sorted slices.
pub fn jaccard(a: &[String], b: &[String]) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let (mut i, mut j, mut inter) = (0usize, 0usize, 0usize);
    while i < a.len() && j < b.len() {
        match a[i].cmp(&b[j]) {
            std::cmp::Ordering::Equal => { inter += 1; i += 1; j += 1; }
            std::cmp::Ordering::Less => i += 1,
            std::cmp::Ordering::Greater => j += 1,
        }
    }
    let union = a.len() + b.len() - inter;
    inter as f64 / union as f64
}

/// Compute both signal sets in one DOM walk.
pub fn compute(html: &str) -> Shape {
    let document = Html::parse_document(html);
    let mut paths: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut marks: std::collections::HashSet<String> = std::collections::HashSet::new();

    for node in document.tree.nodes() {
        let Some(el) = node.value().as_element() else { continue };

        // ── paths (depth-capped) ─────────────────────────────────────
        let mut parts: Vec<&str> = Vec::new();
        let mut cur = Some(node);
        while let Some(n) = cur {
            if let Some(e) = n.value().as_element() {
                parts.push(e.name());
            }
            cur = n.parent();
        }
        parts.reverse();
        if parts.len() > MAX_DEPTH {
            parts.truncate(MAX_DEPTH);
        }
        if !parts.is_empty() {
            paths.insert(parts.join(">"));
        }

        // ── marks (stable identifiers) ───────────────────────────────
        for (key, val) in el.attrs() {
            match key {
                "id" if !val.is_empty() => {
                    marks.insert(format!("#{val}"));
                }
                "role" => {
                    marks.insert(format!("role={val}"));
                }
                k if k.starts_with("aria-") => {
                    marks.insert(format!("{k}={val}"));
                }
                "class" => {
                    for c in val.split_whitespace() {
                        if is_stable_class(c) {
                            marks.insert(format!(".{c}"));
                        }
                    }
                }
                _ => {}
            }
        }
    }

    let mut paths: Vec<String> = paths.into_iter().collect();
    paths.sort();
    let mut marks: Vec<String> = marks.into_iter().collect();
    marks.sort();
    let id = id(&paths);
    Shape { paths, marks, id }
}

/// Heuristic class filter: drop CSS-in-JS-looking hashes. A class is "stable"
/// if it has fewer than 3 consecutive digits AND isn't a typical emotion/styled-
/// components prefix (`css-`, `sc-`, `jss-`, `_` + alphanum).
fn is_stable_class(c: &str) -> bool {
    if c.is_empty() { return false; }
    let lower = c.to_ascii_lowercase();
    if lower.starts_with("css-") || lower.starts_with("sc-") || lower.starts_with("jss-") {
        return false;
    }
    if lower.starts_with('_') && lower.len() > 1 {
        // Common emotion/Tailwind-jit pattern
        let rest = &lower[1..];
        if rest.chars().all(|ch| ch.is_ascii_alphanumeric()) && rest.len() <= 8 {
            return false;
        }
    }
    let mut run = 0usize;
    for ch in c.chars() {
        if ch.is_ascii_digit() {
            run += 1;
            if run >= 3 { return false; }
        } else {
            run = 0;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_template_matches() {
        let a = r#"<html><body><main><article><h1>A</h1><p>x</p></article></main></body></html>"#;
        let b = r#"<html><body><main><article><h1>B</h1><p>y</p><p>z</p></article></main></body></html>"#;
        assert_eq!(compute(a).paths, compute(b).paths);
    }

    #[test]
    fn different_templates_diverge() {
        let product = r#"<html><body><main><div><img/><span></span></div></main></body></html>"#;
        let terms = r#"<html><body><main><article><h2></h2><ol><li></li></ol></article></main></body></html>"#;
        let score = jaccard(&compute(product).paths, &compute(terms).paths);
        assert!(score < 0.5, "unexpected similarity: {score}");
    }

    #[test]
    fn array_length_invariant() {
        let two = r#"<html><body><ul><li></li><li></li></ul></body></html>"#;
        let five = r#"<html><body><ul><li></li><li></li><li></li><li></li><li></li></ul></body></html>"#;
        assert_eq!(compute(two).paths, compute(five).paths);
    }

    #[test]
    fn depth_cap_truncates_deep_paths() {
        let mut deep = String::from("<html><body>");
        for _ in 0..12 {
            deep.push_str("<div>");
        }
        deep.push_str("hi");
        for _ in 0..12 {
            deep.push_str("</div>");
        }
        deep.push_str("</body></html>");
        let s = compute(&deep);
        for p in &s.paths {
            assert!(p.split('>').count() <= MAX_DEPTH, "uncapped path: {p}");
        }
    }

    #[test]
    fn marks_capture_ids_and_aria() {
        let html = r#"<html><body><main id="main" role="main">
            <h1 aria-label="title">x</h1>
            <div class="product-card css-1ab2c3"></div>
        </main></body></html>"#;
        let s = compute(html);
        assert!(s.marks.contains(&"#main".to_string()));
        assert!(s.marks.contains(&"role=main".to_string()));
        assert!(s.marks.contains(&"aria-label=title".to_string()));
        assert!(s.marks.contains(&".product-card".to_string()));
        assert!(!s.marks.iter().any(|m| m.contains("css-1ab2c3")),
                "css-in-js hash should be filtered");
    }

    #[test]
    fn jaccard_identical_is_one() {
        let a = vec!["a".into(), "b".into(), "c".into()];
        assert_eq!(jaccard(&a, &a), 1.0);
    }

    #[test]
    fn jaccard_disjoint_is_zero() {
        assert_eq!(jaccard(&vec!["a".into()], &vec!["b".into()]), 0.0);
    }

    #[test]
    fn jaccard_partial() {
        let a = vec!["a".into(), "b".into(), "c".into()];
        let b = vec!["b".into(), "c".into(), "d".into()];
        assert_eq!(jaccard(&a, &b), 0.5);
    }

    #[test]
    fn stable_class_filter() {
        assert!(is_stable_class("product-card"));
        assert!(is_stable_class("flex"));
        assert!(!is_stable_class("css-1ab2c3"));
        assert!(!is_stable_class("sc-abc123"));
        assert!(!is_stable_class("jss-42"));
        assert!(!is_stable_class("_a1b2c3"));
        assert!(!is_stable_class("page-1234"));
    }
}
