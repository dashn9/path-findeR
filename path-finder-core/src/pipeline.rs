use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::ai_parser_builder::call_ai;
use crate::analyzer::analyze;
use crate::cluster_detection;
use crate::config::Config;
use crate::error::{PathFinderError, Result};
use crate::parser::parse_html;
use crate::selector_builder::{SelectorCandidate, build_selectors};
use crate::semantic::build_semantic_documents;
use crate::types::{
    AiResponse, CandidateSel, ConcreteType, DomLine, LabelTrace, PageRef, ParsedPage,
    Parser, ParserManifest, ParserTrace,
};
use crate::url_pattern::detect_url_pattern;
use crate::validator::{ValidationOutput, ValidationTrace, validate_selectors};

/// Total stage count surfaced in progress files + the topbar progress
/// indicator. Update when stages are added/removed.
const STAGES: usize = 7;

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

/// In-flight progress snapshot the host (Go service) reads while the FFI call
/// is blocked in Rust. Atomic-rename writes ensure readers never see partial
/// JSON.
struct Progress {
    path: String,
    started_at_ms: u128,
    events: Vec<serde_json::Value>,
    total: usize,
}

impl Progress {
    fn new(path: String, total: usize) -> Self {
        Self { path, started_at_ms: now_ms(), events: Vec::with_capacity(total + 2), total }
    }

    fn enabled(&self) -> bool { !self.path.is_empty() }

    fn emit(&mut self, stage: usize, name: &str) {
        eprintln!("[pipeline] stage {}/{}: {}", stage, self.total, name);
        if !self.enabled() { return; }
        self.events.push(serde_json::json!({
            "stage": stage, "name": name, "at_ms": now_ms() as u64,
        }));
        self.flush();
    }

    fn flush(&self) {
        let payload = serde_json::json!({
            "total": self.total,
            "started_at_ms": self.started_at_ms as u64,
            "updated_at_ms": now_ms() as u64,
            "events": self.events,
        });
        let bytes = payload.to_string();
        let p = Path::new(&self.path);
        if let Some(parent) = p.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let tmp = format!("{}.tmp", self.path);
        if let Ok(mut f) = fs::File::create(&tmp) {
            if f.write_all(bytes.as_bytes()).is_ok() {
                let _ = fs::rename(&tmp, &self.path);
            }
        }
    }
}

pub fn run_pipeline(
    pages: Vec<(String, String)>,
    parser_id: String,
    config: &Config,
) -> Result<ParserManifest> {
    let mut progress = Progress::new(config.progress_path.clone(), STAGES);

    let min_pages = config.effective_min_pages();
    if pages.len() < min_pages {
        return Err(PathFinderError::InsufficientPages { min: min_pages, got: pages.len() });
    }

    progress.emit(1, "detect URL pattern");
    let urls: Vec<&str> = pages.iter().map(|(url, _)| url.as_str()).collect();
    let (url_pattern, dynamic_values_per_page) = detect_url_pattern(&urls)?;

    progress.emit(2, "parse HTML");
    let parsed_pages: Vec<_> = pages
        .iter()
        .zip(dynamic_values_per_page.iter())
        .map(|((url, html), dyn_vals)| parse_html(url, html, dyn_vals.clone()))
        .collect();

    let mut blocked_gen_ids: HashSet<String> = HashSet::new();
    let mut retry_count = 0;

    // Stash the artifacts of the final loop iteration so we can build the
    // ParserTrace after the loop terminates.
    let (parser_map, final_ai, final_candidates, final_traces) = loop {
        if retry_count > 0 {
            eprintln!("[pipeline parser_id={}] retry {}/{}", parser_id, retry_count, config.max_retries);
        }

        progress.emit(3, "analyze + score DOM trees");
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

        progress.emit(4, "build semantic documents");
        let semantic_docs = build_semantic_documents(&scored_trees, &pages, config);

        progress.emit(5, "AI label inference");
        let mut ai_response = call_ai(&semantic_docs, config)?;

        // Augment AI clusters with structurally-detected repeating sibling
        // groups (carousels, lists, grids). The AI sometimes labels only one
        // representative of a repeating set; the structural pass guarantees
        // the builder still flags the label as array.
        let structural = cluster_detection::detect(&parsed_pages);
        if !structural.is_empty() {
            eprintln!(
                "[pipeline parser_id={}] detected {} structural cluster(s)",
                parser_id, structural.len()
            );
            ai_response.clusters.extend(structural);
        }

        progress.emit(6, "build CSS selectors");
        let candidates = build_selectors(&ai_response, &parsed_pages, &pages, config);

        progress.emit(7, "validate selectors against corpus");
        let ValidationOutput { results, traces } = validate_selectors(&candidates, &pages);

        let has_unresolved = results.iter().any(|r| r.unresolved);

        if !has_unresolved || retry_count >= config.max_retries {
            let mut map = HashMap::new();
            for result in &results {
                map.insert(result.label.clone(), Parser {
                    label: result.label.clone(),
                    selectors: result.selectors.clone(),
                    concrete_types: vec![ConcreteType::Text],
                    abstract_types: vec![],
                    array: result.array,
                    unresolved: result.unresolved,
                });
            }
            break (map, ai_response, candidates, traces);
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

    let trace = build_trace(&pages, &parsed_pages, &final_ai, &final_candidates, &final_traces);

    eprintln!("[pipeline parser_id={}] done", parser_id);
    Ok(ParserManifest { parser_id, url_pattern, parser: parser_map, trace })
}

/// build_trace stitches the per-label artifacts (AI rationale, candidates,
/// validation matrix, parsed-page DOM) into the shape the frontend Inspector
/// expects.
fn build_trace(
    pages: &[(String, String)],
    parsed_pages: &[ParsedPage],
    ai: &AiResponse,
    candidates: &[SelectorCandidate],
    traces: &[ValidationTrace],
) -> ParserTrace {
    let page_refs: Vec<PageRef> = pages
        .iter()
        .map(|(url, _)| PageRef { url: url.clone(), short: short_url(url) })
        .collect();

    let mut labels = HashMap::new();
    for (i, cand) in candidates.iter().enumerate() {
        let trace = match traces.get(i) {
            Some(t) => t,
            None => continue,
        };
        let ai_label = ai.labels.iter().find(|l| l.label == cand.label);
        let rationale = ai_label.map(|l| l.rationale.clone()).unwrap_or_default();
        let gen_id = ai_label.map(|l| l.gen_id.as_str()).unwrap_or("");

        let cand_sels: Vec<CandidateSel> = cand
            .selectors
            .iter()
            .enumerate()
            .map(|(j, s)| CandidateSel {
                css: s.css.clone(),
                score: trace.coverage.get(j).copied().unwrap_or(0.0),
                note: coverage_note(trace.coverage.get(j).copied().unwrap_or(0.0), page_refs.len()),
            })
            .collect();

        let dom = build_dom_context(gen_id, parsed_pages);

        labels.insert(cand.label.clone(), LabelTrace {
            rationale,
            candidates: cand_sels,
            chosen: trace.chosen,
            unresolved: trace.chosen < 0,
            validation: trace.validation.clone(),
            dom,
            values: trace.values.clone(),
        });
    }

    ParserTrace { pages: page_refs, labels }
}

fn coverage_note(score: f32, total: usize) -> String {
    let hits = (score * total as f32).round() as usize;
    format!("matches {hits}/{total} pages")
}

fn short_url(url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url) {
        let path = parsed.path();
        if path.is_empty() || path == "/" { return "/".to_string(); }
        return path.to_string();
    }
    url.to_string()
}

/// build_dom_context emits ~6 lines of pseudo-HTML showing the chosen element
/// in its parent context, with the chosen line marked. Walks the parsed-page
/// node graph of the FIRST page that contains the gen_id.
fn build_dom_context(gen_id: &str, parsed_pages: &[ParsedPage]) -> Vec<DomLine> {
    if gen_id.is_empty() { return Vec::new(); }

    let (page, node) = match parsed_pages
        .iter()
        .find_map(|p| p.nodes.iter().find(|n| n.gen_id == gen_id).map(|n| (p, n)))
    {
        Some(found) => found,
        None => return Vec::new(),
    };

    let node_map: HashMap<&str, &crate::types::ParsedNode> =
        page.nodes.iter().map(|n| (n.gen_id.as_str(), n)).collect();

    // Walk up two parents.
    let mut ancestors: Vec<&crate::types::ParsedNode> = Vec::new();
    let mut cur_parent = node.parent.as_deref();
    while let Some(pid) = cur_parent {
        if let Some(p) = node_map.get(pid) {
            ancestors.push(*p);
            cur_parent = p.parent.as_deref();
            if ancestors.len() >= 2 { break; }
        } else { break; }
    }
    ancestors.reverse();

    let base_depth = ancestors.first().map(|n| n.depth).unwrap_or(node.depth);
    let mut lines = Vec::new();
    let mut i = 0;
    let push = |lines: &mut Vec<DomLine>, i: &mut usize, depth: usize, t: String, m: Option<bool>| {
        let indent = "  ".repeat(depth.saturating_sub(base_depth));
        lines.push(DomLine { i: *i, t: format!("{}{}", indent, t), r#match: m });
        *i += 1;
    };

    for a in &ancestors {
        push(&mut lines, &mut i, a.depth, format_open_tag(a), None);
    }
    push(&mut lines, &mut i, node.depth, format_open_tag(node), Some(true));

    // Up to 3 children of the chosen node, abbreviated.
    let kids: Vec<&crate::types::ParsedNode> = node
        .children
        .iter()
        .filter_map(|cid| node_map.get(cid.as_str()).copied())
        .take(3)
        .collect();
    for k in &kids {
        push(&mut lines, &mut i, k.depth, format!("{} …", format_open_tag(k)), None);
    }

    // Close ancestors in reverse so the snippet reads like real markup.
    push(&mut lines, &mut i, node.depth, format!("</{}>", node.tag), None);
    for a in ancestors.iter().rev() {
        push(&mut lines, &mut i, a.depth, format!("</{}>", a.tag), None);
    }

    lines
}

fn format_open_tag(n: &crate::types::ParsedNode) -> String {
    let id_attr = n
        .attributes
        .get("id")
        .filter(|v| !v.is_empty())
        .map(|v| format!(" id=\"{v}\""))
        .unwrap_or_default();
    let class_attr = n
        .attributes
        .get("class")
        .filter(|v| !v.is_empty())
        .map(|v| format!(" class=\"{}\"", truncate_attr(v)))
        .unwrap_or_default();
    format!("<{}{}{}>", n.tag, id_attr, class_attr)
}

fn truncate_attr(s: &str) -> String {
    if s.len() <= 60 { return s.to_string(); }
    let mut end = 60;
    while !s.is_char_boundary(end) && end > 0 { end -= 1; }
    format!("{}…", &s[..end])
}
