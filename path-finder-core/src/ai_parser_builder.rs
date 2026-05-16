//! Bridge between the semantic-document layer and the AI provider.
//!
//! Formats the corpus into a single prompt, dispatches through `AiService`
//! (which picks the configured provider), then parses the JSON the model
//! returns. Selector derivation happens elsewhere — this module only collects
//! `(label, gen_id)` pairs and similarity clusters.

use crate::ai::AiService;
use crate::config::Config;
use crate::error::{PathFinderError, Result};
use crate::semantic::{format_semantic_doc, SemanticDocument};
use crate::types::{AiCluster, AiLabelResult, AiResponse};

const SYSTEM_PROMPT: &str = r#"You are a content structure analyzer. You receive HTML pages or semantic document representations and identify distinct content zones.

Your task:
1. Identify meaningful content zones (title, price, description, author, date, image, etc.)
2. For each zone, return a label and the gen_id of the node that contains it
3. Identify clusters of gen_ids that represent similar/repeated content (e.g., list items, product cards) with a similarity score (0.0-1.0)

Rules:
- Labels should be snake_case descriptive names (e.g., "article_title", "product_price", "author_name")
- Only identify content that would be useful to extract — skip navigation, boilerplate, ads
- For clusters, group nodes that serve the same structural role across the page
- NEVER generate CSS selectors — only return gen_ids

Respond in JSON format:
{
  "labels": [{"label": "article_title", "gen_id": "n_abc123"}, ...],
  "clusters": [{"gen_ids": ["n_abc", "n_def"], "similarity": 0.85}, ...]
}"#;

pub fn call_ai(documents: &[SemanticDocument], config: &Config) -> Result<AiResponse> {
    let mut content = String::new();
    for (i, doc) in documents.iter().enumerate() {
        content.push_str(&format!("=== Page {} ===\n", i + 1));
        content.push_str(&format_semantic_doc(doc));
        content.push('\n');
    }

    let service = AiService::new(&config.ai);
    let raw = service.complete(SYSTEM_PROMPT, &content)?;
    parse_ai_text(&raw)
}

/// Pulls the JSON object out of the model's reply (which may be wrapped in
/// ```json fences, free prose, or be raw JSON) and decodes it into `AiResponse`.
pub(crate) fn parse_ai_text(text: &str) -> Result<AiResponse> {
    let json_str = extract_json(text)?;
    let parsed: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| PathFinderError::AiResponseParse(e.to_string()))?;

    let labels: Vec<AiLabelResult> = parsed["labels"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    Some(AiLabelResult {
                        label: v["label"].as_str()?.to_string(),
                        gen_id: v["gen_id"].as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let clusters: Vec<AiCluster> = parsed["clusters"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    let gen_ids: Vec<String> = v["gen_ids"]
                        .as_array()?
                        .iter()
                        .filter_map(|id| id.as_str().map(String::from))
                        .collect();
                    let similarity = v["similarity"].as_f64()? as f32;
                    Some(AiCluster { gen_ids, similarity })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(AiResponse { labels, clusters })
}

fn extract_json(text: &str) -> Result<String> {
    if let Some(start) = text.find("```json") {
        let after = &text[start + 7..];
        if let Some(end) = after.find("```") {
            return Ok(after[..end].trim().to_string());
        }
    }
    if let Some(start) = text.find("```") {
        let after = &text[start + 3..];
        if let Some(end) = after.find("```") {
            return Ok(after[..end].trim().to_string());
        }
    }
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            return Ok(text[start..=end].to_string());
        }
    }
    Err(PathFinderError::AiResponseParse(
        "no JSON found in AI response".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_code_fenced_json() {
        let text = "Here:\n```json\n{\"labels\":[],\"clusters\":[]}\n```";
        let json = extract_json(text).unwrap();
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(v["labels"].is_array());
    }

    #[test]
    fn extract_raw_json() {
        let text = r#"{"labels":[{"label":"title","gen_id":"n_1"}],"clusters":[]}"#;
        let parsed = parse_ai_text(text).unwrap();
        assert_eq!(parsed.labels.len(), 1);
        assert_eq!(parsed.labels[0].label, "title");
    }

    #[test]
    fn parses_clusters_with_similarity() {
        let text = r#"{
            "labels": [{"label":"title","gen_id":"n_1"}],
            "clusters": [{"gen_ids":["n_2","n_3"], "similarity": 0.9}]
        }"#;
        let parsed = parse_ai_text(text).unwrap();
        assert_eq!(parsed.clusters.len(), 1);
        assert_eq!(parsed.clusters[0].similarity, 0.9);
    }
}
