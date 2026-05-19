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

        // is_array: the gen_id itself OR any of its ancestors is in a
        // repeating cluster. Direct membership covers things like
        // <article> tiles; ancestor membership covers nested items —
        // a swiper carousel's <img>s aren't direct cluster members, but
        // their grandparent .swiper-slide divs are, and one image per
        // slide is structurally an array.
        let array = is_in_cluster(
            &label_result.gen_id,
            &gen_id_to_node,
            &ai_response.clusters,
            config.similarity_threshold,
        );

        let css_candidates = derive_selectors(node, &gen_id_to_node, pages, &docs, array);

        candidates.push(SelectorCandidate {
            label: label_result.label.clone(),
            selectors: css_candidates,
            array,
        });
    }
    candidates
}

/// True iff `gen_id` (or any of its ancestors within 8 hops) is a member of
/// a high-similarity cluster. Lifts array detection past direct-membership
/// — nested items inside repeating containers count.
fn is_in_cluster(
    gen_id: &str,
    nodes: &HashMap<&str, &ParsedNode>,
    clusters: &[crate::types::AiCluster],
    threshold: f32,
) -> bool {
    let is_member = |id: &str| {
        clusters.iter().any(|c| {
            c.similarity >= threshold && c.gen_ids.iter().any(|g| g == id)
        })
    };
    if is_member(gen_id) {
        return true;
    }
    let mut current = gen_id.to_string();
    for _ in 0..8 {
        let parent = match nodes.get(current.as_str()).and_then(|n| n.parent.as_deref()) {
            Some(p) => p.to_string(),
            None => return false,
        };
        if is_member(&parent) {
            return true;
        }
        current = parent;
    }
    false
}

/// Generate candidate selectors and rank by per-page match count.
///
/// For non-array labels the ideal selector matches exactly one element. When
/// the best class-based candidate still matches several (three siblings
/// sharing the same compound, say), `:nth-of-type(N)` variants tighten
/// further — the AI's gen_id is at a fixed position within its sibling set
/// on every page, so the positional form selects exactly the right one.
///
/// For array labels we let the validator's coverage logic handle multi-
/// match acceptance; ranking still prefers lower mean counts so we don't
/// accidentally pick a selector that scoops in unrelated elements.
fn derive_selectors(
    node: &ParsedNode,
    nodes: &HashMap<&str, &ParsedNode>,
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

    // Walk up to 4 ancestors collecting their usable classes. Nearest first.
    // Lets us scope a broad bare class under any ancestor class that's
    // actually meaningful (a `.swiper-wrapper` two hops up, etc.) instead
    // of only the immediate parent.
    let ancestor_classes = ancestor_classes(node, nodes, 4);

    // Multi-class compound — most-specific class-only form for this node.
    if own_classes.len() >= 2 {
        let compound: String = own_classes.iter().map(|c| format!(".{c}")).collect();
        out.push(Selector { css: compound });
    }

    // Tag + each individual class (`h1.font-bodyTitleSmall`).
    for cls in &own_classes {
        out.push(Selector { css: format!("{}.{cls}", node.tag) });
    }

    // Ancestor-scoped (`.ancestor tag.cls`, `.ancestor > tag.cls` for
    // immediate parent). Nearest ancestor first — those win when they're
    // specific enough; broader scope falls in behind.
    for (depth, acls) in ancestor_classes.iter().enumerate() {
        for cls in &own_classes {
            out.push(Selector { css: format!(".{acls} {}.{cls}", node.tag) });
            if depth == 0 {
                out.push(Selector { css: format!(".{acls} > {}.{cls}", node.tag) });
                out.push(Selector { css: format!(".{acls} > .{cls}") });
            }
            out.push(Selector { css: format!(".{acls} .{cls}") });
        }
        out.push(Selector { css: format!(".{acls} {}", node.tag) });
        if depth == 0 {
            out.push(Selector { css: format!(".{acls} > {}", node.tag) });
        }
    }

    // Bare class — last among class-only forms; ranking promotes when truly
    // unique (rare on real sites, but cheap to keep).
    for cls in &own_classes {
        out.push(Selector { css: format!(".{cls}") });
    }

    // Positional disambiguation: when N siblings share the same tag, the
    // AI's target is at a known position. Pair `:nth-of-type(N)` with the
    // ancestor scope so the selector reads "Nth h2 inside .container".
    // Critical for "three section headings all share class X" — class alone
    // matches all three; the position picks the right one.
    if let Some(n) = nth_of_type(node, nodes) {
        out.push(Selector { css: format!("{}:nth-of-type({n})", node.tag) });
        for acls in &ancestor_classes {
            out.push(Selector {
                css: format!(".{acls} > {}:nth-of-type({n})", node.tag),
            });
            out.push(Selector {
                css: format!(".{acls} {}:nth-of-type({n})", node.tag),
            });
            for cls in &own_classes {
                out.push(Selector {
                    css: format!(".{acls} {}.{cls}:nth-of-type({n})", node.tag),
                });
            }
        }
    }

    // Structural path fallback.
    let path = build_structural_path(node, pages);
    if !path.is_empty() {
        out.push(Selector { css: path });
    }

    // Tag-only — last resort.
    out.push(Selector { css: node.tag.clone() });

    // De-dupe.
    let mut seen: HashSet<String> = HashSet::new();
    out.retain(|s| seen.insert(s.css.clone()));

    // Rank by mean match count. usize::MAX sinks unparseable / zero-match
    // selectors. For non-array labels a mean of 1 is ideal; for array labels
    // we still prefer lower means (selector picks fewer extras).
    let mut scored: Vec<(usize, Selector)> = out
        .into_iter()
        .map(|s| {
            let mean = mean_match_count(&s.css, docs);
            let key = if mean == 0 { usize::MAX } else { mean };
            (key, s)
        })
        .collect();
    scored.sort_by_key(|(k, _)| *k);

    let _ = array;
    scored.into_iter().map(|(_, s)| s).collect()
}

/// Walks up to `max_depth` ancestors and returns their usable classes,
/// nearest first. Order matters: closer scopes are emitted as candidates
/// before broader ones so the ranking sees the most-specific options first.
fn ancestor_classes<'a>(
    node: &'a ParsedNode,
    nodes: &HashMap<&str, &'a ParsedNode>,
    max_depth: usize,
) -> Vec<&'a str> {
    let mut out: Vec<&'a str> = Vec::new();
    let mut current = node;
    for _ in 0..max_depth {
        let parent_id = match current.parent.as_deref() {
            Some(p) => p,
            None => break,
        };
        let parent = match nodes.get(parent_id) {
            Some(p) => *p,
            None => break,
        };
        if let Some(cls) = parent.attributes.get("class") {
            for c in cls.split_whitespace() {
                if is_usable_class(c) && !out.contains(&c) {
                    out.push(c);
                }
            }
        }
        current = parent;
    }
    out
}

/// Position of `node` among its same-tag siblings (1-based). Returns None
/// when the node has no parent recorded or is a unique-of-its-tag among
/// siblings — in the latter case the tag selector alone is already unique
/// and `:nth-of-type` adds no value.
fn nth_of_type(node: &ParsedNode, nodes: &HashMap<&str, &ParsedNode>) -> Option<usize> {
    let parent_id = node.parent.as_deref()?;
    let parent = nodes.get(parent_id)?;
    let mut n = 0usize;
    let mut total = 0usize;
    for child_id in &parent.children {
        let child = match nodes.get(child_id.as_str()) {
            Some(c) => c,
            None => continue,
        };
        if child.tag != node.tag {
            continue;
        }
        total += 1;
        if child.gen_id == node.gen_id {
            n = total;
        }
    }
    if total >= 2 && n > 0 { Some(n) } else { None }
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
