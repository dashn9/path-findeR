import asyncio
import json
from collections import defaultdict

import redis.asyncio as redis

from path_finder_service.jobs import JobRunner
from path_finder_service.storage.corpus import CorpusStore


class RedisStreamFeeder:
    def __init__(
        self,
        redis_url: str,
        stream_key: str,
        group_name: str,
        consumer_name: str,
        corpus_store: CorpusStore,
        job_runner: JobRunner,
        min_pages: int = 2,
    ):
        self._redis = redis.from_url(redis_url)
        self._stream_key = stream_key
        self._group_name = group_name
        self._consumer_name = consumer_name
        self._corpus = corpus_store
        self._runner = job_runner
        self._min_pages = max(min_pages, 2)
        self._counts: dict[str, int] = defaultdict(int)

    async def _ensure_group(self) -> None:
        try:
            await self._redis.xgroup_create(
                self._stream_key, self._group_name, id="0", mkstream=True
            )
        except redis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise

    async def start(self) -> None:
        await self._ensure_group()
        while True:
            messages = await self._redis.xreadgroup(
                self._group_name,
                self._consumer_name,
                {self._stream_key: ">"},
                count=10,
                block=5000,
            )
            for _, entries in messages:
                for msg_id, data in entries:
                    await self._process_message(data)
                    await self._redis.xack(
                        self._stream_key, self._group_name, msg_id
                    )

    async def _process_message(self, data: dict[bytes, bytes]) -> None:
        url = data[b"url"].decode("utf-8")
        html = data[b"html"].decode("utf-8")
        job_id = data[b"job_id"].decode("utf-8")

        index = self._counts[job_id]
        await self._corpus.put(job_id, index, url, html)
        self._counts[job_id] += 1

        if self._counts[job_id] >= self._min_pages:
            await self._runner.trigger(job_id)

    async def feed(self, url: str, html: str, job_id: str) -> None:
        await self._redis.xadd(
            self._stream_key,
            {"url": url, "html": html, "job_id": job_id},
        )

    async def force(self, job_id: str) -> None:
        await self._runner.trigger(job_id)
