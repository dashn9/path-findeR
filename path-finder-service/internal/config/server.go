package config

type ServerConfig struct {
	BindAddr string
}

func loadServer() ServerConfig {
	return ServerConfig{
		BindAddr: getenv("BIND_ADDR", "0.0.0.0:7117"),
	}
}
