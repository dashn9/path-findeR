use std::collections::{HashMap, HashSet};

use crate::ai_parser_builder::call_ai;
use crate::analyzer::analyze;
use crate::config::Config;
use crate::error::{PathFinderError, Result};
use crate::parser::parse_html;
use crate::selector_builder::build_selectors;
use crate::semantic::build_semantic_documents;
use crate::types::{ConcreteType, Parser, ParserManifest};
use crate::url_pattern::detect_url_pattern;
use crate::validator::validate_selectors;

pub fn run_pipeline(
    pages: Vec<(String, String)>,
    parser_id: String,
    config: &Config,
) -> Result<ParserManifest> {
    let min_pages = config.effective_min_pages();
    if pages.len() < min_pages {
        return Err(PathFinderError::InsufficientPages {
            min: min_pages,
            got: pages.len(),
        });
    }

    let urls: Vec<&str> = pages.iter().map(|(url, _)| url.as_str()).collect();
    let (url_pattern, dynamic_values_per_page) = detect_url_pattern(&urls)?;

    let parsed_pages: Vec<_> = pages
        .iter()
        .zip(dynamic_values_per_page.iter())
        .map(|((url, html), dyn_vals)| parse_html(url, html, dyn_vals.clone()))
        .collect();

    let mut blocked_gen_ids: HashSet<String> = HashSet::new();
    let mut retry_count = 0;

    let parser_map = loop {
        let scored_trees: Vec<_> = parsed_pages
            .iter()
            .map(|p| {
                let mut tree = analyze(p, config);
                if !blocked_gen_ids.is_empty() {
                    tree.nodes.retain(|n| !blocked_gen_ids.contains(&n.gen_id));
                }
                tree
            })
            .collect();

        let semantic_docs = build_semantic_documents(&scored_trees, &pages, config);

        let ai_response = call_ai(&semantic_docs, config)?;

        let candidates = build_selectors(&ai_response, &parsed_pages, &pages, config);

        let results = validate_selectors(&candidates, &pages);

        let has_unresolved = results.iter().any(|r| r.unresolved);

        if !has_unresolved || retry_count >= config.max_retries {
            let mut map = HashMap::new();
            for result in results {
                map.insert(
                    result.label.clone(),
                    Parser {
                        label: result.label,
                        selectors: result.selectors,
                        concrete_types: vec![ConcreteType::Text],
                        abstract_types: vec![],
                        array: result.array,
                        unresolved: result.unresolved,
                    },
                );
            }
            break map;
        }

        for r in &results {
            if r.unresolved {
                if let Some(lr) = ai_response.labels.iter().find(|l| l.label == r.label) {
                    blocked_gen_ids.insert(lr.gen_id.clone());
                }
            }
        }

        retry_count += 1;
    };

    Ok(ParserManifest {
        parser_id,
        url_pattern,
        parser: parser_map,
    })
}
