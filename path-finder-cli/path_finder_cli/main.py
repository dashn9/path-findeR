from pathlib import Path

import httpx
import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(name="path-finder", help="CLI for path-findeR service")
console = Console()

DEFAULT_BASE_URL = "http://localhost:8000"


def _base_url() -> str:
    import os
    return os.getenv("PATH_FINDER_URL", DEFAULT_BASE_URL)


@app.command()
def feed(
    url: str = typer.Argument(help="Source URL of the page"),
    html_file: Path = typer.Argument(help="Path to HTML file"),
    job_id: str = typer.Option(help="Job ID to group pages under"),
):
    """Feed an HTML page into the pipeline."""
    html = html_file.read_text(encoding="utf-8")
    with httpx.Client(base_url=_base_url()) as client:
        resp = client.post("/feed", json={"url": url, "html": html, "job_id": job_id})
        resp.raise_for_status()
    console.print(f"[green]Fed page for job {job_id}[/green]")


@app.command()
def force(
    job_id: str = typer.Argument(help="Job ID to force-trigger"),
):
    """Force-trigger pipeline for a job regardless of page count."""
    with httpx.Client(base_url=_base_url()) as client:
        resp = client.post("/force", json={"job_id": job_id})
        resp.raise_for_status()
    console.print(f"[green]Triggered pipeline for job {job_id}[/green]")


@app.command()
def get(
    parser_id: str = typer.Argument(help="Parser ID to retrieve"),
):
    """Retrieve a parser manifest."""
    with httpx.Client(base_url=_base_url()) as client:
        resp = client.get(f"/parser/{parser_id}")
        if resp.status_code == 404:
            console.print(f"[red]Parser {parser_id} not found[/red]")
            raise typer.Exit(1)
        resp.raise_for_status()
        data = resp.json()

    console.print_json(data=data)


@app.command()
def regenerate(
    parser_id: str = typer.Argument(help="Parser ID to regenerate"),
    labels: list[str] | None = typer.Option(None, "--label", "-l", help="Specific labels to regenerate"),
    force: bool = typer.Option(False, "--force", "-f", help="Force regeneration even if newer pages exist"),
):
    """Request regeneration of a broken parser."""
    payload: dict = {"parser_id": parser_id, "force": force}
    if labels:
        payload["labels"] = labels
    with httpx.Client(base_url=_base_url()) as client:
        resp = client.post("/regenerate", json=payload)
        if resp.status_code == 404:
            console.print(f"[red]Parser {parser_id} not found[/red]")
            raise typer.Exit(1)
        resp.raise_for_status()
        data = resp.json()

    console.print(f"[green]{data.get('status', 'done')}[/green]")


@app.command()
def status(
    parser_id: str = typer.Argument(help="Parser ID to check status"),
):
    """Check the status of a parser job."""
    with httpx.Client(base_url=_base_url()) as client:
        resp = client.get(f"/parser/{parser_id}")
        if resp.status_code == 404:
            console.print(f"[red]Parser {parser_id} not found[/red]")
            raise typer.Exit(1)
        resp.raise_for_status()
        data = resp.json()

    table = Table(title=f"Parser {parser_id}")
    table.add_column("Field", style="bold")
    table.add_column("Value")
    table.add_row("Status", data.get("status", "unknown"))
    table.add_row("Created", data.get("created_at", ""))
    table.add_row("Completed", data.get("completed_at", "") or "-")
    table.add_row("Error", data.get("error", "") or "-")

    if data.get("url_pattern"):
        pat = data["url_pattern"]
        table.add_row("Host", pat.get("host", ""))
        table.add_row("Pattern", pat.get("pattern", ""))

    if data.get("parser"):
        table.add_row("Labels", str(len(data["parser"])))
        unresolved = sum(1 for p in data["parser"].values() if p.get("unresolved"))
        table.add_row("Unresolved", str(unresolved))

    console.print(table)


if __name__ == "__main__":
    app()
