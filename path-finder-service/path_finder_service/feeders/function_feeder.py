from collections import defaultdict

from path_finder_service.jobs import JobRunner
from path_finder_service.storage.corpus import CorpusStore


class FunctionFeeder:
    def __init__(
        self,
        corpus_store: CorpusStore,
        job_runner: JobRunner,
        min_pages: int = 2,
    ):
        self._corpus = corpus_store
        self._runner = job_runner
        self._min_pages = max(min_pages, 2)
        self._counts: dict[str, int] = defaultdict(int)

    async def feed(self, url: str, html: str, job_id: str) -> None:
        index = self._counts[job_id]
        await self._corpus.put(job_id, index, url, html)
        self._counts[job_id] += 1

        if self._counts[job_id] >= self._min_pages:
            await self._runner.trigger(job_id)

    async def force(self, job_id: str) -> None:
        await self._runner.trigger(job_id)
