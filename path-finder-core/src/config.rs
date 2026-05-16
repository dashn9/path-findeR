use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Json,
    Toml,
}

/// Pipeline config — crosses the FFI as JSON. Mirror field changes in the Go
/// `internal/core/bridge.go` payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub max_direct_kb: usize,
    pub top_n_nodes: usize,
    pub max_sentences: usize,
    pub max_sentence_chars: usize,
    pub similarity_threshold: f32,
    pub max_retries: usize,
    pub output_format: Format,
    pub exclusions: Vec<String>,
    pub min_pages: usize,
    pub ai: AiConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            max_direct_kb: 300, top_n_nodes: 30, max_sentences: 3, max_sentence_chars: 500,
            similarity_threshold: 0.75, max_retries: 3, output_format: Format::Json,
            exclusions: vec![], min_pages: 2, ai: AiConfig::default(),
        }
    }
}

impl Config {
    pub fn effective_min_pages(&self) -> usize { self.min_pages.max(2) }
}

/// `adapter` picks which nested struct the dispatcher reads.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AiConfig {
    pub adapter: String,
    pub anthropic: AnthropicConfig,
    pub openai: OpenAIConfig,
    pub openrouter: OpenRouterConfig,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self { adapter: "anthropic".into(), anthropic: Default::default(), openai: Default::default(), openrouter: Default::default() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AnthropicConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub version: String,
}

impl Default for AnthropicConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: "https://api.anthropic.com/v1".into(),
            model: "claude-sonnet-4-20250514".into(),
            version: "2023-06-01".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct OpenAIConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

impl Default for OpenAIConfig {
    fn default() -> Self {
        Self { api_key: String::new(), base_url: "https://api.openai.com/v1".into(), model: "gpt-4o-mini".into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct OpenRouterConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

impl Default for OpenRouterConfig {
    fn default() -> Self {
        Self { api_key: String::new(), base_url: "https://openrouter.ai/api/v1".into(), model: "anthropic/claude-sonnet-4".into() }
    }
}
