package feeders

import (
	"net/url"
	"strings"
)

// wildcard is the in-pattern marker for a dynamic position. A parser's
// URLTokens starts as the raw path tokens of its first page and gradually
// gets positions replaced with "*" as more pages arrive and disagree there.
const wildcard = "*"

// extractHostAndTokens normalizes the URL into the routing signal: a
// lowercased hostname (www. stripped, port dropped) and the *raw* path
// segments. No per-URL static/dynamic guess — classification is inferred
// from multiple pages later by divergencePosition / updatedPattern.
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
		tokens = append(tokens, strings.ToLower(decoded))
	}
	return host, tokens, nil
}

// updatedPattern returns the parser's new URLTokens after absorbing one more
// page: every position where the existing pattern and the incoming tokens
// disagree (and isn't already a wildcard) becomes a wildcard. Lengths
// differing is a no-op (we keep the existing pattern); url_tokens is purely
// cosmetic now, so cross-length convergence isn't worth modeling.
func updatedPattern(pattern, tokens []string) []string {
	if len(pattern) != len(tokens) {
		return pattern
	}
	out := make([]string, len(pattern))
	changed := false
	for i := range pattern {
		switch {
		case pattern[i] == wildcard:
			out[i] = wildcard
		case pattern[i] == tokens[i]:
			out[i] = pattern[i]
		default:
			out[i] = wildcard
			changed = true
		}
	}
	if !changed {
		return pattern
	}
	return out
}

type emptyHostErr struct{ raw string }

func (e *emptyHostErr) Error() string { return "url has no host: " + e.raw }
