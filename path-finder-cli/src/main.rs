use std::path::PathBuf;

use clap::{Parser, Subcommand};
use colored::Colorize;

#[derive(Parser)]
#[command(name = "path-finder", about = "CLI for the path-findeR service")]
struct Cli {
    #[command(subcommand)]
    command: Command,

    /// Service base URL
    #[arg(long, env = "PATH_FINDER_URL", default_value = "http://localhost:7117")]
    url: String,
}

#[derive(Subcommand)]
enum Command {
    /// Feed an HTML page into the pipeline
    Feed {
        /// Source URL of the page
        source_url: String,
        /// Path to HTML file
        html_file: PathBuf,
        /// Job ID to group pages under
        #[arg(long)]
        job_id: String,
    },
    /// Force-trigger pipeline for a job
    Force {
        /// Job ID to force-trigger
        job_id: String,
    },
    /// Retrieve a parser manifest
    Get {
        /// Parser ID to retrieve
        parser_id: String,
    },
    /// Request regeneration of a broken parser
    Regenerate {
        /// Parser ID to regenerate
        parser_id: String,
        /// Specific labels to regenerate
        #[arg(short, long)]
        label: Vec<String>,
        /// Force regeneration even if newer pages exist
        #[arg(short, long)]
        force: bool,
    },
    /// Check the status of a parser job
    Status {
        /// Parser ID to check
        parser_id: String,
    },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let client = reqwest::Client::new();

    let result = match cli.command {
        Command::Feed {
            source_url,
            html_file,
            job_id,
        } => cmd_feed(&client, &cli.url, &source_url, &html_file, &job_id).await,
        Command::Force { job_id } => cmd_force(&client, &cli.url, &job_id).await,
        Command::Get { parser_id } => cmd_get(&client, &cli.url, &parser_id).await,
        Command::Regenerate {
            parser_id,
            label,
            force,
        } => cmd_regenerate(&client, &cli.url, &parser_id, &label, force).await,
        Command::Status { parser_id } => cmd_status(&client, &cli.url, &parser_id).await,
    };

    if let Err(e) = result {
        eprintln!("{}: {e}", "error".red());
        std::process::exit(1);
    }
}

async fn cmd_feed(
    client: &reqwest::Client,
    base: &str,
    source_url: &str,
    html_file: &PathBuf,
    job_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let html = std::fs::read_to_string(html_file)?;
    client
        .post(format!("{base}/feed"))
        .json(&serde_json::json!({
            "url": source_url,
            "html": html,
            "job_id": job_id,
        }))
        .send()
        .await?
        .error_for_status()?;

    println!("{} Fed page for job {job_id}", "ok".green());
    Ok(())
}

async fn cmd_force(
    client: &reqwest::Client,
    base: &str,
    job_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .post(format!("{base}/force"))
        .json(&serde_json::json!({"job_id": job_id}))
        .send()
        .await?
        .error_for_status()?;

    println!("{} Triggered pipeline for job {job_id}", "ok".green());
    Ok(())
}

async fn cmd_get(
    client: &reqwest::Client,
    base: &str,
    parser_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let resp = client
        .get(format!("{base}/parser/{parser_id}"))
        .send()
        .await?;

    if resp.status().as_u16() == 404 {
        eprintln!("Parser {parser_id} not found");
        std::process::exit(1);
    }

    let data: serde_json::Value = resp.error_for_status()?.json().await?;
    println!("{}", serde_json::to_string_pretty(&data)?);
    Ok(())
}

async fn cmd_regenerate(
    client: &reqwest::Client,
    base: &str,
    parser_id: &str,
    labels: &[String],
    force: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut payload = serde_json::json!({
        "parser_id": parser_id,
        "force": force,
    });
    if !labels.is_empty() {
        payload["labels"] = serde_json::json!(labels);
    }

    let resp = client
        .post(format!("{base}/regenerate"))
        .json(&payload)
        .send()
        .await?;

    if resp.status().as_u16() == 404 {
        eprintln!("Parser {parser_id} not found");
        std::process::exit(1);
    }

    let data: serde_json::Value = resp.error_for_status()?.json().await?;
    let status = data["status"].as_str().unwrap_or("unknown");
    println!("{}", status.green());
    Ok(())
}

async fn cmd_status(
    client: &reqwest::Client,
    base: &str,
    parser_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let resp = client
        .get(format!("{base}/parser/{parser_id}"))
        .send()
        .await?;

    if resp.status().as_u16() == 404 {
        eprintln!("Parser {parser_id} not found");
        std::process::exit(1);
    }

    let data: serde_json::Value = resp.error_for_status()?.json().await?;

    println!("{:>12}: {parser_id}", "Parser".bold());
    println!("{:>12}: {}", "Status".bold(), data["status"].as_str().unwrap_or("-"));
    println!("{:>12}: {}", "Created".bold(), data["created_at"].as_str().unwrap_or("-"));
    println!(
        "{:>12}: {}",
        "Completed".bold(),
        data["completed_at"].as_str().unwrap_or("-")
    );
    println!(
        "{:>12}: {}",
        "Error".bold(),
        data["error"].as_str().unwrap_or("-")
    );

    if let Some(pat) = data.get("url_pattern") {
        println!("{:>12}: {}", "Host".bold(), pat["host"].as_str().unwrap_or("-"));
        println!("{:>12}: {}", "Pattern".bold(), pat["pattern"].as_str().unwrap_or("-"));
    }

    if let Some(parser) = data.get("parser").and_then(|p| p.as_object()) {
        println!("{:>12}: {}", "Labels".bold(), parser.len());
        let unresolved = parser
            .values()
            .filter(|v| v["unresolved"].as_bool() == Some(true))
            .count();
        println!("{:>12}: {}", "Unresolved".bold(), unresolved);
    }

    Ok(())
}
