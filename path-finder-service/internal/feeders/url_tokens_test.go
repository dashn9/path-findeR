package feeders

import "testing"

func TestExtractHost(t *testing.T) {
	cases := map[string]string{
		"https://Shop.Example.com/products/123":  "shop.example.com",
		"https://www.shop.example.com/p/1":       "shop.example.com",
		"http://shop.example.com:8080/p/1":       "shop.example.com",
	}
	for raw, want := range cases {
		host, _, err := extractHostAndTokens(raw)
		if err != nil {
			t.Fatalf("%s: %v", raw, err)
		}
		if host != want {
			t.Errorf("%s: host=%q want=%q", raw, host, want)
		}
	}
}

func TestTokenClassification(t *testing.T) {
	cases := []struct {
		raw  string
		want []string
	}{
		{"https://x.com/products/123", []string{"products", "*"}},
		{"https://x.com/products/cheese-wheel", []string{"products", "cheese-wheel"}},
		{"https://x.com/users/123", []string{"users", "*"}},
		{"https://x.com/posts/abcd1234efgh5678", []string{"posts", "*"}},
		{"https://x.com/posts/post-1234-title", []string{"posts", "*"}},
		{"https://x.com/", nil},
		{"https://x.com/about", []string{"about"}},
	}
	for _, c := range cases {
		_, tokens, err := extractHostAndTokens(c.raw)
		if err != nil {
			t.Fatalf("%s: %v", c.raw, err)
		}
		if !equalSlices(tokens, c.want) {
			t.Errorf("%s: tokens=%v want=%v", c.raw, tokens, c.want)
		}
	}
}

func TestTokensMatch(t *testing.T) {
	if !tokensMatch([]string{"products", "*"}, []string{"products", "*"}) {
		t.Error("identical tokens should match")
	}
	if tokensMatch([]string{"products", "*"}, []string{"users", "*"}) {
		t.Error("different static positions must not match")
	}
	if tokensMatch([]string{"a"}, []string{"a", "b"}) {
		t.Error("different lengths must not match")
	}
}

func equalSlices(a, b []string) bool {
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
