use scraper::{Html, Selector};
use std::collections::HashMap;
use uuid::Uuid;

use crate::types::{ParsedNode, ParsedPage};

const STRIP_TAGS: &[&str] = &["script", "style", "noscript"];

pub fn parse_html(url: &str, html: &str, dynamic_values: Vec<String>) -> ParsedPage {
    let document = Html::parse_document(html);
    let mut nodes = Vec::new();

    let strip_selectors: Vec<scraper::Selector> = STRIP_TAGS
        .iter()
        .filter_map(|tag| Selector::parse(tag).ok())
        .collect();

    let strip_ids: std::collections::HashSet<ego_tree::NodeId> = strip_selectors
        .iter()
        .flat_map(|sel| document.select(sel))
        .map(|el| el.id())
        .collect();

    for node in document.tree.nodes() {
        if let Some(element) = node.value().as_element() {
            if strip_ids.contains(&node.id()) {
                continue;
            }

            // Skip if any ancestor is stripped
            let mut ancestor_stripped = false;
            let mut current = node.parent();
            while let Some(parent) = current {
                if strip_ids.contains(&parent.id()) {
                    ancestor_stripped = true;
                    break;
                }
                current = parent.parent();
            }
            if ancestor_stripped {
                continue;
            }

            let tag = element.name().to_string();
            let attributes: HashMap<String, String> = element
                .attrs()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();

            let text = collect_direct_text(&node);
            let text = normalize_whitespace(&text);

            let gen_id = format!("n_{}", Uuid::new_v4().as_simple());

            let children: Vec<String> = Vec::new();
            let parent = None;
            let depth = node.ancestors().count();

            nodes.push(ParsedNode {
                gen_id,
                tag,
                attributes,
                text,
                children,
                parent,
                depth,
            });
        }
    }

    // Build parent-child relationships
    // We'll use index-based approach after collecting all nodes
    let node_ids: Vec<ego_tree::NodeId> = document
        .tree
        .nodes()
        .filter(|n| {
            n.value().as_element().is_some()
                && !strip_ids.contains(&n.id())
                && !n.ancestors().any(|a| strip_ids.contains(&a.id()))
        })
        .map(|n| n.id())
        .collect();

    let id_to_gen: HashMap<ego_tree::NodeId, String> = node_ids
        .iter()
        .zip(nodes.iter())
        .map(|(nid, pn)| (*nid, pn.gen_id.clone()))
        .collect();

    for (i, nid) in node_ids.iter().enumerate() {
        let tree_node = document.tree.get(*nid).unwrap();

        // Set parent
        if let Some(parent_node) = tree_node.parent() {
            if let Some(parent_gen_id) = id_to_gen.get(&parent_node.id()) {
                nodes[i].parent = Some(parent_gen_id.clone());
            }
        }

        // Set children
        let child_gen_ids: Vec<String> = tree_node
            .children()
            .filter_map(|c| id_to_gen.get(&c.id()).cloned())
            .collect();
        nodes[i].children = child_gen_ids;
    }

    ParsedPage {
        url: url.to_string(),
        nodes,
        dynamic_values,
    }
}

fn collect_direct_text(node: &ego_tree::NodeRef<scraper::Node>) -> String {
    let mut text = String::new();
    for child in node.children() {
        if let scraper::Node::Text(t) = child.value() {
            text.push_str(t);
        }
    }
    text
}

fn normalize_whitespace(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic_html() {
        let html = r#"
            <html>
            <head><title>Test</title></head>
            <body>
                <h1>Hello World</h1>
                <p>Some text</p>
                <script>var x = 1;</script>
            </body>
            </html>
        "#;
        let page = parse_html("http://example.com", html, vec![]);
        let tags: Vec<&str> = page.nodes.iter().map(|n| n.tag.as_str()).collect();
        assert!(!tags.contains(&"script"));
        assert!(tags.contains(&"h1"));
        assert!(tags.contains(&"p"));
    }

    #[test]
    fn test_whitespace_normalization() {
        let html = "<html><body><p>  hello   world  </p></body></html>";
        let page = parse_html("http://example.com", html, vec![]);
        let p_node = page.nodes.iter().find(|n| n.tag == "p").unwrap();
        assert_eq!(p_node.text, "hello world");
    }
}
