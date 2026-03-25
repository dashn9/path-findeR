import os

from fastapi import FastAPI, HTTPException

from path_finder_service.feeders.function_feeder import FunctionFeeder
from path_finder_service.jobs import JobRunner
from path_finder_service.models import (
    FeedRequest,
    ForceRequest,
    PipelineConfig,
    RegenerationRequest,
)
from path_finder_service.storage.corpus import S3CorpusStore
from path_finder_service.storage.parser_store import MongoParserStore

app = FastAPI(title="path-findeR", version="0.1.0")

# Dependency wiring
corpus_store = S3CorpusStore(
    bucket=os.getenv("S3_BUCKET", "path-finder-corpus"),
    endpoint_url=os.getenv("S3_ENDPOINT_URL"),
)
parser_store = MongoParserStore(
    uri=os.getenv("MONGO_URI", "mongodb://localhost:27017"),
    db_name=os.getenv("MONGO_DB", "path_finder"),
)
config = PipelineConfig()
job_runner = JobRunner(corpus_store, parser_store, config)
feeder = FunctionFeeder(corpus_store, job_runner, min_pages=config.min_pages)


@app.post("/feed")
async def feed(req: FeedRequest):
    await feeder.feed(req.url, req.html, req.job_id)
    return {"status": "accepted", "job_id": req.job_id}


@app.post("/force")
async def force(req: ForceRequest):
    await feeder.force(req.job_id)
    return {"status": "triggered", "job_id": req.job_id}


@app.get("/parser/{parser_id}")
async def get_parser(parser_id: str):
    manifest = await parser_store.get(parser_id)
    if manifest is None:
        raise HTTPException(status_code=404, detail="Parser not found")
    return manifest.model_dump()


@app.post("/regenerate")
async def regenerate(req: RegenerationRequest):
    try:
        result = await job_runner.regenerate(
            req.parser_id, req.labels, req.force
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok"}
