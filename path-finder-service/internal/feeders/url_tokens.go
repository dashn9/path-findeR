package feeders

import (
	"net/url"
	"regexp"
	"strings"
)

// dynamicSegment matches segments that look like generated IDs: any token
// containing 3+ consecutive digits (post-1234-title, /123/, ...), or a pure
// 8+ hex string (UUIDs, hashes).
var dynamicSegment = regexp.MustCompile(`\d{3,}|^[0-9a-f]{8,}$`)

// extractHostAndTokens normalizes the URL into the bucket-routing signal:
// a lowercased hostname (www. stripped, port dropped) and the list of path
// segments with dynamic-looking segments replaced by "*". Same template at
// different IDs collapses to the same token list, different templates
// diverge on the static positions.
func extractHostAndTokens(raw string) (host string, tokens []string, err error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", nil, err
	}
	host = strings.ToLower(u.Hostname())
	host = strings.TrimPrefix(host, "www.")
	if host == "" {
		return "", nil, &emptyHostErr{raw: raw}
	}

	for _, seg := range strings.Split(strings.Trim(u.EscapedPath(), "/"), "/") {
		if seg == "" {
			continue
		}
		decoded, derr := url.PathUnescape(seg)
		if derr != nil {
			decoded = seg
		}
		decoded = strings.ToLower(decoded)
		if dynamicSegment.MatchString(decoded) {
			tokens = append(tokens, "*")
		} else {
			tokens = append(tokens, decoded)
		}
	}
	return host, tokens, nil
}

// tokensMatch returns true iff two token lists agree at every position. Used
// as a hard pre-filter on bucket candidates — a single static-token mismatch
// means the URLs target different templates (e.g. /users/123 vs /products/123)
// and the bucket can't be shared, regardless of shape similarity.
func tokensMatch(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

type emptyHostErr struct{ raw string }

func (e *emptyHostErr) Error() string { return "url has no host: " + e.raw }
