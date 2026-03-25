pub mod ai_parser_builder;
pub mod analyzer;
pub mod config;
pub mod error;
pub mod exclusions;
pub mod parser;
pub mod pipeline;
pub mod selector_builder;
pub mod semantic;
pub mod types;
pub mod url_pattern;
pub mod validator;

use pyo3::prelude::*;
use pyo3::types::PyDict;

use crate::config::{Config, Format};
use crate::error::PathFinderError;

#[pyfunction]
fn run(py: Python<'_>, pages: Vec<(String, String)>, config_dict: &Bound<'_, PyDict>) -> PyResult<PyObject> {
    let config = parse_config(config_dict)?;
    let manifest = pipeline::run_pipeline(pages, &config)
        .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e.to_string()))?;

    let json_str = serde_json::to_string(&manifest)
        .map_err(|e| pyo3::exceptions::PyRuntimeError::new_err(e.to_string()))?;

    let json_module = py.import("json")?;
    let result = json_module.call_method1("loads", (json_str,))?;
    Ok(result.into_py_any(py)?)
}

fn parse_config(dict: &Bound<'_, PyDict>) -> PyResult<Config> {
    let get_str = |key: &str, default: &str| -> String {
        dict.get_item(key)
            .ok()
            .flatten()
            .and_then(|v| v.extract::<String>().ok())
            .unwrap_or_else(|| default.to_string())
    };

    let get_usize = |key: &str, default: usize| -> usize {
        dict.get_item(key)
            .ok()
            .flatten()
            .and_then(|v| v.extract::<usize>().ok())
            .unwrap_or(default)
    };

    let get_f32 = |key: &str, default: f32| -> f32 {
        dict.get_item(key)
            .ok()
            .flatten()
            .and_then(|v| v.extract::<f32>().ok())
            .unwrap_or(default)
    };

    let output_format = match get_str("output_format", "json").to_lowercase().as_str() {
        "toml" => Format::Toml,
        _ => Format::Json,
    };

    let exclusions: Vec<String> = dict
        .get_item("exclusions")
        .ok()
        .flatten()
        .and_then(|v| v.extract::<Vec<String>>().ok())
        .unwrap_or_default();

    Ok(Config {
        ai_endpoint: get_str("ai_endpoint", "https://api.anthropic.com/v1/messages"),
        ai_model: get_str("ai_model", "claude-sonnet-4-20250514"),
        max_direct_kb: get_usize("max_direct_kb", 300),
        top_n_nodes: get_usize("top_n_nodes", 30),
        max_sentences: get_usize("max_sentences", 3),
        max_sentence_chars: get_usize("max_sentence_chars", 500),
        similarity_threshold: get_f32("similarity_threshold", 0.75),
        max_retries: get_usize("max_retries", 3),
        output_format,
        exclusions,
        min_pages: get_usize("min_pages", 2),
    })
}

#[pymodule]
fn path_finder_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(run, m)?)?;
    Ok(())
}
