use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticNode {
    pub gen_id: String,
    pub tag: String,
    pub attributes: HashMap<String, String>,
    pub text: String,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Selector {
    pub css: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConcreteType {
    Text,
    Integer,
    Float,
    Boolean,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AbstractType {
    Date,
    DateTime,
    Time,
    Duration,
    Url,
    Email,
    PhoneNumber,
    ImageUrl,
    VideoUrl,
    Color,
    Currency,
    Percentage,
    Title,
    Headline,
    Byline,
    Author,
    Description,
    Summary,
    Price,
    Rating,
    ReviewCount,
    ProductName,
    Category,
    Tag,
    Label,
    Badge,
    Status,
    Address,
    PostalCode,
    GeoCoordinate,
    Language,
    Identifier,
    Count,
    Rank,
    Score,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parser {
    pub label: String,
    pub selectors: Vec<Selector>,
    pub concrete_types: Vec<ConcreteType>,
    pub abstract_types: Vec<AbstractType>,
    pub array: bool,
    pub unresolved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrlPattern {
    pub host: String,
    pub pattern: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParserManifest {
    pub parser_id: String,
    pub url_pattern: UrlPattern,
    pub parser: HashMap<String, Parser>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegenerationRequest {
    pub parser_id: String,
    pub labels: RegenerationScope,
    pub force: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RegenerationScope {
    All,
    Labels(Vec<String>),
}

#[derive(Debug, Clone)]
pub struct ParsedPage {
    pub url: String,
    pub nodes: Vec<ParsedNode>,
    pub dynamic_values: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ParsedNode {
    pub gen_id: String,
    pub tag: String,
    pub attributes: HashMap<String, String>,
    pub text: String,
    pub children: Vec<String>,
    pub parent: Option<String>,
    pub depth: usize,
}

#[derive(Debug, Clone)]
pub struct ScoredTree {
    pub url: String,
    pub nodes: Vec<SemanticNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiLabelResult {
    pub label: String,
    pub gen_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCluster {
    pub gen_ids: Vec<String>,
    pub similarity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub labels: Vec<AiLabelResult>,
    pub clusters: Vec<AiCluster>,
}
