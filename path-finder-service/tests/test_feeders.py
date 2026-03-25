from unittest.mock import AsyncMock, MagicMock

import pytest

from path_finder_service.feeders.function_feeder import FunctionFeeder


@pytest.fixture
def corpus_store():
    store = AsyncMock()
    return store


@pytest.fixture
def job_runner():
    runner = AsyncMock()
    return runner


class TestFunctionFeeder:
    @pytest.mark.asyncio
    async def test_feed_stores_page(self, corpus_store, job_runner):
        feeder = FunctionFeeder(corpus_store, job_runner, min_pages=2)
        await feeder.feed("http://example.com/1", "<html>1</html>", "job1")
        corpus_store.put.assert_called_once_with("job1", 0, "http://example.com/1", "<html>1</html>")

    @pytest.mark.asyncio
    async def test_feed_increments_index(self, corpus_store, job_runner):
        feeder = FunctionFeeder(corpus_store, job_runner, min_pages=3)
        await feeder.feed("http://example.com/1", "<html>1</html>", "job1")
        await feeder.feed("http://example.com/2", "<html>2</html>", "job1")
        assert corpus_store.put.call_count == 2
        corpus_store.put.assert_any_call("job1", 0, "http://example.com/1", "<html>1</html>")
        corpus_store.put.assert_any_call("job1", 1, "http://example.com/2", "<html>2</html>")

    @pytest.mark.asyncio
    async def test_feed_triggers_at_min_pages(self, corpus_store, job_runner):
        feeder = FunctionFeeder(corpus_store, job_runner, min_pages=2)
        await feeder.feed("http://example.com/1", "<html>1</html>", "job1")
        job_runner.trigger.assert_not_called()
        await feeder.feed("http://example.com/2", "<html>2</html>", "job1")
        job_runner.trigger.assert_called_once_with("job1")

    @pytest.mark.asyncio
    async def test_feed_min_pages_floor_is_2(self, corpus_store, job_runner):
        feeder = FunctionFeeder(corpus_store, job_runner, min_pages=1)
        assert feeder._min_pages == 2

    @pytest.mark.asyncio
    async def test_force_triggers_immediately(self, corpus_store, job_runner):
        feeder = FunctionFeeder(corpus_store, job_runner, min_pages=5)
        await feeder.feed("http://example.com/1", "<html>1</html>", "job1")
        await feeder.force("job1")
        job_runner.trigger.assert_called_once_with("job1")

    @pytest.mark.asyncio
    async def test_separate_jobs_tracked_independently(self, corpus_store, job_runner):
        feeder = FunctionFeeder(corpus_store, job_runner, min_pages=2)
        await feeder.feed("http://a.com/1", "<html>a1</html>", "jobA")
        await feeder.feed("http://b.com/1", "<html>b1</html>", "jobB")
        job_runner.trigger.assert_not_called()
        await feeder.feed("http://a.com/2", "<html>a2</html>", "jobA")
        job_runner.trigger.assert_called_once_with("jobA")
