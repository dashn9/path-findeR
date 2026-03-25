from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from path_finder_service.models import JobStatus, ParserManifest


@pytest.fixture
def client():
    from path_finder_service.main import app
    return TestClient(app)


class TestHealthEndpoint:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestFeedEndpoint:
    def test_feed_accepted(self, client):
        with patch("path_finder_service.main.feeder") as mock_feeder:
            mock_feeder.feed = AsyncMock()
            resp = client.post("/feed", json={
                "url": "http://example.com/1",
                "html": "<html></html>",
                "job_id": "test-job",
            })
        assert resp.status_code == 200
        assert resp.json()["status"] == "accepted"

    def test_feed_missing_fields(self, client):
        resp = client.post("/feed", json={"url": "http://example.com"})
        assert resp.status_code == 422


class TestForceEndpoint:
    def test_force_trigger(self, client):
        with patch("path_finder_service.main.feeder") as mock_feeder:
            mock_feeder.force = AsyncMock()
            resp = client.post("/force", json={"job_id": "test-job"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "triggered"


class TestGetParserEndpoint:
    def test_not_found(self, client):
        with patch("path_finder_service.main.parser_store") as mock_store:
            mock_store.get = AsyncMock(return_value=None)
            resp = client.get("/parser/nonexistent")
        assert resp.status_code == 404

    def test_found(self, client):
        manifest = ParserManifest(job_id="p1", status=JobStatus.DONE)
        with patch("path_finder_service.main.parser_store") as mock_store:
            mock_store.get = AsyncMock(return_value=manifest)
            resp = client.get("/parser/p1")
        assert resp.status_code == 200
        assert resp.json()["job_id"] == "p1"


class TestRegenerateEndpoint:
    def test_regenerate_not_found(self, client):
        with patch("path_finder_service.main.job_runner") as mock_runner:
            mock_runner.regenerate = AsyncMock(side_effect=ValueError("not found"))
            resp = client.post("/regenerate", json={"parser_id": "bad"})
        assert resp.status_code == 404

    def test_regenerate_success(self, client):
        with patch("path_finder_service.main.job_runner") as mock_runner:
            mock_runner.regenerate = AsyncMock(
                return_value={"status": "regeneration_triggered", "parser_id": "p1"}
            )
            resp = client.post("/regenerate", json={"parser_id": "p1"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "regeneration_triggered"
