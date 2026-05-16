//! LLM dispatch. One trait, three providers, one shared HTTP path. The
//! adapter string on `AiConfig` picks the impl at call time.

use reqwest::blocking::{Client, Response};
use serde_json::{json, Value};

use crate::config::AiConfig;
use crate::error::{PathFinderError, Result};

pub trait LlmProvider {
    fn complete(&self, system: &str, user: &str) -> Result<String>;
}

pub struct AiService<'a>(&'a AiConfig);

impl<'a> AiService<'a> {
    pub fn new(c: &'a AiConfig) -> Self { Self(c) }

    pub fn complete(&self, system: &str, user: &str) -> Result<String> {
        match self.0.adapter.as_str() {
            "openai" => chat_completion(&self.0.openai.base_url, &self.0.openai.api_key, &self.0.openai.model, system, user),
            "openrouter" => chat_completion(&self.0.openrouter.base_url, &self.0.openrouter.api_key, &self.0.openrouter.model, system, user),
            _ => anthropic_messages(&self.0.anthropic.base_url, &self.0.anthropic.api_key, &self.0.anthropic.version, &self.0.anthropic.model, system, user),
        }
    }
}

fn anthropic_messages(base: &str, key: &str, version: &str, model: &str, system: &str, user: &str) -> Result<String> {
    let body = json!({ "model": model, "max_tokens": 4096, "system": system, "messages": [{"role": "user", "content": user}] });
    let resp = Client::new()
        .post(format!("{}/messages", base.trim_end_matches('/')))
        .header("content-type", "application/json")
        .header("x-api-key", key)
        .header("anthropic-version", version)
        .json(&body)
        .send()
        .map_err(|e| PathFinderError::AiRequest(e.to_string()))?;
    let v = read_json(resp)?;
    v["content"]
        .as_array()
        .and_then(|a| a.iter().find(|b| b["type"] == "text"))
        .and_then(|b| b["text"].as_str())
        .map(String::from)
        .ok_or_else(|| PathFinderError::AiResponseParse("no text in response".into()))
}

fn chat_completion(base: &str, key: &str, model: &str, system: &str, user: &str) -> Result<String> {
    let body = json!({ "model": model, "messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]});
    let resp = Client::new()
        .post(format!("{}/chat/completions", base.trim_end_matches('/')))
        .bearer_auth(key)
        .json(&body)
        .send()
        .map_err(|e| PathFinderError::AiRequest(e.to_string()))?;
    let v = read_json(resp)?;
    v["choices"][0]["message"]["content"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| PathFinderError::AiResponseParse("no choices[0].message.content".into()))
}

fn read_json(resp: Response) -> Result<Value> {
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().unwrap_or_default();
        return Err(PathFinderError::AiRequest(format!("HTTP {status}: {body}")));
    }
    resp.json().map_err(|e| PathFinderError::AiResponseParse(e.to_string()))
}
