from datetime import datetime

from path_finder_service.models import (
    FeedRequest,
    ForceRequest,
    JobStatus,
    ParserManifest,
    PipelineConfig,
    RegenerationRequest,
)


class TestJobStatus:
    def test_enum_values(self):
        assert JobStatus.PENDING == "pending"
        assert JobStatus.RUNNING == "running"
        assert JobStatus.DONE == "done"
        assert JobStatus.FAILED == "failed"


class TestParserManifest:
    def test_defaults(self):
        m = ParserManifest(job_id="j1")
        assert m.job_id == "j1"
        assert m.status == JobStatus.PENDING
        assert m.error is None
        assert m.url_pattern is None
        assert m.parser is None

    def test_full(self):
        m = ParserManifest(
            job_id="j1",
            status=JobStatus.DONE,
            created_at=datetime(2025, 1, 1),
            completed_at=datetime(2025, 1, 2),
            url_pattern={"host": "example.com", "pattern": "/p/{}"},
            parser={"title": {"selectors": ["h1"], "array": False}},
        )
        assert m.status == JobStatus.DONE
        assert m.url_pattern["host"] == "example.com"

    def test_serialize(self):
        m = ParserManifest(job_id="j1")
        d = m.model_dump()
        assert "job_id" in d
        assert d["status"] == "pending"


class TestFeedRequest:
    def test_valid(self):
        r = FeedRequest(url="http://example.com", html="<html></html>", job_id="j1")
        assert r.url == "http://example.com"
        assert r.job_id == "j1"


class TestForceRequest:
    def test_valid(self):
        r = ForceRequest(job_id="j1")
        assert r.job_id == "j1"


class TestRegenerationRequest:
    def test_defaults(self):
        r = RegenerationRequest(parser_id="p1")
        assert r.parser_id == "p1"
        assert r.labels is None
        assert r.force is False

    def test_with_labels(self):
        r = RegenerationRequest(parser_id="p1", labels=["title", "price"], force=True)
        assert r.labels == ["title", "price"]
        assert r.force is True


class TestPipelineConfig:
    def test_defaults(self):
        c = PipelineConfig()
        assert c.max_direct_kb == 300
        assert c.top_n_nodes == 30
        assert c.max_sentences == 3
        assert c.max_sentence_chars == 500
        assert c.similarity_threshold == 0.75
        assert c.max_retries == 3
        assert c.output_format == "json"
        assert c.exclusions == []
        assert c.min_pages == 2

    def test_custom(self):
        c = PipelineConfig(max_direct_kb=100, exclusions=["my-widget"])
        assert c.max_direct_kb == 100
        assert c.exclusions == ["my-widget"]
