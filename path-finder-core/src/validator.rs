use scraper::{Html, Selector as CssSelector};

use crate::selector_builder::SelectorCandidate;
use crate::types::Selector;

pub struct ValidationResult {
    pub label: String,
    pub selectors: Vec<Selector>,
    pub array: bool,
    pub unresolved: bool,
}

pub fn validate_selectors(
    candidates: &[SelectorCandidate],
    raw_htmls: &[(String, String)],
) -> Vec<ValidationResult> {
    candidates
        .iter()
        .map(|candidate| {
            let valid_selectors = validate_candidate(candidate, raw_htmls);

            ValidationResult {
                label: candidate.label.clone(),
                selectors: valid_selectors.clone(),
                array: candidate.array,
                unresolved: valid_selectors.is_empty(),
            }
        })
        .collect()
}

fn validate_candidate(
    candidate: &SelectorCandidate,
    raw_htmls: &[(String, String)],
) -> Vec<Selector> {
    let docs: Vec<Html> = raw_htmls
        .iter()
        .map(|(_, html)| Html::parse_document(html))
        .collect();

    // Try each selector: prefer one that works across all pages
    for sel in &candidate.selectors {
        if let Ok(css_sel) = CssSelector::parse(&sel.css) {
            let matches_all = docs.iter().all(|doc| doc.select(&css_sel).next().is_some());
            if matches_all {
                return vec![sel.clone()];
            }
        }
    }

    // Selector divergence: collect selectors that work on at least one page
    // ordered by coverage
    let mut scored: Vec<(Selector, usize)> = candidate
        .selectors
        .iter()
        .filter_map(|sel| {
            let css_sel = CssSelector::parse(&sel.css).ok()?;
            let match_count = docs
                .iter()
                .filter(|doc| doc.select(&css_sel).next().is_some())
                .count();
            if match_count > 0 {
                Some((sel.clone(), match_count))
            } else {
                None
            }
        })
        .collect();

    scored.sort_by(|a, b| b.1.cmp(&a.1));

    // Check if the combined selectors cover all pages
    let mut covered = vec![false; docs.len()];
    let mut result = Vec::new();

    for (sel, _) in &scored {
        if let Ok(css_sel) = CssSelector::parse(&sel.css) {
            let mut added_coverage = false;
            for (i, doc) in docs.iter().enumerate() {
                if !covered[i] && doc.select(&css_sel).next().is_some() {
                    covered[i] = true;
                    added_coverage = true;
                }
            }
            if added_coverage {
                result.push(sel.clone());
            }
        }
        if covered.iter().all(|&c| c) {
            break;
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_matching_selector() {
        let candidate = SelectorCandidate {
            label: "title".into(),
            selectors: vec![Selector { css: "h1".into() }],
            array: false,
        };
        let pages = vec![
            ("url1".into(), "<html><body><h1>Title 1</h1></body></html>".into()),
            ("url2".into(), "<html><body><h1>Title 2</h1></body></html>".into()),
        ];
        let results = validate_selectors(&[candidate], &pages);
        assert!(!results[0].unresolved);
        assert_eq!(results[0].selectors.len(), 1);
    }

    #[test]
    fn test_validate_no_match() {
        let candidate = SelectorCandidate {
            label: "title".into(),
            selectors: vec![Selector {
                css: "#nonexistent".into(),
            }],
            array: false,
        };
        let pages = vec![
            ("url1".into(), "<html><body><h1>Title</h1></body></html>".into()),
        ];
        let results = validate_selectors(&[candidate], &pages);
        assert!(results[0].unresolved);
    }
}
