use scraper::{Html, Selector as CssSelector};

use crate::selector_builder::SelectorCandidate;
use crate::types::Selector;

pub struct ValidationResult {
    pub label: String,
    pub selectors: Vec<Selector>,
    pub array: bool,
    pub unresolved: bool,
}

/// ValidationTrace is the per-label data the Inspector renders: the full
/// candidate × page match matrix and the text actually extracted from each
/// page. Built alongside the `ValidationResult` so the pipeline doesn't
/// re-parse the corpus a second time.
pub struct ValidationTrace {
    pub label: String,
    /// `validation[selectorIdx][pageIdx] = 0 | 1`.
    pub validation: Vec<Vec<u8>>,
    /// Coverage = matches / total_pages, used to score candidates in the UI.
    pub coverage: Vec<f32>,
    /// Text the first-matching selector extracted on each page. Empty string
    /// if no candidate hit on that page.
    pub values: Vec<String>,
    /// Index into `candidate.selectors` of the primary adopted selector, or
    /// -1 when the label is unresolved.
    pub chosen: i32,
}

pub struct ValidationOutput {
    pub results: Vec<ValidationResult>,
    pub traces: Vec<ValidationTrace>,
}

pub fn validate_selectors(
    candidates: &[SelectorCandidate],
    raw_htmls: &[(String, String)],
) -> ValidationOutput {
    let docs: Vec<Html> = raw_htmls
        .iter()
        .map(|(_, html)| Html::parse_document(html))
        .collect();
    let page_count = docs.len();

    let mut results = Vec::with_capacity(candidates.len());
    let mut traces = Vec::with_capacity(candidates.len());

    for candidate in candidates {
        // Pass 1: compute the full validation matrix for the Inspector.
        // Each row is one selector; each column is one page.
        let mut matrix: Vec<Vec<u8>> = Vec::with_capacity(candidate.selectors.len());
        let mut coverage: Vec<f32> = Vec::with_capacity(candidate.selectors.len());
        for sel in &candidate.selectors {
            let css_sel = CssSelector::parse(&sel.css).ok();
            let row: Vec<u8> = docs
                .iter()
                .map(|doc| {
                    css_sel
                        .as_ref()
                        .map(|s| if doc.select(s).next().is_some() { 1 } else { 0 })
                        .unwrap_or(0)
                })
                .collect();
            let hits = row.iter().filter(|&&x| x == 1).count();
            let cov = if page_count == 0 { 0.0 } else { hits as f32 / page_count as f32 };
            matrix.push(row);
            coverage.push(cov);
        }

        // Pass 2: pick the chosen selectors using the existing rules
        // (prefer single selector covering all pages; otherwise stitch).
        let (adopted, chosen_idx) = pick_selectors(candidate, &matrix);

        // Pass 3: extract text values using the first selector that matches
        // each page (in candidate order). These are what an actual extractor
        // would have pulled.
        let values: Vec<String> = docs
            .iter()
            .enumerate()
            .map(|(i, doc)| extract_first_value(candidate, &matrix, doc, i))
            .collect();

        let unresolved = adopted.is_empty();
        results.push(ValidationResult {
            label: candidate.label.clone(),
            selectors: adopted,
            array: candidate.array,
            unresolved,
        });
        traces.push(ValidationTrace {
            label: candidate.label.clone(),
            validation: matrix,
            coverage,
            values,
            chosen: if unresolved { -1 } else { chosen_idx as i32 },
        });
    }

    ValidationOutput { results, traces }
}

/// pick_selectors implements the original "single covers everything; else
/// stitch by coverage" rule but is now driven off the pre-computed matrix
/// instead of re-parsing pages.
fn pick_selectors(
    candidate: &SelectorCandidate,
    matrix: &[Vec<u8>],
) -> (Vec<Selector>, usize) {
    // Prefer a single selector that hits every page.
    for (i, row) in matrix.iter().enumerate() {
        if !row.is_empty() && row.iter().all(|&x| x == 1) {
            return (vec![candidate.selectors[i].clone()], i);
        }
    }

    // Otherwise: order selectors by coverage and stitch until all pages are
    // covered.
    let mut scored: Vec<(usize, usize)> = matrix
        .iter()
        .enumerate()
        .map(|(i, row)| (i, row.iter().filter(|&&x| x == 1).count()))
        .filter(|(_, hits)| *hits > 0)
        .collect();
    scored.sort_by(|a, b| b.1.cmp(&a.1));

    let page_count = matrix.first().map(|r| r.len()).unwrap_or(0);
    let mut covered = vec![false; page_count];
    let mut adopted = Vec::new();
    let mut primary = usize::MAX;
    for (i, _) in scored {
        let row = &matrix[i];
        let mut added = false;
        for (p, &m) in row.iter().enumerate() {
            if m == 1 && !covered[p] {
                covered[p] = true;
                added = true;
            }
        }
        if added {
            adopted.push(candidate.selectors[i].clone());
            if primary == usize::MAX {
                primary = i;
            }
        }
        if covered.iter().all(|&c| c) {
            break;
        }
    }
    (adopted, primary.min(matrix.len().saturating_sub(1)))
}

/// Extract the text value the first matching selector pulls from `doc`.
/// "(missing)" when no candidate hits.
fn extract_first_value(
    candidate: &SelectorCandidate,
    matrix: &[Vec<u8>],
    doc: &Html,
    page_idx: usize,
) -> String {
    for (i, sel) in candidate.selectors.iter().enumerate() {
        if matrix.get(i).and_then(|row| row.get(page_idx)).copied() != Some(1) {
            continue;
        }
        if let Ok(css_sel) = CssSelector::parse(&sel.css) {
            if let Some(el) = doc.select(&css_sel).next() {
                let text = el.text().collect::<String>().trim().to_string();
                if !text.is_empty() {
                    // Cap length so the UI doesn't overflow on long bodies.
                    return truncate(&text, 200);
                }
                // For empty text (e.g. <img/>) fall back to src/href.
                let el_ref = el.value();
                for attr in ["src", "href", "value", "alt"] {
                    if let Some(v) = el_ref.attr(attr) {
                        return truncate(v, 200);
                    }
                }
                return String::new();
            }
        }
    }
    "(missing)".to_string()
}

fn truncate(s: &str, n: usize) -> String {
    if s.len() <= n { return s.to_string(); }
    let mut end = n;
    while !s.is_char_boundary(end) && end > 0 { end -= 1; }
    format!("{}…", &s[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matching_selector_resolves() {
        let candidate = SelectorCandidate {
            label: "title".into(),
            selectors: vec![Selector { css: "h1".into() }],
            array: false,
        };
        let pages = vec![
            ("u1".into(), "<html><body><h1>Title 1</h1></body></html>".into()),
            ("u2".into(), "<html><body><h1>Title 2</h1></body></html>".into()),
        ];
        let out = validate_selectors(&[candidate], &pages);
        assert!(!out.results[0].unresolved);
        assert_eq!(out.traces[0].validation, vec![vec![1, 1]]);
        assert_eq!(out.traces[0].values, vec!["Title 1", "Title 2"]);
    }

    #[test]
    fn no_match_is_unresolved() {
        let candidate = SelectorCandidate {
            label: "title".into(),
            selectors: vec![Selector { css: "#nope".into() }],
            array: false,
        };
        let pages = vec![("u1".into(), "<html><body><h1>x</h1></body></html>".into())];
        let out = validate_selectors(&[candidate], &pages);
        assert!(out.results[0].unresolved);
        assert_eq!(out.traces[0].chosen, -1);
        assert_eq!(out.traces[0].values, vec!["(missing)"]);
    }
}
