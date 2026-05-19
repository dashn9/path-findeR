package config

type MongoConfig struct {
	URI               string
	DB                string
	Collection        string
	FeedDecisionsColl string
}

func loadMongo() MongoConfig {
	return MongoConfig{
		URI:               getenv("MONGO_URI", "mongodb://localhost:27017"),
		DB:                getenv("MONGO_DB", "path_finder"),
		Collection:        getenv("MONGO_COLLECTION", "manifests"),
		FeedDecisionsColl: getenv("MONGO_FEED_DECISIONS_COLLECTION", "feed_decisions"),
	}
}
