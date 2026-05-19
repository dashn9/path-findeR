package feeders

import "testing"

func TestExtractHost(t *testing.T) {
	cases := map[string]string{
		"https://Shop.Example.com/products/123": "shop.example.com",
		"https://www.shop.example.com/p/1":      "shop.example.com",
		"http://shop.example.com:8080/p/1":      "shop.example.com",
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

func TestExtractTokensRaw(t *testing.T) {
	// The classifier is gone — tokens come back verbatim (lowercased).
	cases := []struct {
		raw  string
		want []string
	}{
		{"https://x.com/products/123", []string{"products", "123"}},
		{"https://x.com/products/cheese-wheel", []string{"products", "cheese-wheel"}},
		{"https://x.com/donuts/creme", []string{"donuts", "creme"}},
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

func TestUpdatedPattern(t *testing.T) {
	// Slug merge — position 1 promoted to wildcard.
	got := updatedPattern([]string{"donuts", "creme"}, []string{"donuts", "milky"})
	if !equalSlices(got, []string{"donuts", "*"}) {
		t.Errorf("got %v", got)
	}
	// Already wildcarded: no change to that position.
	got = updatedPattern([]string{"donuts", "*"}, []string{"donuts", "jam"})
	if !equalSlices(got, []string{"donuts", "*"}) {
		t.Errorf("got %v", got)
	}
	// Full agreement returns the same slice (no allocation churn signal).
	in := []string{"donuts", "*"}
	out := updatedPattern(in, []string{"donuts", "anything"})
	if &in[0] != &out[0] {
		t.Error("no-change update should return the same slice")
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
