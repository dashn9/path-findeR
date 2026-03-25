import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from typer.testing import CliRunner

from path_finder_cli.main import app

runner = CliRunner()


def mock_response(status_code=200, json_data=None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    resp.raise_for_status = MagicMock()
    if status_code >= 400:
        from httpx import HTTPStatusError, Request, Response
        resp.raise_for_status.side_effect = HTTPStatusError(
            "error", request=MagicMock(), response=resp
        )
    return resp


class TestFeedCommand:
    def test_feed_success(self, tmp_path):
        html_file = tmp_path / "page.html"
        html_file.write_text("<html><body>Hello</body></html>")

        with patch("path_finder_cli.main.httpx.Client") as MockClient:
            mock_client = MagicMock()
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client.post.return_value = mock_response(200, {"status": "accepted"})
            MockClient.return_value = mock_client

            result = runner.invoke(app, [
                "feed", "http://example.com/1", str(html_file),
                "--job-id", "test-job",
            ])

        assert result.exit_code == 0
        assert "Fed page" in result.output

    def test_feed_missing_file(self):
        result = runner.invoke(app, [
            "feed", "http://example.com", "/nonexistent.html",
            "--job-id", "j1",
        ])
        assert result.exit_code != 0


class TestForceCommand:
    def test_force_success(self):
        with patch("path_finder_cli.main.httpx.Client") as MockClient:
            mock_client = MagicMock()
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client.post.return_value = mock_response(200, {"status": "triggered"})
            MockClient.return_value = mock_client

            result = runner.invoke(app, ["force", "test-job"])

        assert result.exit_code == 0
        assert "Triggered" in result.output


class TestGetCommand:
    def test_get_found(self):
        data = {
            "job_id": "p1",
            "status": "done",
            "url_pattern": {"host": "example.com", "pattern": "/p/{}"},
            "parser": {"title": {"selectors": ["h1"], "array": False}},
        }
        with patch("path_finder_cli.main.httpx.Client") as MockClient:
            mock_client = MagicMock()
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client.get.return_value = mock_response(200, data)
            MockClient.return_value = mock_client

            result = runner.invoke(app, ["get", "p1"])

        assert result.exit_code == 0

    def test_get_not_found(self):
        with patch("path_finder_cli.main.httpx.Client") as MockClient:
            mock_client = MagicMock()
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            resp = mock_response(404)
            resp.raise_for_status = MagicMock()  # don't raise for 404 (handled before)
            mock_client.get.return_value = resp
            MockClient.return_value = mock_client

            result = runner.invoke(app, ["get", "nonexistent"])

        assert result.exit_code == 1


class TestRegenerateCommand:
    def test_regenerate_success(self):
        with patch("path_finder_cli.main.httpx.Client") as MockClient:
            mock_client = MagicMock()
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client.post.return_value = mock_response(
                200, {"status": "regeneration_triggered"}
            )
            MockClient.return_value = mock_client

            result = runner.invoke(app, ["regenerate", "p1"])

        assert result.exit_code == 0
        assert "regeneration_triggered" in result.output

    def test_regenerate_with_labels_and_force(self):
        with patch("path_finder_cli.main.httpx.Client") as MockClient:
            mock_client = MagicMock()
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client.post.return_value = mock_response(
                200, {"status": "regeneration_triggered"}
            )
            MockClient.return_value = mock_client

            result = runner.invoke(app, [
                "regenerate", "p1",
                "-l", "title", "-l", "price",
                "--force",
            ])

        assert result.exit_code == 0


class TestStatusCommand:
    def test_status_display(self):
        data = {
            "job_id": "p1",
            "status": "done",
            "created_at": "2025-01-01T00:00:00",
            "completed_at": "2025-01-01T00:01:00",
            "error": None,
            "url_pattern": {"host": "example.com", "pattern": "/p/{}"},
            "parser": {
                "title": {"selectors": ["h1"], "array": False, "unresolved": False},
                "price": {"selectors": [".price"], "array": False, "unresolved": True},
            },
        }
        with patch("path_finder_cli.main.httpx.Client") as MockClient:
            mock_client = MagicMock()
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client.get.return_value = mock_response(200, data)
            MockClient.return_value = mock_client

            result = runner.invoke(app, ["status", "p1"])

        assert result.exit_code == 0
        assert "done" in result.output
