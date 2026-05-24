use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

const SECRET_FIELDS: &[&str] = &[
    "student_id",
    "student_name",
    "password",
    "session_cookie",
    "access_token",
    "raw_authenticated_payload",
];

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has a repository parent")
        .to_path_buf()
}

fn read_fixture(name: &str) -> Value {
    let path = repo_root().join("tests/fixtures/security").join(name);
    let text = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
    serde_json::from_str(&text)
        .unwrap_or_else(|error| panic!("failed to parse {}: {error}", path.display()))
}

#[test]
fn study_space_sanitized_fixture_redacts_all_secret_fields() {
    let unsafe_fixture = read_fixture("study-space-secret-input.json");
    let sanitized_fixture = read_fixture("study-space-secret-sanitized.json");
    let sanitized_text = serde_json::to_string(&sanitized_fixture).unwrap();

    for field in SECRET_FIELDS {
        let unsafe_value = unsafe_fixture
            .get(*field)
            .and_then(Value::as_str)
            .unwrap_or_else(|| panic!("unsafe fixture missing {field}"));

        assert!(
            !unsafe_value.is_empty(),
            "unsafe fixture field {field} must be non-empty so scans can catch leaks"
        );
        assert_eq!(
            sanitized_fixture.get(*field).and_then(Value::as_str),
            Some("<redacted>"),
            "sanitized fixture must redact {field}"
        );
        assert!(
            !sanitized_text.contains(unsafe_value),
            "sanitized fixture must not contain unsafe {field} value"
        );
    }
}

#[test]
fn study_space_safe_reservation_metadata_remains_available_after_redaction() {
    let sanitized_fixture = read_fixture("study-space-secret-sanitized.json");
    let reservation = sanitized_fixture
        .get("reservation")
        .expect("sanitized fixture keeps reservation metadata");

    assert_eq!(
        reservation.get("area").and_then(Value::as_str),
        Some("coding_lounge")
    );
    assert_eq!(
        reservation.get("room").and_then(Value::as_str),
        Some("103호")
    );
    assert_eq!(
        reservation.get("date").and_then(Value::as_str),
        Some("2026-05-27")
    );
    assert_eq!(
        reservation.get("startTime").and_then(Value::as_str),
        Some("13:00")
    );
    assert_eq!(
        reservation.get("endTime").and_then(Value::as_str),
        Some("15:00")
    );
}
