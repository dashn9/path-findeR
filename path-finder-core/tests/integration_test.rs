use path_finder_core::analyzer::analyze;
use path_finder_core::config::{Config, Format};
use path_finder_core::exclusions::is_excluded;
use path_finder_core::parser::parse_html;
use path_finder_core::selector_builder::{build_selectors, handle_selector_divergence};
use path_finder_core::semantic::{build_semantic_documents, format_semantic_doc};
use path_finder_core::types::*;
use path_finder_core::url_pattern::detect_url_pattern;
use path_finder_core::validator::validate_selectors;
use std::collections::HashMap;

fn test_config() -> Config {
    Config {
        ai_endpoint: String::new(),
        ai_model: String::new(),
        max_direct_kb: 300,
        top_n_nodes: 30,
        max_sentences: 3,
        max_sentence_chars: 500,
        similarity_threshold: 0.75,
        max_retries: 3,
        output_format: Format::Json,
        exclusions: vec![],
        min_pages: 2,
    }
}

// ---------------------------------------------------------------------------
// URL pattern detection
// ---------------------------------------------------------------------------

#[test]
fn url_pattern_products() {
    let urls = [
        "shop.example.com/products/123",
        "shop.example.com/products/456",
    ];
    let (pat, vals) = detect_url_pattern(&urls).unwrap();
    assert_eq!(pat.host, "shop.example.com");
    assert_eq!(pat.pattern, "/products/{}");
    assert_eq!(vals[0], vec!["123"]);
    assert_eq!(vals[1], vec!["456"]);
}

#[test]
fn url_pattern_blog_with_static_segment() {
    let urls = [
        "example.com/blog/2024/intro",
        "example.com/blog/2024/update",
    ];
    let (pat, _) = detect_url_pattern(&urls).unwrap();
    assert_eq!(pat.pattern, "/blog/2024/{}");
}

#[test]
fn url_pattern_multiple_dynamic_segments() {
    let urls = [
        "shop.example.com/products/11/reviews/a",
        "shop.example.com/products/22/reviews/b",
        "shop.example.com/products/33/reviews/c",
    ];
    let (pat, vals) = detect_url_pattern(&urls).unwrap();
    assert_eq!(pat.pattern, "/products/{}/reviews/{}");
    assert_eq!(vals.len(), 3);
    assert_eq!(vals[0], vec!["11", "a"]);
}

#[test]
fn url_pattern_rejects_single_page() {
    let urls = ["example.com/only-one"];
    assert!(detect_url_pattern(&urls).is_err());
}

#[test]
fn url_pattern_rejects_different_hosts() {
    let urls = ["a.com/p/1", "b.com/p/2"];
    assert!(detect_url_pattern(&urls).is_err());
}

#[test]
fn url_pattern_rejects_different_segment_counts() {
    let urls = ["example.com/a/b", "example.com/a/b/c"];
    assert!(detect_url_pattern(&urls).is_err());
}

#[test]
fn url_pattern_fully_static() {
    let urls = [
        "example.com/about",
        "example.com/about",
    ];
    let (pat, vals) = detect_url_pattern(&urls).unwrap();
    assert_eq!(pat.pattern, "/about");
    assert!(vals[0].is_empty());
}

// ---------------------------------------------------------------------------
// HTML parser
// ---------------------------------------------------------------------------

const SAMPLE_HTML: &str = r#"
<html>
<head><title>Test Page</title></head>
<body>
    <nav><a href="/">Home</a></nav>
    <main>
        <article>
            <h1 class="article-title">Hello World</h1>
            <p class="content">This is a paragraph with some text.</p>
            <span class="price">$19.99</span>
        </article>
    </main>
    <script>console.log("stripped");</script>
    <style>.hidden{display:none}</style>
    <footer><p>Footer text</p></footer>
</body>
</html>
"#;

#[test]
fn parser_strips_scripts_and_styles() {
    let page = parse_html("http://example.com/p/1", SAMPLE_HTML, vec![]);
    let tags: Vec<&str> = page.nodes.iter().map(|n| n.tag.as_str()).collect();
    assert!(!tags.contains(&"script"));
    assert!(!tags.contains(&"style"));
}

#[test]
fn parser_preserves_content_nodes() {
    let page = parse_html("http://example.com/p/1", SAMPLE_HTML, vec![]);
    assert!(page.nodes.iter().any(|n| n.tag == "h1"));
    assert!(page.nodes.iter().any(|n| n.tag == "p" && n.text.contains("paragraph")));
}

#[test]
fn parser_assigns_unique_gen_ids() {
    let page = parse_html("http://example.com/p/1", SAMPLE_HTML, vec![]);
    let ids: Vec<&str> = page.nodes.iter().map(|n| n.gen_id.as_str()).collect();
    let unique: std::collections::HashSet<&str> = ids.iter().copied().collect();
    assert_eq!(ids.len(), unique.len());
}

#[test]
fn parser_normalizes_whitespace() {
    let html = "<html><body><p>  lots   of   spaces  </p></body></html>";
    let page = parse_html("http://example.com", html, vec![]);
    let p = page.nodes.iter().find(|n| n.tag == "p").unwrap();
    assert_eq!(p.text, "lots of spaces");
}

#[test]
fn parser_stores_dynamic_values() {
    let page = parse_html("http://example.com/p/1", SAMPLE_HTML, vec!["1".into()]);
    assert_eq!(page.dynamic_values, vec!["1"]);
}

#[test]
fn parser_captures_attributes() {
    let page = parse_html("http://example.com", SAMPLE_HTML, vec![]);
    let h1 = page.nodes.iter().find(|n| n.tag == "h1").unwrap();
    assert_eq!(h1.attributes.get("class").map(String::as_str), Some("article-title"));
}

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

fn make_node(tag: &str, attrs: &[(&str, &str)]) -> ParsedNode {
    ParsedNode {
        gen_id: "t".into(),
        tag: tag.into(),
        attributes: attrs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        text: String::new(),
        children: vec![],
        parent: None,
        depth: 0,
    }
}

#[test]
fn exclusion_nav_tag() {
    assert!(is_excluded(&make_node("nav", &[]), &[]));
}

#[test]
fn exclusion_iframe_tag() {
    assert!(is_excluded(&make_node("iframe", &[]), &[]));
}

#[test]
fn exclusion_cookie_class() {
    assert!(is_excluded(&make_node("div", &[("class", "cookie-consent-popup")]), &[]));
}

#[test]
fn exclusion_newsletter_id() {
    assert!(is_excluded(&make_node("section", &[("id", "newsletter-form")]), &[]));
}

#[test]
fn exclusion_social_share() {
    assert!(is_excluded(&make_node("div", &[("class", "social-share-buttons")]), &[]));
}

#[test]
fn exclusion_pagination() {
    assert!(is_excluded(&make_node("div", &[("class", "pagination-controls")]), &[]));
}

#[test]
fn exclusion_comments() {
    assert!(is_excluded(&make_node("section", &[("id", "comments-section")]), &[]));
}

#[test]
fn exclusion_ad_slot() {
    assert!(is_excluded(&make_node("div", &[("class", "ad-slot-sidebar")]), &[]));
}

#[test]
fn exclusion_allows_article() {
    assert!(!is_excluded(&make_node("article", &[("class", "post-body")]), &[]));
}

#[test]
fn exclusion_custom_pattern() {
    let custom = vec!["my-tracker".into()];
    assert!(is_excluded(&make_node("div", &[("class", "my-tracker-widget")]), &custom));
}

#[test]
fn exclusion_case_insensitive() {
    assert!(is_excluded(&make_node("div", &[("class", "COOKIE-CONSENT")]), &[]));
}

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

#[test]
fn analyzer_strips_empty_nodes() {
    let page = ParsedPage {
        url: "http://example.com".into(),
        nodes: vec![
            ParsedNode {
                gen_id: "a".into(), tag: "p".into(),
                attributes: HashMap::new(), text: "content".into(),
                children: vec![], parent: None, depth: 0,
            },
            ParsedNode {
                gen_id: "b".into(), tag: "p".into(),
                attributes: HashMap::new(), text: "".into(),
                children: vec![], parent: None, depth: 0,
            },
        ],
        dynamic_values: vec![],
    };
    let tree = analyze(&page, &test_config());
    assert_eq!(tree.nodes.len(), 1);
    assert_eq!(tree.nodes[0].gen_id, "a");
}

#[test]
fn analyzer_excludes_nav() {
    let page = ParsedPage {
        url: "http://example.com".into(),
        nodes: vec![
            ParsedNode {
                gen_id: "a".into(), tag: "nav".into(),
                attributes: HashMap::new(), text: "Home About".into(),
                children: vec![], parent: None, depth: 0,
            },
            ParsedNode {
                gen_id: "b".into(), tag: "h1".into(),
                attributes: HashMap::new(), text: "Title".into(),
                children: vec![], parent: None, depth: 0,
            },
        ],
        dynamic_values: vec![],
    };
    let tree = analyze(&page, &test_config());
    assert!(tree.nodes.iter().all(|n| n.tag != "nav"));
}

#[test]
fn analyzer_scores_h1_above_span() {
    let page = ParsedPage {
        url: "http://example.com".into(),
        nodes: vec![
            ParsedNode {
                gen_id: "span".into(), tag: "span".into(),
                attributes: HashMap::new(), text: "minor".into(),
                children: vec![], parent: None, depth: 0,
            },
            ParsedNode {
                gen_id: "h1".into(), tag: "h1".into(),
                attributes: HashMap::new(), text: "Title".into(),
                children: vec![], parent: None, depth: 0,
            },
        ],
        dynamic_values: vec![],
    };
    let tree = analyze(&page, &test_config());
    assert_eq!(tree.nodes[0].gen_id, "h1");
}

#[test]
fn analyzer_deprioritizes_dynamic_value_nodes() {
    let page = ParsedPage {
        url: "http://example.com/p/42".into(),
        nodes: vec![
            ParsedNode {
                gen_id: "a".into(), tag: "span".into(),
                attributes: HashMap::new(), text: "Product 42".into(),
                children: vec![], parent: None, depth: 0,
            },
            ParsedNode {
                gen_id: "b".into(), tag: "span".into(),
                attributes: HashMap::new(), text: "General info".into(),
                children: vec![], parent: None, depth: 0,
            },
        ],
        dynamic_values: vec!["42".into()],
    };
    let tree = analyze(&page, &test_config());
    let a_score = tree.nodes.iter().find(|n| n.gen_id == "a").unwrap().score;
    let b_score = tree.nodes.iter().find(|n| n.gen_id == "b").unwrap().score;
    assert!(b_score > a_score);
}

// ---------------------------------------------------------------------------
// Semantic document builder
// ---------------------------------------------------------------------------

#[test]
fn semantic_direct_feed_under_threshold() {
    let scored = vec![ScoredTree { url: "u".into(), nodes: vec![] }];
    let pages = vec![("u".into(), "<html><body>small</body></html>".into())];
    let mut cfg = test_config();
    cfg.max_direct_kb = 1000; // way above
    let docs = build_semantic_documents(&scored, &pages, &cfg);
    assert!(docs[0].raw_html.is_some());
}

#[test]
fn semantic_builds_compact_above_threshold() {
    let node = SemanticNode {
        gen_id: "n1".into(), tag: "p".into(),
        attributes: HashMap::new(), text: "Hello.".into(), score: 0.8,
    };
    let scored = vec![ScoredTree { url: "u".into(), nodes: vec![node] }];
    let big_html = "x".repeat(500_000);
    let pages = vec![("u".into(), big_html)];
    let mut cfg = test_config();
    cfg.max_direct_kb = 1; // force semantic
    let docs = build_semantic_documents(&scored, &pages, &cfg);
    assert!(docs[0].raw_html.is_none());
    assert_eq!(docs[0].nodes.len(), 1);
}

#[test]
fn semantic_format_output() {
    let node = SemanticNode {
        gen_id: "n_abc".into(), tag: "h1".into(),
        attributes: HashMap::from([("class".into(), "title".into())]),
        text: "Hello World".into(), score: 0.9,
    };
    let doc = path_finder_core::semantic::SemanticDocument {
        nodes: vec![node], raw_html: None,
    };
    let output = format_semantic_doc(&doc);
    assert!(output.contains("[n_abc]"));
    assert!(output.contains("<h1"));
    assert!(output.contains("Hello World"));
}

#[test]
fn semantic_squash_limits_sentences() {
    let long_text = "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.";
    let node = SemanticNode {
        gen_id: "n1".into(), tag: "p".into(),
        attributes: HashMap::new(), text: long_text.into(), score: 0.5,
    };
    let scored = vec![ScoredTree { url: "u".into(), nodes: vec![node] }];
    let big_html = "x".repeat(500_000);
    let pages = vec![("u".into(), big_html)];
    let mut cfg = test_config();
    cfg.max_direct_kb = 1;
    cfg.max_sentences = 3;
    let docs = build_semantic_documents(&scored, &pages, &cfg);
    let text = &docs[0].nodes[0].text;
    let sentence_count = text.matches('.').count();
    assert!(sentence_count <= 3);
}

// ---------------------------------------------------------------------------
// Selector builder
// ---------------------------------------------------------------------------

#[test]
fn selector_id_based() {
    let ai_resp = AiResponse {
        labels: vec![AiLabelResult { label: "title".into(), gen_id: "n1".into() }],
        clusters: vec![],
    };
    let page = ParsedPage {
        url: "http://example.com".into(),
        nodes: vec![ParsedNode {
            gen_id: "n1".into(), tag: "h1".into(),
            attributes: HashMap::from([("id".into(), "main-title".into())]),
            text: "Title".into(), children: vec![], parent: None, depth: 0,
        }],
        dynamic_values: vec![],
    };
    let htmls = vec![("u".into(), "<html><body><h1 id=\"main-title\">Title</h1></body></html>".into())];
    let candidates = build_selectors(&ai_resp, &[page], &htmls, &test_config());
    assert_eq!(candidates.len(), 1);
    assert!(candidates[0].selectors.iter().any(|s| s.css == "#main-title"));
}

#[test]
fn selector_class_based() {
    let ai_resp = AiResponse {
        labels: vec![AiLabelResult { label: "price".into(), gen_id: "n1".into() }],
        clusters: vec![],
    };
    let page = ParsedPage {
        url: "http://example.com".into(),
        nodes: vec![ParsedNode {
            gen_id: "n1".into(), tag: "span".into(),
            attributes: HashMap::from([("class".into(), "product-price".into())]),
            text: "$9.99".into(), children: vec![], parent: None, depth: 0,
        }],
        dynamic_values: vec![],
    };
    let htmls = vec![("u".into(), "<html><body><span class=\"product-price\">$9.99</span></body></html>".into())];
    let candidates = build_selectors(&ai_resp, &[page], &htmls, &test_config());
    let sels: Vec<&str> = candidates[0].selectors.iter().map(|s| s.css.as_str()).collect();
    assert!(sels.contains(&".product-price"));
}

#[test]
fn selector_array_detection_multi_match() {
    let ai_resp = AiResponse {
        labels: vec![AiLabelResult { label: "items".into(), gen_id: "n1".into() }],
        clusters: vec![],
    };
    let page = ParsedPage {
        url: "http://example.com".into(),
        nodes: vec![ParsedNode {
            gen_id: "n1".into(), tag: "li".into(),
            attributes: HashMap::from([("class".into(), "item".into())]),
            text: "Item 1".into(), children: vec![], parent: None, depth: 0,
        }],
        dynamic_values: vec![],
    };
    let htmls = vec![(
        "u".into(),
        "<html><body><ul><li class=\"item\">Item 1</li><li class=\"item\">Item 2</li></ul></body></html>".into(),
    )];
    let candidates = build_selectors(&ai_resp, &[page], &htmls, &test_config());
    assert!(candidates[0].array);
}

#[test]
fn selector_array_detection_from_cluster() {
    let ai_resp = AiResponse {
        labels: vec![AiLabelResult { label: "tag".into(), gen_id: "n1".into() }],
        clusters: vec![AiCluster { gen_ids: vec!["n1".into(), "n2".into()], similarity: 0.9 }],
    };
    let page = ParsedPage {
        url: "http://example.com".into(),
        nodes: vec![ParsedNode {
            gen_id: "n1".into(), tag: "span".into(),
            attributes: HashMap::from([("id".into(), "unique-tag".into())]),
            text: "tag1".into(), children: vec![], parent: None, depth: 0,
        }],
        dynamic_values: vec![],
    };
    let htmls = vec![("u".into(), "<html><body><span id=\"unique-tag\">tag1</span></body></html>".into())];
    let candidates = build_selectors(&ai_resp, &[page], &htmls, &test_config());
    assert!(candidates[0].array);
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

#[test]
fn validator_passes_universal_selector() {
    let candidates = vec![path_finder_core::selector_builder::SelectorCandidate {
        label: "title".into(),
        selectors: vec![Selector { css: "h1".into() }],
        array: false,
    }];
    let pages = vec![
        ("u1".into(), "<html><body><h1>A</h1></body></html>".into()),
        ("u2".into(), "<html><body><h1>B</h1></body></html>".into()),
    ];
    let results = validate_selectors(&candidates, &pages);
    assert!(!results[0].unresolved);
    assert_eq!(results[0].selectors.len(), 1);
}

#[test]
fn validator_marks_unresolved_when_no_match() {
    let candidates = vec![path_finder_core::selector_builder::SelectorCandidate {
        label: "ghost".into(),
        selectors: vec![Selector { css: "#does-not-exist".into() }],
        array: false,
    }];
    let pages = vec![
        ("u".into(), "<html><body><p>Hello</p></body></html>".into()),
    ];
    let results = validate_selectors(&candidates, &pages);
    assert!(results[0].unresolved);
}

#[test]
fn validator_divergence_picks_best_coverage() {
    let candidates = vec![path_finder_core::selector_builder::SelectorCandidate {
        label: "title".into(),
        selectors: vec![
            Selector { css: ".title-v1".into() },
            Selector { css: ".title-v2".into() },
        ],
        array: false,
    }];
    let pages = vec![
        ("u1".into(), "<html><body><h1 class=\"title-v1\">A</h1></body></html>".into()),
        ("u2".into(), "<html><body><h1 class=\"title-v2\">B</h1></body></html>".into()),
    ];
    let results = validate_selectors(&candidates, &pages);
    assert!(!results[0].unresolved);
    assert_eq!(results[0].selectors.len(), 2);
}

#[test]
fn validator_handle_selector_divergence_filters_dead() {
    let selectors = vec![
        Selector { css: "h1".into() },
        Selector { css: "#nonexistent".into() },
    ];
    let pages = vec![("u".into(), "<html><body><h1>Hi</h1></body></html>".into())];
    let result = handle_selector_divergence(&selectors, &pages);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].css, "h1");
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

#[test]
fn config_effective_min_pages_enforces_floor() {
    let mut cfg = test_config();
    cfg.min_pages = 1;
    assert_eq!(cfg.effective_min_pages(), 2);
    cfg.min_pages = 5;
    assert_eq!(cfg.effective_min_pages(), 5);
}

#[test]
fn config_serde_roundtrip() {
    let cfg = test_config();
    let json = serde_json::to_string(&cfg).unwrap();
    let parsed: Config = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.max_direct_kb, 300);
    assert_eq!(parsed.top_n_nodes, 30);
}

// ---------------------------------------------------------------------------
// Types serde
// ---------------------------------------------------------------------------

#[test]
fn parser_manifest_serde() {
    let manifest = ParserManifest {
        parser_id: "abc123".into(),
        url_pattern: UrlPattern { host: "example.com".into(), pattern: "/p/{}".into() },
        parser: HashMap::from([(
            "title".into(),
            Parser {
                label: "title".into(),
                selectors: vec![Selector { css: "h1".into() }],
                concrete_types: vec![ConcreteType::Text],
                abstract_types: vec![AbstractType::Title, AbstractType::Headline],
                array: false,
                unresolved: false,
            },
        )]),
    };
    let json = serde_json::to_string_pretty(&manifest).unwrap();
    let parsed: ParserManifest = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.parser_id, "abc123");
    assert_eq!(parsed.parser["title"].selectors[0].css, "h1");
    assert!(!parsed.parser["title"].array);
}

#[test]
fn regeneration_scope_serde() {
    let req = RegenerationRequest {
        parser_id: "x".into(),
        labels: RegenerationScope::Labels(vec!["title".into(), "price".into()]),
        force: true,
    };
    let json = serde_json::to_string(&req).unwrap();
    assert!(json.contains("title"));

    let all = RegenerationRequest {
        parser_id: "y".into(),
        labels: RegenerationScope::All,
        force: false,
    };
    let json = serde_json::to_string(&all).unwrap();
    assert!(json.contains("All"));
}
