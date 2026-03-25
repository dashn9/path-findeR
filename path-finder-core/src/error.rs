use thiserror::Error;

#[derive(Debug, Error)]
pub enum PathFinderError {
    #[error("insufficient pages: need at least {min}, got {got}")]
    InsufficientPages { min: usize, got: usize },

    #[error("URL parse error: {0}")]
    UrlParse(String),

    #[error("no common URL pattern found")]
    NoUrlPattern,

    #[error("HTML parse error: {0}")]
    HtmlParse(String),

    #[error("AI request failed: {0}")]
    AiRequest(String),

    #[error("AI response parse error: {0}")]
    AiResponseParse(String),

    #[error("selector generation failed for label '{0}'")]
    SelectorGeneration(String),

    #[error("validation failed after {0} retries")]
    ValidationExhausted(usize),

    #[error("regeneration refused: newer pages exist for parser '{0}'")]
    RegenerationRefused(String),

    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, PathFinderError>;
