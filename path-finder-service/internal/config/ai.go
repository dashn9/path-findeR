package config

import "os"

// LlmAdapter picks which provider the Rust core dispatches to.
type LlmAdapter string

const (
	LlmAdapterAnthropic  LlmAdapter = "anthropic"
	LlmAdapterOpenAI     LlmAdapter = "openai"
	LlmAdapterOpenRouter LlmAdapter = "openrouter"
)

// AIConfig is serialized straight to the Rust core over the FFI.
type AIConfig struct {
	Adapter    LlmAdapter       `json:"adapter"`
	Anthropic  AnthropicConfig  `json:"anthropic"`
	OpenAI     OpenAIConfig     `json:"openai"`
	OpenRouter OpenRouterConfig `json:"openrouter"`
}

type AnthropicConfig struct {
	APIKey  string `json:"api_key"`
	BaseURL string `json:"base_url"`
	Model   string `json:"model"`
	Version string `json:"version"`
}

type OpenAIConfig struct {
	APIKey  string `json:"api_key"`
	BaseURL string `json:"base_url"`
	Model   string `json:"model"`
}

type OpenRouterConfig struct {
	APIKey  string `json:"api_key"`
	BaseURL string `json:"base_url"`
	Model   string `json:"model"`
}

func loadAI() AIConfig {
	adapter := pickAdapter("AI_ADAPTER", string(LlmAdapterAnthropic),
		string(LlmAdapterAnthropic), string(LlmAdapterOpenAI), string(LlmAdapterOpenRouter))
	return AIConfig{
		Adapter: LlmAdapter(adapter),
		Anthropic: AnthropicConfig{
			APIKey:  os.Getenv("ANTHROPIC_API_KEY"),
			BaseURL: getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1"),
			Model:   getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
			Version: getenv("ANTHROPIC_VERSION", "2023-06-01"),
		},
		OpenAI: OpenAIConfig{
			APIKey:  os.Getenv("OPENAI_API_KEY"),
			BaseURL: getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
			Model:   getenv("OPENAI_MODEL", "gpt-4o-mini"),
		},
		OpenRouter: OpenRouterConfig{
			APIKey:  os.Getenv("OPEN_ROUTER_API_KEY"),
			BaseURL: getenv("OPEN_ROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
			Model:   getenv("OPEN_ROUTER_MODEL", "anthropic/claude-sonnet-4"),
		},
	}
}
