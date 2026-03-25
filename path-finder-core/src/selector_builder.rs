use scraper::{Html, Selector as CssSelector};
use std::collections::HashMap;

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
    // Build gen_id -> node lookup across all pages
    let gen_id_to_node: HashMap<&str, &ParsedNode> = pages
        .iter()
        .flat_map(|p| p.nodes.iter().map(|n| (n.gen_id.as_str(), n)))
        .collect();

    let mut candidates = Vec::new();

    for label_result in &ai_response.labels {
        let node = match gen_id_to_node.get(label_result.gen_id.as_str()) {
            Some(n) => *n,
            None => continue,
        };

        let css_candidates = derive_selectors(node, pages);

        // Determine if this is an array by checking if any selector matches multiple nodes
        let mut is_array = false;
        for sel in &css_candidates {
            for (_, html) in raw_htmls {
                let doc = Html::parse_document(html);
                if let Ok(css_sel) = CssSelector::parse(&sel.css) {
                    let count = doc.select(&css_sel).count();
                    if count > 1 {
                        is_array = true;
                        break;
                    }
                }
            }
            if is_array {
                break;
            }
        }

        // Also check similarity clusters for array tagging
        if !is_array {
            for cluster in &ai_response.clusters {
                if cluster.similarity >= config.similarity_threshold
                    && cluster.gen_ids.contains(&label_result.gen_id)
                {
                    is_array = true;
                    break;
                }
            }
        }

        candidates.push(SelectorCandidate {
            label: label_result.label.clone(),
            selectors: css_candidates,
            array: is_array,
        });
    }

    candidates
}

fn derive_selectors(node: &ParsedNode, pages: &[ParsedPage]) -> Vec<Selector> {
    let mut selectors = Vec::new();

    // 1. ID-based selector
    if let Some(id) = node.attributes.get("id") {
        if !id.is_empty() {
            selectors.push(Selector {
                css: format!("#{id}"),
            });
        }
    }

    // 2. Semantic class selector
    if let Some(class) = node.attributes.get("class") {
        let classes: Vec<&str> = class.split_whitespace().collect();
        for cls in &classes {
            if is_semantic_class(cls) {
                selectors.push(Selector {
                    css: format!(".{cls}"),
                });
            }
        }
    }

    // 3. Tag + class selector
    if let Some(class) = node.attributes.get("class") {
        let classes: Vec<&str> = class.split_whitespace().collect();
        if let Some(cls) = classes.first() {
            selectors.push(Selector {
                css: format!("{}.{cls}", node.tag),
            });
        }
    }

    // 4. Structural path selector
    let path = build_structural_path(node, pages);
    if !path.is_empty() {
        selectors.push(Selector { css: path });
    }

    // Fallback: just the tag
    if selectors.is_empty() {
        selectors.push(Selector {
            css: node.tag.clone(),
        });
    }

    selectors
}

fn is_semantic_class(cls: &str) -> bool {
    let semantic_keywords = [
        "title", "headline", "heading", "name", "price", "cost",
        "description", "summary", "content", "body", "text",
        "author", "byline", "date", "time", "published",
        "rating", "score", "review", "category", "tag",
        "image", "photo", "thumbnail", "avatar",
        "address", "location", "phone", "email",
        "product", "article", "post", "entry", "item",
    ];
    let lower = cls.to_lowercase();
    semantic_keywords.iter().any(|kw| lower.contains(kw))
}

fn build_structural_path(node: &ParsedNode, pages: &[ParsedPage]) -> String {
    // Walk up the parent chain to build a structural path
    // Find the page containing this node
    let page = pages.iter().find(|p| p.nodes.iter().any(|n| n.gen_id == node.gen_id));
    let page = match page {
        Some(p) => p,
        None => return String::new(),
    };

    let node_map: HashMap<&str, &ParsedNode> = page
        .nodes
        .iter()
        .map(|n| (n.gen_id.as_str(), n))
        .collect();

    let mut path_parts = vec![node.tag.clone()];
    let mut current = node;

    for _ in 0..5 {
        match &current.parent {
            Some(parent_id) => {
                if let Some(parent) = node_map.get(parent_id.as_str()) {
                    let meaningful_tags = [
                        "main", "article", "section", "header", "footer", "aside", "div",
                    ];
                    if meaningful_tags.contains(&parent.tag.as_str()) {
                        let mut part = parent.tag.clone();
                        // Add class hint if available
                        if let Some(class) = parent.attributes.get("class") {
                            if let Some(cls) = class.split_whitespace().next() {
                                if is_semantic_class(cls) {
                                    part = format!("{}.{cls}", parent.tag);
                                }
                            }
                        }
                        path_parts.push(part);
                    }
                    current = parent;
                } else {
                    break;
                }
            }
            None => break,
        }
    }

    path_parts.reverse();
    path_parts.join(" > ")
}

pub fn handle_selector_divergence(
    selectors: &[Selector],
    raw_htmls: &[(String, String)],
) -> Vec<Selector> {
    // Check which selectors work on which pages
    // Group pages by which selector matches them
    let mut working_selectors = Vec::new();

    for sel in selectors {
        let matches_any = raw_htmls.iter().any(|(_, html)| {
            let doc = Html::parse_document(html);
            CssSelector::parse(&sel.css)
                .map(|s| doc.select(&s).next().is_some())
                .unwrap_or(false)
        });
        if matches_any {
            working_selectors.push(sel.clone());
        }
    }

    if working_selectors.is_empty() {
        selectors.to_vec()
    } else {
        working_selectors
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_semantic_class() {
        assert!(is_semantic_class("article-title"));
        assert!(is_semantic_class("product-price"));
        assert!(!is_semantic_class("xyz-abc"));
        assert!(!is_semantic_class("mt-4"));
    }
}
