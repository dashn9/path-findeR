package config

type StorageAdapter string

const (
	StorageAdapterS3    StorageAdapter = "s3"
	StorageAdapterLocal StorageAdapter = "local"
)

type StorageConfig struct {
	Adapter     StorageAdapter
	ProgressDir string
}
type LocalStorageConfig struct{ BasePath string }

func loadStorage() StorageConfig {
	return StorageConfig{
		Adapter: StorageAdapter(pickAdapter(
			"STORAGE_ADAPTER", string(StorageAdapterLocal),
			string(StorageAdapterS3), string(StorageAdapterLocal),
		)),
		ProgressDir: getenv("PROGRESS_DIR", "./.data/progress"),
	}
}

func loadLocal() LocalStorageConfig {
	return LocalStorageConfig{BasePath: getenv("LOCAL_STORAGE_PATH", "./data/corpus")}
}
