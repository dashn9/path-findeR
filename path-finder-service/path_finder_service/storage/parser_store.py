from datetime import datetime
from typing import Any, Protocol

from motor.motor_asyncio import AsyncIOMotorClient

from path_finder_service.models import JobStatus, ParserManifest


class ParserStore(Protocol):
    async def save(self, manifest: ParserManifest) -> None: ...
    async def get(self, parser_id: str) -> ParserManifest | None: ...
    async def update_status(self, parser_id: str, status: str, error: str | None = None) -> None: ...


class MongoParserStore:
    def __init__(self, uri: str, db_name: str = "path_finder"):
        self._client: AsyncIOMotorClient = AsyncIOMotorClient(uri)
        self._db = self._client[db_name]
        self._collection = self._db["manifests"]

    async def save(self, manifest: ParserManifest) -> None:
        doc = manifest.model_dump(by_alias=True)
        doc["_id"] = manifest.job_id
        await self._collection.insert_one(doc)

    async def get(self, parser_id: str) -> ParserManifest | None:
        doc = await self._collection.find_one({"_id": parser_id})
        if doc is None:
            return None
        return ParserManifest.model_validate(doc)

    async def update_status(
        self, parser_id: str, status: str, error: str | None = None
    ) -> None:
        update: dict[str, Any] = {"$set": {"status": status}}
        if status == JobStatus.DONE:
            update["$set"]["completed_at"] = datetime.now()
        if error is not None:
            update["$set"]["error"] = error
        await self._collection.update_one({"_id": parser_id}, update)

    async def update_result(self, parser_id: str, result: dict) -> None:
        await self._collection.update_one(
            {"_id": parser_id},
            {
                "$set": {
                    "status": JobStatus.DONE,
                    "completed_at": datetime.now(),
                    "url_pattern": result.get("url_pattern"),
                    "parser": result.get("parser"),
                }
            },
        )
