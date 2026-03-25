use std::collections::HashMap;
use uuid::Uuid;

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
    config: &Config,
) -> Result<ParserManifest> {
    let min_pages = config.effective_min_pages();
    if pages.len() < min_pages {
        return Err(PathFinderError::InsufficientPages {
            min: min_pages,
            got: pages.len(),
        });
    }

    // Step 1: URL pattern detection
    let urls: Vec<&str> = pages.iter().map(|(url, _)| url.as_str()).collect();
    let (url_pattern, dynamic_values_per_page) = detect_url_pattern(&urls)?;

    // Step 2: Parse HTML pages
    let parsed_pages: Vec<_> = pages
        .iter()
        .zip(dynamic_values_per_page.iter())
        .map(|((url, html), dyn_vals)| parse_html(url, html, dyn_vals.clone()))
        .collect();

    // Step 3: Analyze and score
    let scored_trees: Vec<_> = parsed_pages.iter().map(|p| analyze(p, config)).collect();

    // Step 4: Build semantic documents
    let semantic_docs = build_semantic_documents(&scored_trees, &pages, config);

    // Step 5-8: AI call + selector build + validate with retry loop
    let mut retry_count = 0;
    let parser_map = loop {
        // Step 5: Call AI
        let ai_response = call_ai(&semantic_docs, config)?;

        // Step 6: Build selectors
        let candidates = build_selectors(&ai_response, &parsed_pages, &pages, config);

        // Step 7: Validate
        let results = validate_selectors(&candidates, &pages);

        // Check if any are unresolved
        let has_unresolved = results.iter().any(|r| r.unresolved);

        if !has_unresolved || retry_count >= config.max_retries {
            // Build final parser map
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

        retry_count += 1;
    };

    let parser_id = Uuid::new_v4().as_simple().to_string()[..6].to_string();

    Ok(ParserManifest {
        parser_id,
        url_pattern,
        parser: parser_map,
    })
}
