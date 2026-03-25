use serde_json::json;

use crate::config::Config;
use crate::error::{PathFinderError, Result};
use crate::semantic::{SemanticDocument, format_semantic_doc};
use crate::types::{AiResponse, AiLabelResult, AiCluster};

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

pub fn call_ai(
    documents: &[SemanticDocument],
    config: &Config,
) -> Result<AiResponse> {
    let mut content = String::new();
    for (i, doc) in documents.iter().enumerate() {
        content.push_str(&format!("=== Page {} ===\n", i + 1));
        content.push_str(&format_semantic_doc(doc));
        content.push('\n');
    }

    let request_body = json!({
        "model": config.ai_model,
        "max_tokens": 4096,
        "messages": [
            {
                "role": "user",
                "content": content
            }
        ],
        "system": SYSTEM_PROMPT
    });

    let client = reqwest::blocking::Client::new();
    let response = client
        .post(&config.ai_endpoint)
        .header("Content-Type", "application/json")
        .header("x-api-key", std::env::var("ANTHROPIC_API_KEY").unwrap_or_default())
        .header("anthropic-version", "2023-06-01")
        .json(&request_body)
        .send()
        .map_err(|e| PathFinderError::AiRequest(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        return Err(PathFinderError::AiRequest(format!(
            "HTTP {status}: {body}"
        )));
    }

    let resp_json: serde_json::Value = response
        .json()
        .map_err(|e| PathFinderError::AiResponseParse(e.to_string()))?;

    parse_ai_response(&resp_json)
}

fn parse_ai_response(resp: &serde_json::Value) -> Result<AiResponse> {
    // Extract text content from the AI response
    let text = resp["content"]
        .as_array()
        .and_then(|arr| arr.iter().find(|b| b["type"] == "text"))
        .and_then(|b| b["text"].as_str())
        .ok_or_else(|| PathFinderError::AiResponseParse("no text in response".into()))?;

    // Try to parse the JSON from the response text
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
                    Some(AiCluster {
                        gen_ids,
                        similarity,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(AiResponse { labels, clusters })
}

fn extract_json(text: &str) -> Result<String> {
    // Try to find JSON block in markdown code fence
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

    // Try to find raw JSON object
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
    fn test_extract_json_code_fence() {
        let text = r#"Here is the result:
```json
{"labels": [], "clusters": []}
```"#;
        let json = extract_json(text).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed["labels"].is_array());
    }

    #[test]
    fn test_extract_json_raw() {
        let text = r#"{"labels": [{"label": "title", "gen_id": "n_1"}], "clusters": []}"#;
        let json = extract_json(text).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["labels"][0]["label"], "title");
    }

    #[test]
    fn test_parse_ai_response() {
        let resp = json!({
            "content": [{
                "type": "text",
                "text": "{\"labels\": [{\"label\": \"title\", \"gen_id\": \"n_1\"}], \"clusters\": [{\"gen_ids\": [\"n_2\", \"n_3\"], \"similarity\": 0.9}]}"
            }]
        });
        let result = parse_ai_response(&resp).unwrap();
        assert_eq!(result.labels.len(), 1);
        assert_eq!(result.labels[0].label, "title");
        assert_eq!(result.clusters.len(), 1);
        assert_eq!(result.clusters[0].similarity, 0.9);
    }
}
