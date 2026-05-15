use std::process::Command;

fn cargo_bin() -> Command {
    Command::new(env!("CARGO_BIN_EXE_path-finder"))
}

#[test]
fn cli_help() {
    let output = cargo_bin().arg("--help").output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("path-findeR"));
}

#[test]
fn cli_feed_help() {
    let output = cargo_bin().args(["feed", "--help"]).output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("html-file"));
    assert!(stdout.contains("job-id"));
}

#[test]
fn cli_force_help() {
    let output = cargo_bin().args(["force", "--help"]).output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("job-id"));
}

#[test]
fn cli_get_help() {
    let output = cargo_bin().args(["get", "--help"]).output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("parser-id"));
}

#[test]
fn cli_regenerate_help() {
    let output = cargo_bin().args(["regenerate", "--help"]).output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("parser-id"));
    assert!(stdout.contains("--force"));
    assert!(stdout.contains("--label"));
}

#[test]
fn cli_status_help() {
    let output = cargo_bin().args(["status", "--help"]).output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("parser-id"));
}

#[test]
fn cli_feed_missing_file_fails() {
    let output = cargo_bin()
        .args([
            "feed",
            "http://example.com",
            "/nonexistent/file.html",
            "--job-id",
            "j1",
        ])
        .output()
        .unwrap();
    assert!(!output.status.success());
}

#[test]
fn cli_no_subcommand_shows_help() {
    let output = cargo_bin().output().unwrap();
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Usage"));
}
