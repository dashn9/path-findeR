use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Format {
    Json,
    Toml,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub ai_endpoint: String,
    pub ai_model: String,
    #[serde(default = "default_max_direct_kb")]
    pub max_direct_kb: usize,
    #[serde(default = "default_top_n_nodes")]
    pub top_n_nodes: usize,
    #[serde(default = "default_max_sentences")]
    pub max_sentences: usize,
    #[serde(default = "default_max_sentence_chars")]
    pub max_sentence_chars: usize,
    #[serde(default = "default_similarity_threshold")]
    pub similarity_threshold: f32,
    #[serde(default = "default_max_retries")]
    pub max_retries: usize,
    #[serde(default = "default_output_format")]
    pub output_format: Format,
    #[serde(default)]
    pub exclusions: Vec<String>,
    #[serde(default = "default_min_pages")]
    pub min_pages: usize,
}

fn default_max_direct_kb() -> usize { 300 }
fn default_top_n_nodes() -> usize { 30 }
fn default_max_sentences() -> usize { 3 }
fn default_max_sentence_chars() -> usize { 500 }
fn default_similarity_threshold() -> f32 { 0.75 }
fn default_max_retries() -> usize { 3 }
fn default_output_format() -> Format { Format::Json }
fn default_min_pages() -> usize { 2 }

impl Config {
    pub fn effective_min_pages(&self) -> usize {
        self.min_pages.max(2)
    }
}
