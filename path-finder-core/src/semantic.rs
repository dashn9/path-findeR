use crate::config::Config;
use crate::types::{SemanticNode, ScoredTree};

pub struct SemanticDocument {
    pub nodes: Vec<SemanticNode>,
    pub raw_html: Option<String>,
}

pub fn build_semantic_documents(
    scored_trees: &[ScoredTree],
    raw_pages: &[(String, String)],
    config: &Config,
) -> Vec<SemanticDocument> {
    let total_size: usize = raw_pages.iter().map(|(_, html)| html.len()).sum();
    let threshold = config.max_direct_kb * 1024;

    if total_size < threshold {
        // Direct feed: pass raw HTML
        raw_pages
            .iter()
            .map(|(_, html)| SemanticDocument {
                nodes: vec![],
                raw_html: Some(html.clone()),
            })
            .collect()
    } else {
        // Semantic document: compact representation
        scored_trees
            .iter()
            .map(|tree| {
                let top_nodes: Vec<SemanticNode> = tree
                    .nodes
                    .iter()
                    .take(config.top_n_nodes)
                    .map(|node| {
                        let mut squashed = node.clone();
                        squashed.text = squash_text(&node.text, config.max_sentences, config.max_sentence_chars);
                        squashed
                    })
                    .collect();

                SemanticDocument {
                    nodes: top_nodes,
                    raw_html: None,
                }
            })
            .collect()
    }
}

fn squash_text(text: &str, max_sentences: usize, max_sentence_chars: usize) -> String {
    if text.is_empty() {
        return String::new();
    }

    let sentences: Vec<&str> = split_sentences(text);

    if sentences.is_empty() {
        return String::new();
    }

    let selected = if sentences.len() <= max_sentences {
        sentences
    } else {
        sample_evenly(&sentences, max_sentences)
    };

    selected
        .iter()
        .map(|s| truncate_at_word_boundary(s, max_sentence_chars))
        .collect::<Vec<_>>()
        .join(" ")
}

fn split_sentences(text: &str) -> Vec<&str> {
    let mut sentences = Vec::new();
    let mut start = 0;

    for (i, c) in text.char_indices() {
        if matches!(c, '.' | '!' | '?') {
            let end = i + c.len_utf8();
            let sentence = text[start..end].trim();
            if !sentence.is_empty() {
                sentences.push(sentence);
            }
            start = end;
        }
    }

    // Remaining text
    let remaining = text[start..].trim();
    if !remaining.is_empty() {
        sentences.push(remaining);
    }

    sentences
}

fn sample_evenly<'a>(items: &[&'a str], count: usize) -> Vec<&'a str> {
    if count == 0 || items.is_empty() {
        return vec![];
    }
    if count >= items.len() {
        return items.to_vec();
    }

    let mut result = Vec::with_capacity(count);
    let last = items.len() - 1;

    if count == 1 {
        result.push(items[0]);
    } else {
        for i in 0..count {
            let idx = if i == 0 {
                0
            } else if i == count - 1 {
                last
            } else {
                (i as f64 * last as f64 / (count - 1) as f64).round() as usize
            };
            result.push(items[idx]);
        }
    }

    result
}

fn truncate_at_word_boundary(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }

    let byte_end = s
        .char_indices()
        .nth(max_chars)
        .map(|(i, _)| i)
        .unwrap_or(s.len());
    let truncated = &s[..byte_end];
    if let Some(last_space) = truncated.rfind(' ') {
        truncated[..last_space].to_string()
    } else {
        truncated.to_string()
    }
}

pub fn format_semantic_doc(doc: &SemanticDocument) -> String {
    if let Some(ref html) = doc.raw_html {
        return html.clone();
    }

    let mut output = String::new();
    for node in &doc.nodes {
        output.push_str(&format!("[{}] <{}", node.gen_id, node.tag));
        for (k, v) in &node.attributes {
            output.push_str(&format!(" {k}=\"{v}\""));
        }
        output.push('>');
        if !node.text.is_empty() {
            output.push_str(&format!(" {}", node.text));
        }
        output.push('\n');
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_squash_text_under_limit() {
        let text = "First sentence. Second sentence.";
        let result = squash_text(text, 3, 500);
        assert_eq!(result, "First sentence. Second sentence.");
    }

    #[test]
    fn test_squash_text_sampling() {
        let text = "One. Two. Three. Four. Five.";
        let result = squash_text(text, 3, 500);
        assert!(result.contains("One."));
        assert!(result.contains("Five."));
    }

    #[test]
    fn test_truncate_at_word_boundary() {
        let s = "hello world this is a long sentence";
        let result = truncate_at_word_boundary(s, 15);
        assert_eq!(result, "hello world");
    }

    #[test]
    fn test_sample_evenly() {
        let items = vec!["a", "b", "c", "d", "e"];
        let result = sample_evenly(&items, 3);
        assert_eq!(result, vec!["a", "c", "e"]);
    }
}
