//! LLM dispatch. One trait, three providers, one shared HTTP path. The
//! adapter string on `AiConfig` picks the impl at call time.

use std::error::Error as _;
use std::time::Duration;

use reqwest::blocking::{Client, Response};
use serde_json::{json, Value};

use crate::config::AiConfig;
use crate::error::{PathFinderError, Result};

/// AI calls block the pipeline; bound them so a hung provider eventually
/// fails rather than holding the runner forever. 5 minutes is generous —
/// real calls finish in seconds, but cold-start / queued requests on
/// shared providers can run long, and biasing toward "let it finish" beats
/// a noisy timeout-retry loop.
const AI_TIMEOUT: Duration = Duration::from_secs(300);

/// Flatten reqwest's nested error chain into one readable string. The default
/// Display only shows the top-level message ("error sending request for
/// url..."), hiding the underlying cause (DNS, TLS, refused, etc.). We walk
/// `source()` to surface the actual reason in the pipeline error.
fn flatten_err(e: reqwest::Error) -> String {
    let mut parts = vec![e.to_string()];
    let mut src = e.source();
    while let Some(s) = src {
        parts.push(s.to_string());
        src = s.source();
    }
    parts.join(" → ")
}

fn client() -> std::result::Result<Client, reqwest::Error> {
    Client::builder().timeout(AI_TIMEOUT).build()
}

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
    if key.is_empty() {
        return Err(PathFinderError::AiRequest(
            "anthropic: ANTHROPIC_API_KEY is empty — check .env and that the service loaded it".into(),
        ));
    }
    let body = json!({ "model": model, "max_tokens": 4096, "system": system, "messages": [{"role": "user", "content": user}] });
    let resp = client()
        .map_err(|e| PathFinderError::AiRequest(format!("anthropic: build client: {}", flatten_err(e))))?
        .post(format!("{}/messages", base.trim_end_matches('/')))
        .header("content-type", "application/json")
        .header("x-api-key", key)
        .header("anthropic-version", version)
        .json(&body)
        .send()
        .map_err(|e| PathFinderError::AiRequest(format!("anthropic POST: {}", flatten_err(e))))?;
    let v = read_json("anthropic", resp)?;
    v["content"]
        .as_array()
        .and_then(|a| a.iter().find(|b| b["type"] == "text"))
        .and_then(|b| b["text"].as_str())
        .map(String::from)
        .ok_or_else(|| PathFinderError::AiResponseParse("anthropic: no text in response".into()))
}

fn chat_completion(base: &str, key: &str, model: &str, system: &str, user: &str) -> Result<String> {
    if key.is_empty() {
        return Err(PathFinderError::AiRequest(
            "openai/openrouter: API key is empty — check .env and that the service loaded it".into(),
        ));
    }
    let body = json!({ "model": model, "messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]});
    let resp = client()
        .map_err(|e| PathFinderError::AiRequest(format!("openai: build client: {}", flatten_err(e))))?
        .post(format!("{}/chat/completions", base.trim_end_matches('/')))
        .bearer_auth(key)
        .json(&body)
        .send()
        .map_err(|e| PathFinderError::AiRequest(format!("openai POST: {}", flatten_err(e))))?;
    let v = read_json("openai", resp)?;
    v["choices"][0]["message"]["content"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| PathFinderError::AiResponseParse("openai: no choices[0].message.content".into()))
}

fn read_json(provider: &str, resp: Response) -> Result<Value> {
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().unwrap_or_default();
        return Err(PathFinderError::AiRequest(format!("{provider}: HTTP {status}: {body}")));
    }
    resp.json()
        .map_err(|e| PathFinderError::AiResponseParse(format!("{provider}: {}", flatten_err(e))))
}
