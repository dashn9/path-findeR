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
    /// Inspector trace — per-label candidate scoreboard, validation matrix,
    /// extracted values, DOM context. Populated by the pipeline alongside the
    /// final manifest so the UI can show "why did this selector get picked".
    pub trace: ParserTrace,
}

/// One CSS selector candidate considered for a label, scored by per-page
/// coverage. `note` is a short human-readable summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateSel {
    pub css: String,
    pub score: f32,
    pub note: String,
}

/// One line in the rendered DOM-context snippet shown beside the chosen
/// selector. `r#match` is true on the line that hosts the chosen element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomLine {
    pub i: usize,
    pub t: String,
    #[serde(rename = "match", skip_serializing_if = "Option::is_none")]
    pub r#match: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelTrace {
    pub rationale: String,
    pub candidates: Vec<CandidateSel>,
    /// Index into `candidates` of the selector actually adopted, or -1 when
    /// the label is unresolved.
    pub chosen: i32,
    pub unresolved: bool,
    /// Match matrix `[selectorIdx][pageIdx] = 0|1`. Renders as a heat grid
    /// in the Inspector.
    pub validation: Vec<Vec<u8>>,
    pub dom: Vec<DomLine>,
    /// Text extracted from each page by the first selector that matched
    /// there. "(missing)" placeholder when no selector hit.
    pub values: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageRef {
    pub url: String,
    pub short: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ParserTrace {
    pub pages: Vec<PageRef>,
    pub labels: HashMap<String, LabelTrace>,
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
    /// Optional one-sentence reasoning the model emits for each label.
    /// Surfaced in the Inspector. Empty when the model omitted it.
    #[serde(default)]
    pub rationale: String,
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
