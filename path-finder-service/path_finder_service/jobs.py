import asyncio
import logging
from datetime import datetime

import path_finder_core

from path_finder_service.models import JobStatus, ParserManifest, PipelineConfig
from path_finder_service.storage.corpus import CorpusStore
from path_finder_service.storage.parser_store import ParserStore

logger = logging.getLogger(__name__)


class JobRunner:
    def __init__(
        self,
        corpus_store: CorpusStore,
        parser_store: ParserStore,
        config: PipelineConfig | None = None,
    ):
        self._corpus = corpus_store
        self._parser_store = parser_store
        self._config = config or PipelineConfig()
        self._running: set[str] = set()

    async def trigger(self, job_id: str) -> None:
        if job_id in self._running:
            return
        self._running.add(job_id)
        asyncio.create_task(self._run(job_id))

    async def _run(self, job_id: str) -> None:
        manifest = ParserManifest(
            job_id=job_id,
            status=JobStatus.RUNNING,
            created_at=datetime.now(),
        )
        try:
            await self._parser_store.save(manifest)
        except Exception:
            await self._parser_store.update_status(
                job_id, JobStatus.RUNNING
            )

        try:
            pages = await self._corpus.get_all(job_id)
            config_dict = self._config.model_dump()
            result = await asyncio.to_thread(
                path_finder_core.run, pages, config_dict
            )
            await self._parser_store.update_result(job_id, result)
            logger.info("Job %s completed successfully", job_id)
        except Exception as exc:
            logger.exception("Job %s failed", job_id)
            await self._parser_store.update_status(
                job_id, JobStatus.FAILED, str(exc)
            )
        finally:
            self._running.discard(job_id)

    async def regenerate(
        self,
        parser_id: str,
        labels: list[str] | None = None,
        force: bool = False,
    ) -> dict:
        manifest = await self._parser_store.get(parser_id)
        if manifest is None:
            raise ValueError(f"Parser '{parser_id}' not found")

        # Check for newer pages (simplified: re-trigger the same job)
        if not force:
            pages = await self._corpus.get_all(manifest.job_id)
            if manifest.completed_at and pages:
                # In a real implementation, we'd check page timestamps
                pass

        await self.trigger(manifest.job_id)
        return {"status": "regeneration_triggered", "parser_id": parser_id}
