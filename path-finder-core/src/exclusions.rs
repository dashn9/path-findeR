use crate::types::ParsedNode;

const EXCLUDED_TAGS: &[&str] = &["nav", "iframe", "script", "style", "noscript"];

const EXCLUDED_PATTERNS: &[&str] = &[
    // Cookie / GDPR
    "cookie",
    "gdpr",
    "consent",
    "privacy-banner",
    "cookie-banner",
    "cookie-notice",
    "cookie-consent",
    // Chat widgets
    "chat-widget",
    "live-chat",
    "intercom",
    "drift",
    "crisp",
    "zendesk",
    "tawk",
    // Social share
    "social-share",
    "share-bar",
    "share-buttons",
    "social-links",
    "share-widget",
    // Newsletter
    "newsletter",
    "signup-form",
    "subscribe",
    "email-signup",
    "mailing-list",
    // Breadcrumbs
    "breadcrumb",
    "breadcrumbs",
    // Pagination
    "pagination",
    "pager",
    "page-nav",
    // Print/share/save buttons
    "print-button",
    "share-button",
    "save-button",
    // Author bio
    "author-bio",
    "author-footer",
    "author-info",
    // Site-wide alerts
    "alert-bar",
    "announcement",
    "site-notice",
    "banner-alert",
    // Comments
    "comments",
    "comment-section",
    "disqus",
    "comment-form",
    // Related/recommended
    "related-posts",
    "recommended",
    "you-may-like",
    "suggested",
    "more-stories",
    // Ads
    "ad-slot",
    "advertisement",
    "sponsored",
    "ad-container",
    "google-ad",
    "ad-wrapper",
    // Sticky header
    "sticky-header",
    "fixed-header",
    // Skip links
    "skip-to-content",
    "skip-link",
    "skip-nav",
    // Language/region
    "language-selector",
    "region-selector",
    "locale-picker",
    "lang-switcher",
    // Search
    "search-bar",
    "search-form",
    "site-search",
];

pub fn is_excluded(node: &ParsedNode, custom_exclusions: &[String]) -> bool {
    // Tag-based exclusion
    if EXCLUDED_TAGS.contains(&node.tag.as_str()) {
        return true;
    }

    // Pattern-based exclusion: check class, id, role attributes
    let check_attrs = ["class", "id", "role", "data-testid", "aria-label"];
    for attr_name in &check_attrs {
        if let Some(val) = node.attributes.get(*attr_name) {
            let lower = val.to_lowercase();
            for pattern in EXCLUDED_PATTERNS {
                if lower.contains(pattern) {
                    return true;
                }
            }
            for pattern in custom_exclusions {
                if lower.contains(&pattern.to_lowercase()) {
                    return true;
                }
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_node(tag: &str, attrs: &[(&str, &str)]) -> ParsedNode {
        ParsedNode {
            gen_id: "test".into(),
            tag: tag.into(),
            attributes: attrs
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            text: String::new(),
            children: vec![],
            parent: None,
            depth: 0,
        }
    }

    #[test]
    fn test_tag_exclusion() {
        assert!(is_excluded(&make_node("nav", &[]), &[]));
        assert!(is_excluded(&make_node("script", &[]), &[]));
        assert!(!is_excluded(&make_node("div", &[]), &[]));
    }

    #[test]
    fn test_pattern_exclusion() {
        assert!(is_excluded(
            &make_node("div", &[("class", "cookie-consent-banner")]),
            &[]
        ));
        assert!(is_excluded(
            &make_node("div", &[("id", "newsletter-signup")]),
            &[]
        ));
        assert!(!is_excluded(
            &make_node("div", &[("class", "article-body")]),
            &[]
        ));
    }

    #[test]
    fn test_custom_exclusion() {
        let custom = vec!["my-widget".to_string()];
        assert!(is_excluded(
            &make_node("div", &[("class", "my-widget-container")]),
            &custom
        ));
    }
}
