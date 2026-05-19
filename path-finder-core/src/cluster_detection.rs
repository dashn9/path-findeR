//! Structural pattern detection.
//!
//! Independent of the AI. Walks each parsed page looking for sibling groups
//! that share a tag and a non-trivial set of classes — the unmistakable
//! signature of a repeating component (carousel thumbnails, product cards,
//! review tiles, list items).
//!
//! State-y classes that vary per sibling (`swiper-slide-active`,
//! `swiper-slide-next`) are filtered out via *intersection*: we only count
//! classes that appear on every member of the group. The fixed classes are
//! the structural identity; the rest are runtime state.
//!
//! Emitted clusters are merged with whatever the AI returns. If the AI
//! labels just one representative of the group, the cluster makes sure the
//! selector builder treats the label as an array.

use std::collections::{HashMap, HashSet};

use crate::types::{AiCluster, ParsedNode, ParsedPage};

/// Minimum sibling count to call something a "repeating" group. 3 keeps us
/// out of "two columns" false positives while still catching short lists.
const MIN_GROUP: usize = 3;

/// Confidence assigned to detected groups. High because the structural
/// signal (same tag + same intersecting class set across N siblings) is
/// strong; the AI's threshold is 0.75 by default.
const STRUCTURAL_SIMILARITY: f32 = 0.95;

/// Scan every page and return clusters covering all detected repeating
/// sibling groups. Gen IDs are global (one per node, unique across the
/// corpus), so groups from different pages get their own clusters even
/// when they describe the same template.
pub fn detect(pages: &[ParsedPage]) -> Vec<AiCluster> {
    let mut clusters = Vec::new();
    for page in pages {
        push_page_clusters(page, &mut clusters);
    }
    clusters
}

fn push_page_clusters(page: &ParsedPage, out: &mut Vec<AiCluster>) {
    // Group every node by (parent_id, tag). Children with no parent or no
    // tag don't get grouped.
    let mut by_parent_tag: HashMap<(&str, &str), Vec<&ParsedNode>> = HashMap::new();
    for n in &page.nodes {
        let parent_id = match &n.parent {
            Some(p) => p.as_str(),
            None => continue,
        };
        by_parent_tag.entry((parent_id, n.tag.as_str())).or_default().push(n);
    }

    for (_, siblings) in by_parent_tag {
        if siblings.len() < MIN_GROUP {
            continue;
        }
        // Stable class set = intersection of all siblings' class sets.
        let class_sets: Vec<HashSet<&str>> = siblings
            .iter()
            .map(|n| {
                n.attributes
                    .get("class")
                    .map(|c| c.split_whitespace().collect())
                    .unwrap_or_default()
            })
            .collect();
        let mut intersection: HashSet<&str> = match class_sets.first() {
            Some(s) => s.clone(),
            None => continue,
        };
        for s in class_sets.iter().skip(1) {
            intersection.retain(|c| s.contains(c));
        }
        // No shared class → siblings aren't a component, they're just
        // generic divs that happen to share a parent. Skip.
        if intersection.is_empty() {
            continue;
        }
        let gen_ids: Vec<String> = siblings.iter().map(|n| n.gen_id.clone()).collect();
        out.push(AiCluster {
            gen_ids,
            similarity: STRUCTURAL_SIMILARITY,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn node(gen_id: &str, tag: &str, parent: Option<&str>, classes: &[&str]) -> ParsedNode {
        let mut attrs = HashMap::new();
        if !classes.is_empty() {
            attrs.insert("class".to_string(), classes.join(" "));
        }
        ParsedNode {
            gen_id: gen_id.to_string(),
            tag: tag.to_string(),
            attributes: attrs,
            text: String::new(),
            children: Vec::new(),
            parent: parent.map(String::from),
            depth: 0,
        }
    }

    #[test]
    fn detects_repeating_siblings_with_shared_classes() {
        // Three swiper-slide siblings, each with state classes that differ.
        let page = ParsedPage {
            url: "x".into(),
            dynamic_values: vec![],
            nodes: vec![
                node("wrapper", "div", None, &["swiper-wrapper"]),
                node("s1", "div", Some("wrapper"), &["swiper-slide", "swiper-slide-active"]),
                node("s2", "div", Some("wrapper"), &["swiper-slide", "swiper-slide-next"]),
                node("s3", "div", Some("wrapper"), &["swiper-slide"]),
            ],
        };
        let clusters = detect(&[page]);
        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].gen_ids.len(), 3);
        assert!(clusters[0].similarity >= 0.9);
    }

    #[test]
    fn ignores_groups_without_shared_class() {
        // Three div siblings, completely unrelated classes — not a component.
        let page = ParsedPage {
            url: "x".into(),
            dynamic_values: vec![],
            nodes: vec![
                node("body", "body", None, &[]),
                node("a", "div", Some("body"), &["header"]),
                node("b", "div", Some("body"), &["sidebar"]),
                node("c", "div", Some("body"), &["main"]),
            ],
        };
        assert!(detect(&[page]).is_empty());
    }

    #[test]
    fn ignores_groups_smaller_than_three() {
        let page = ParsedPage {
            url: "x".into(),
            dynamic_values: vec![],
            nodes: vec![
                node("body", "body", None, &[]),
                node("a", "div", Some("body"), &["card"]),
                node("b", "div", Some("body"), &["card"]),
            ],
        };
        assert!(detect(&[page]).is_empty());
    }
}
