//! Build CSS selectors that uniquely (or appropriately) identify the AI's
//! chosen nodes.
//!
//! Design: never blocklist class names. We can't predict every framework's
//! conventions, and "looks semantic" is unreliable (`font-bodyTitleSmall`
//! contains "title" but matches every body-titled element on the page).
//!
//! Instead, generate a wide candidate set — ID, multi-class compound,
//! tag+class, parent-scoped, bare class, structural path, tag fallback —
//! then *rank empirically* by per-page match count. The page tells us
//! which selector is specific. For broad classes the compound and
//! parent-scoped forms win; for genuinely-unique content classes the bare
//! form wins. No curated lists.

use scraper::{Html, Selector as CssSelector};
use std::collections::{HashMap, HashSet};

use crate::config::Config;
use crate::types::{AiResponse, ParsedNode, ParsedPage, Selector};

pub struct SelectorCandidate {
    pub label: String,
    pub selectors: Vec<Selector>,
    pub array: bool,
}

pub fn build_selectors(
    ai_response: &AiResponse,
    pages: &[ParsedPage],
    raw_htmls: &[(String, String)],
    config: &Config,
) -> Vec<SelectorCandidate> {
    let gen_id_to_node: HashMap<&str, &ParsedNode> = pages
        .iter()
        .flat_map(|p| p.nodes.iter().map(|n| (n.gen_id.as_str(), n)))
        .collect();

    // Parse each page's HTML once — every candidate's match count is read
    // off the same `Html` doc, no re-parsing.
    let docs: Vec<Html> = raw_htmls
        .iter()
        .map(|(_, html)| Html::parse_document(html))
        .collect();

    let mut candidates = Vec::new();
    for label_result in &ai_response.labels {
        let node = match gen_id_to_node.get(label_result.gen_id.as_str()) {
            Some(n) => *n,
            None => continue,
        };
        let parent = node
            .parent
            .as_deref()
            .and_then(|pid| gen_id_to_node.get(pid).copied());

        // is_array purely from AI clusters. The old "any selector matches
        // more than one element" heuristic flipped non-array labels to
        // array whenever a broad utility class snuck in — exactly the
        // failure mode the compound-selector approach is here to fix.
        let array = ai_response.clusters.iter().any(|c| {
            c.similarity >= config.similarity_threshold
                && c.gen_ids.contains(&label_result.gen_id)
        });

        let css_candidates = derive_selectors(node, parent, pages, &docs, array);

        candidates.push(SelectorCandidate {
            label: label_result.label.clone(),
            selectors: css_candidates,
            array,
        });
    }
    candidates
}

/// Generate candidate selectors and rank them by selectivity.
///
/// For non-array labels: most-selective (low match count, ideally 1) wins.
/// For array labels: also rank low → high, but the validator's coverage
/// logic in `validator.rs` will still accept multi-match selectors that
/// cover all pages — the ordering just determines which one it tries first.
fn derive_selectors(
    node: &ParsedNode,
    parent: Option<&ParsedNode>,
    pages: &[ParsedPage],
    docs: &[Html],
    array: bool,
) -> Vec<Selector> {
    let mut out: Vec<Selector> = Vec::new();

    // ID — almost always unique. Cheap and decisive when present.
    if let Some(id) = node.attributes.get("id").filter(|s| !s.is_empty()) {
        out.push(Selector { css: format!("#{id}") });
    }

    let own_classes: Vec<&str> = node
        .attributes
        .get("class")
        .map(|c| {
            c.split_whitespace()
                .filter(|cls| is_usable_class(cls))
                .collect()
        })
        .unwrap_or_default();

    let parent_classes: Vec<&str> = parent
        .and_then(|p| p.attributes.get("class"))
        .map(|c| {
            c.split_whitespace()
                .filter(|cls| is_usable_class(cls))
                .collect()
        })
        .unwrap_or_default();

    // Multi-class compound (`.c1.c2.c3`). Intersecting every stable class
    // the node carries is usually the most-specific class-only form.
    if own_classes.len() >= 2 {
        let compound: String = own_classes.iter().map(|c| format!(".{c}")).collect();
        out.push(Selector { css: compound });
    }

    // Tag + each individual class (`h1.font-bodyTitleSmall`). Narrower than
    // the bare class because the tag filters out non-`h1` matches.
    for cls in &own_classes {
        out.push(Selector { css: format!("{}.{cls}", node.tag) });
    }

    // Parent-scoped (`.parentClass > tag.cls`, `.parentClass .cls`). When
    // the bare class is too broad, scoping it under a parent class usually
    // pins it down. We emit a few combinations; ranking weeds the bad ones.
    for pcls in &parent_classes {
        for cls in &own_classes {
            out.push(Selector {
                css: format!(".{pcls} > {}.{cls}", node.tag),
            });
            out.push(Selector { css: format!(".{pcls} .{cls}") });
        }
        out.push(Selector { css: format!(".{pcls} > {}", node.tag) });
    }

    // Bare class candidates (least specific; ranking surfaces them only when
    // they're actually unique — e.g. when no compound is available).
    for cls in &own_classes {
        out.push(Selector { css: format!(".{cls}") });
    }

    // Structural path (`main > article > h1`). The fallback when the node
    // has no useful classes; usually too generic to win the ranking but
    // safe.
    let path = build_structural_path(node, pages);
    if !path.is_empty() {
        out.push(Selector { css: path });
    }

    // Tag-only — last resort.
    out.push(Selector { css: node.tag.clone() });

    // De-dupe identical CSS strings before scoring so we don't pay the parse
    // cost twice for the same selector.
    let mut seen: HashSet<String> = HashSet::new();
    out.retain(|s| seen.insert(s.css.clone()));

    // Score each candidate by mean per-page match count. Ascending order:
    //   - non-array: freq=1 is ideal (uniquely identifies the target).
    //   - array:    coverage logic in validator handles multi-match; we still
    //               prefer lower variance, which low-mean candidates trend
    //               toward.
    // freq=0 candidates (selector doesn't match anywhere) sink to the bottom
    // by promoting them to the largest possible key — useless picks.
    let mut scored: Vec<(usize, Selector)> = out
        .into_iter()
        .map(|s| {
            let mean = mean_match_count(&s.css, docs);
            let key = if mean == 0 { usize::MAX } else { mean };
            (key, s)
        })
        .collect();
    scored.sort_by_key(|(k, _)| *k);

    let _ = array; // reserved for future array-aware ordering tweaks
    scored.into_iter().map(|(_, s)| s).collect()
}

/// Mean number of elements matching `css` across the corpus. usize::MAX
/// signals an unparseable selector (or an empty corpus).
fn mean_match_count(css: &str, docs: &[Html]) -> usize {
    let parsed = match CssSelector::parse(css) {
        Ok(s) => s,
        Err(_) => return usize::MAX,
    };
    if docs.is_empty() {
        return 0;
    }
    let total: usize = docs.iter().map(|d| d.select(&parsed).count()).sum();
    total / docs.len()
}

/// Sanity gate: drops empties, CSS-in-JS hash prefixes, and long hex runs.
/// Anything that survives is *eligible* — final ordering decides who wins.
fn is_usable_class(cls: &str) -> bool {
    if cls.is_empty() {
        return false;
    }
    let lower = cls.to_ascii_lowercase();
    if lower.starts_with("css-") || lower.starts_with("sc-") || lower.starts_with("jss-") {
        return false;
    }
    let mut run = 0usize;
    for ch in cls.chars() {
        if ch.is_ascii_hexdigit() {
            run += 1;
            if run >= 5 {
                return false;
            }
        } else {
            run = 0;
        }
    }
    true
}

fn build_structural_path(node: &ParsedNode, pages: &[ParsedPage]) -> String {
    let page = match pages
        .iter()
        .find(|p| p.nodes.iter().any(|n| n.gen_id == node.gen_id))
    {
        Some(p) => p,
        None => return String::new(),
    };
    let node_map: HashMap<&str, &ParsedNode> = page
        .nodes
        .iter()
        .map(|n| (n.gen_id.as_str(), n))
        .collect();

    let meaningful_tags = ["main", "article", "section", "header", "footer", "aside", "div"];
    let mut path_parts = vec![node.tag.clone()];
    let mut current = node;
    for _ in 0..5 {
        let parent_id = match &current.parent {
            Some(id) => id,
            None => break,
        };
        let parent = match node_map.get(parent_id.as_str()) {
            Some(p) => *p,
            None => break,
        };
        if meaningful_tags.contains(&parent.tag.as_str()) {
            path_parts.push(parent.tag.clone());
        }
        current = parent;
    }
    path_parts.reverse();
    path_parts.join(" > ")
}

pub fn handle_selector_divergence(
    selectors: &[Selector],
    raw_htmls: &[(String, String)],
) -> Vec<Selector> {
    let mut working = Vec::new();
    for sel in selectors {
        let matches_any = raw_htmls.iter().any(|(_, html)| {
            let doc = Html::parse_document(html);
            CssSelector::parse(&sel.css)
                .map(|s| doc.select(&s).next().is_some())
                .unwrap_or(false)
        });
        if matches_any {
            working.push(sel.clone());
        }
    }
    if working.is_empty() { selectors.to_vec() } else { working }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_usable_class_filters_hashes() {
        assert!(is_usable_class("product-title"));
        assert!(is_usable_class("font-bodyTitleSmall"));
        assert!(!is_usable_class("css-1ab2c3"));
        assert!(!is_usable_class("sc-aBc12345"));
        assert!(!is_usable_class(""));
        assert!(!is_usable_class("a1b2c"));
    }

    #[test]
    fn mean_match_count_orders_by_specificity() {
        // .broad matches 3 elements; .narrow matches 1. mean should be 3 vs 1.
        let html = r#"<html><body>
            <h1 class="broad narrow">A</h1>
            <p class="broad">B</p>
            <p class="broad">C</p>
        </body></html>"#;
        let docs = vec![Html::parse_document(html)];
        assert_eq!(mean_match_count(".broad", &docs), 3);
        assert_eq!(mean_match_count(".narrow", &docs), 1);
        // Compound: only the h1 has both classes.
        assert_eq!(mean_match_count(".broad.narrow", &docs), 1);
    }
}
