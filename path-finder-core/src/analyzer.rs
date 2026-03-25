use crate::config::Config;
use crate::exclusions::is_excluded;
use crate::types::{ParsedPage, SemanticNode, ScoredTree};

const SEMANTIC_TAGS: &[(&str, f32)] = &[
    ("article", 0.9),
    ("main", 0.85),
    ("section", 0.7),
    ("h1", 0.95),
    ("h2", 0.85),
    ("h3", 0.75),
    ("h4", 0.65),
    ("h5", 0.55),
    ("h6", 0.5),
    ("p", 0.6),
    ("blockquote", 0.7),
    ("figure", 0.6),
    ("figcaption", 0.55),
    ("time", 0.65),
    ("address", 0.5),
    ("pre", 0.5),
    ("code", 0.5),
    ("table", 0.5),
    ("ul", 0.4),
    ("ol", 0.4),
    ("li", 0.35),
    ("dl", 0.4),
    ("dt", 0.45),
    ("dd", 0.4),
    ("img", 0.5),
    ("video", 0.5),
    ("audio", 0.5),
    ("span", 0.2),
    ("div", 0.1),
    ("a", 0.15),
];

pub fn analyze(page: &ParsedPage, config: &Config) -> ScoredTree {
    let mut scored_nodes = Vec::new();

    for node in &page.nodes {
        if is_excluded(node, &config.exclusions) {
            continue;
        }

        // Skip empty nodes
        if node.text.is_empty() && node.children.is_empty() {
            continue;
        }

        // Skip purely structural nodes with no meaningful text
        let structural_tags = ["div", "span", "section", "header", "footer", "aside"];
        if structural_tags.contains(&node.tag.as_str())
            && node.text.trim().is_empty()
        {
            continue;
        }

        let score = compute_score(node, &page.dynamic_values);

        scored_nodes.push(SemanticNode {
            gen_id: node.gen_id.clone(),
            tag: node.tag.clone(),
            attributes: node.attributes.clone(),
            text: node.text.clone(),
            score,
        });
    }

    // Sort by score descending
    scored_nodes.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    ScoredTree {
        url: page.url.clone(),
        nodes: scored_nodes,
    }
}

fn compute_score(node: &crate::types::ParsedNode, dynamic_values: &[String]) -> f32 {
    let mut score: f32 = 0.0;

    // Semantic tag boost
    let tag_score = SEMANTIC_TAGS
        .iter()
        .find(|(t, _)| *t == node.tag.as_str())
        .map(|(_, s)| *s)
        .unwrap_or(0.1);
    score += tag_score * 0.4;

    // Text density signal
    let text_len = node.text.len() as f32;
    let text_density = (text_len / 500.0).min(1.0);
    score += text_density * 0.35;

    // Link density penalty (lower score if node is mostly links)
    if node.tag == "a" {
        score *= 0.6;
    }

    // Deprioritize nodes whose text matches dynamic URL values
    if !dynamic_values.is_empty() && !node.text.is_empty() {
        for val in dynamic_values {
            if node.text.contains(val) {
                score *= 0.3;
                break;
            }
        }
    }

    score.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ParsedNode;
    use std::collections::HashMap;

    fn make_page(nodes: Vec<ParsedNode>) -> ParsedPage {
        ParsedPage {
            url: "http://example.com".into(),
            nodes,
            dynamic_values: vec![],
        }
    }

    fn make_node(tag: &str, text: &str) -> ParsedNode {
        ParsedNode {
            gen_id: format!("n_{tag}"),
            tag: tag.into(),
            attributes: HashMap::new(),
            text: text.into(),
            children: vec![],
            parent: None,
            depth: 0,
        }
    }

    #[test]
    fn test_empty_nodes_stripped() {
        let page = make_page(vec![
            make_node("p", "content"),
            make_node("p", ""),
        ]);
        let config = Config {
            ai_endpoint: String::new(),
            ai_model: String::new(),
            max_direct_kb: 300,
            top_n_nodes: 30,
            max_sentences: 3,
            max_sentence_chars: 500,
            similarity_threshold: 0.75,
            max_retries: 3,
            output_format: crate::config::Format::Json,
            exclusions: vec![],
            min_pages: 2,
        };
        let tree = analyze(&page, &config);
        assert_eq!(tree.nodes.len(), 1);
    }

    #[test]
    fn test_h1_scores_higher_than_div() {
        let page = make_page(vec![
            make_node("h1", "Title"),
            make_node("div", "Some text here for the div"),
        ]);
        let config = Config {
            ai_endpoint: String::new(),
            ai_model: String::new(),
            max_direct_kb: 300,
            top_n_nodes: 30,
            max_sentences: 3,
            max_sentence_chars: 500,
            similarity_threshold: 0.75,
            max_retries: 3,
            output_format: crate::config::Format::Json,
            exclusions: vec![],
            min_pages: 2,
        };
        let tree = analyze(&page, &config);
        assert!(tree.nodes[0].tag == "h1");
    }
}
