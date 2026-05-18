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
    /// Feed an HTML page into the pipeline. The server routes it to the right
    /// (hostname, template) bucket and returns the bucket id.
    Feed {
        /// Source URL of the page
        source_url: String,
        /// Path to HTML file
        html_file: PathBuf,
    },
    /// Force-trigger a pipeline run for a known bucket.
    Force {
        /// Bucket id (e.g. "shop.example.com:a1b2c3d4")
        bucket_id: String,
    },
    /// Retrieve a parser manifest. The parser id is the bucket id.
    Get {
        /// Parser id to retrieve
        parser_id: String,
    },
    /// Request regeneration of a broken parser
    Regenerate {
        /// Parser id to regenerate
        parser_id: String,
        /// Specific labels to regenerate
        #[arg(short, long)]
        label: Vec<String>,
        /// Force regeneration even if newer pages exist
        #[arg(short, long)]
        force: bool,
    },
    /// Check the status of a parser
    Status {
        /// Parser id to check
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
        } => cmd_feed(&client, &cli.url, &source_url, &html_file).await,
        Command::Force { bucket_id } => cmd_force(&client, &cli.url, &bucket_id).await,
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
) -> Result<(), Box<dyn std::error::Error>> {
    let html = std::fs::read_to_string(html_file)?;
    let resp: serde_json::Value = client
        .post(format!("{base}/feed"))
        .json(&serde_json::json!({
            "url": source_url,
            "html": html,
        }))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let bucket_id = resp["bucket_id"].as_str().unwrap_or("?");
    println!("{} Fed page into bucket {bucket_id}", "ok".green());
    Ok(())
}

async fn cmd_force(
    client: &reqwest::Client,
    base: &str,
    bucket_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .post(format!("{base}/force"))
        .json(&serde_json::json!({"bucket_id": bucket_id}))
        .send()
        .await?
        .error_for_status()?;

    println!("{} Triggered pipeline for bucket {bucket_id}", "ok".green());
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
    println!("{:>12}: {}", "Hostname".bold(), data["hostname"].as_str().unwrap_or("-"));
    println!("{:>12}: {}", "Pages".bold(), data["page_count"].as_i64().unwrap_or(0));
    println!("{:>12}: {}", "Created".bold(), data["created_at"].as_str().unwrap_or("-"));
    println!(
        "{:>12}: {}",
        "Triggered".bold(),
        data["last_triggered_at"].as_str().unwrap_or("-")
    );
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
