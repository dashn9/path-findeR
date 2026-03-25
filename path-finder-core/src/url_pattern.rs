use url::Url;

use crate::error::{PathFinderError, Result};
use crate::types::UrlPattern;

pub fn detect_url_pattern(urls: &[&str]) -> Result<(UrlPattern, Vec<Vec<String>>)> {
    if urls.len() < 2 {
        return Err(PathFinderError::InsufficientPages {
            min: 2,
            got: urls.len(),
        });
    }

    let parsed: Vec<Url> = urls
        .iter()
        .map(|u| {
            let normalized = if u.contains("://") {
                u.to_string()
            } else {
                format!("https://{u}")
            };
            Url::parse(&normalized).map_err(|e| PathFinderError::UrlParse(e.to_string()))
        })
        .collect::<Result<Vec<_>>>()?;

    let host = parsed[0]
        .host_str()
        .ok_or_else(|| PathFinderError::UrlParse("no host in URL".into()))?;

    for p in &parsed[1..] {
        let h = p
            .host_str()
            .ok_or_else(|| PathFinderError::UrlParse("no host in URL".into()))?;
        if h != host {
            return Err(PathFinderError::NoUrlPattern);
        }
    }

    let paths: Vec<Vec<&str>> = parsed
        .iter()
        .map(|p| {
            p.path()
                .split('/')
                .filter(|s| !s.is_empty())
                .collect()
        })
        .collect();

    let seg_count = paths[0].len();
    if !paths.iter().all(|p| p.len() == seg_count) {
        return Err(PathFinderError::NoUrlPattern);
    }

    let mut pattern_parts = Vec::with_capacity(seg_count);
    let mut dynamic_indices = Vec::new();

    for i in 0..seg_count {
        let first = paths[0][i];
        if paths.iter().all(|p| p[i] == first) {
            pattern_parts.push(first.to_string());
        } else {
            pattern_parts.push("{}".to_string());
            dynamic_indices.push(i);
        }
    }

    let pattern = format!("/{}", pattern_parts.join("/"));

    let dynamic_values_per_page: Vec<Vec<String>> = paths
        .iter()
        .map(|p| dynamic_indices.iter().map(|&i| p[i].to_string()).collect())
        .collect();

    Ok((
        UrlPattern {
            host: host.to_string(),
            pattern,
        },
        dynamic_values_per_page,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_pattern() {
        let urls = [
            "shop.example.com/products/123",
            "shop.example.com/products/456",
        ];
        let (pat, vals) = detect_url_pattern(&urls).unwrap();
        assert_eq!(pat.host, "shop.example.com");
        assert_eq!(pat.pattern, "/products/{}");
        assert_eq!(vals, vec![vec!["123"], vec!["456"]]);
    }

    #[test]
    fn test_partial_dynamic() {
        let urls = [
            "example.com/blog/2024/intro",
            "example.com/blog/2024/update",
        ];
        let (pat, vals) = detect_url_pattern(&urls).unwrap();
        assert_eq!(pat.host, "example.com");
        assert_eq!(pat.pattern, "/blog/2024/{}");
        assert_eq!(vals, vec![vec!["intro"], vec!["update"]]);
    }

    #[test]
    fn test_insufficient_pages() {
        let urls = ["example.com/page"];
        assert!(detect_url_pattern(&urls).is_err());
    }

    #[test]
    fn test_different_hosts() {
        let urls = ["a.com/page/1", "b.com/page/2"];
        assert!(detect_url_pattern(&urls).is_err());
    }

    #[test]
    fn test_multiple_dynamic_segments() {
        let urls = [
            "shop.example.com/products/123/reviews/1",
            "shop.example.com/products/456/reviews/2",
        ];
        let (pat, vals) = detect_url_pattern(&urls).unwrap();
        assert_eq!(pat.pattern, "/products/{}/reviews/{}");
        assert_eq!(vals, vec![vec!["123", "1"], vec!["456", "2"]]);
    }
}
