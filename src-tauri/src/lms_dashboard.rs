use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const LMS_BRIDGE_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_COURSES: usize = 20;
const MAX_ASSIGNMENTS: usize = 60;
const MAX_BRIDGE_STDOUT_BYTES: usize = 1_000_000;
const PATH_REDACTION: &str = "[redacted-path]";
const TOKEN_REDACTION: &str = "[redacted-token]";
const STUDENT_ID_REDACTION: &str = "[redacted-student-id]";
const LMS_ALLOWED_ORIGIN: &str = "https://learn.hansung.ac.kr";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LmsDashboardErrorCode {
    AuthRequired,
    AuthFailed,
    KeychainUnavailable,
    BridgeUnavailable,
    BridgeTimeout,
    NetworkError,
    ParseError,
    UnsafeUrl,
    UnknownError,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LmsCredentialState {
    Missing,
    Ready,
    AuthFailed,
    KeychainUnavailable,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct LmsCommandError {
    pub code: LmsDashboardErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safe_details: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct LmsCommandResult<T> {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<LmsCommandError>,
}

impl<T> LmsCommandResult<T> {
    pub fn ok(data: T) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(error: LmsCommandError) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(error),
        }
    }
}

impl LmsCommandError {
    pub fn new(code: LmsDashboardErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: sanitize_lms_text(&message.into()),
            safe_details: None,
        }
    }

    pub fn with_details(
        code: LmsDashboardErrorCode,
        message: impl Into<String>,
        details: impl Into<String>,
    ) -> Self {
        let safe_details = sanitize_lms_text(&details.into());
        Self {
            code,
            message: sanitize_lms_text(&message.into()),
            safe_details: if safe_details.is_empty() {
                None
            } else {
                Some(safe_details)
            },
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct LmsStatus {
    pub credential_state: LmsCredentialState,
    pub credential_message: String,
    pub read_only: bool,
    pub session_clear_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub student_id_masked: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct LmsLoginRequest {
    pub student_id: String,
    pub password: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct LmsLoginResult {
    pub credential_state: LmsCredentialState,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub student_id_masked: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct LmsCourse {
    pub course_id: String,
    pub name: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress_text: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct LmsAssignment {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignment_id: Option<String>,
    pub course_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub course_name: Option<String>,
    pub name: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct LmsOverviewSummary {
    pub course_count: usize,
    pub assignment_count: usize,
    pub capped_course_count: usize,
    pub capped_assignment_count: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct LmsOverview {
    pub read_only: bool,
    pub summary: LmsOverviewSummary,
    pub courses: Vec<LmsCourse>,
    pub assignments: Vec<LmsAssignment>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct LmsClearSessionResult {
    pub cleared: bool,
    pub message: String,
}

pub struct LmsDashboardAdapter;

impl LmsDashboardAdapter {
    pub fn status() -> LmsStatus {
        match call_lms_bridge(json!({ "op": "status" })) {
            Ok(response) if response.get("ok").and_then(Value::as_bool) == Some(true) => {
                let logged_in = response
                    .get("logged_in")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let student_id_masked = response
                    .get("student_id_masked")
                    .and_then(Value::as_str)
                    .map(sanitize_lms_text)
                    .filter(|value| !value.is_empty());
                LmsStatus {
                    credential_state: if logged_in {
                        LmsCredentialState::Ready
                    } else {
                        LmsCredentialState::Missing
                    },
                    credential_message: if logged_in {
                        student_id_masked
                            .as_ref()
                            .map(|masked| format!("한성 e-class 세션이 준비되었습니다. ({masked})"))
                            .unwrap_or_else(|| {
                                "한성 e-class 세션이 보안 저장소에 저장되어 있습니다.".to_string()
                            })
                    } else {
                        "저장된 한성 e-class 세션이 없습니다.".to_string()
                    },
                    read_only: true,
                    session_clear_available: true,
                    student_id_masked,
                }
            }
            Ok(response) => status_for_error(bridge_response_error(&response)),
            Err(error) => status_for_error(error),
        }
    }

    pub fn login(request: LmsLoginRequest) -> LmsCommandResult<LmsLoginResult> {
        if request.student_id.trim().is_empty() || request.password.is_empty() {
            return LmsCommandResult::err(LmsCommandError::new(
                LmsDashboardErrorCode::AuthRequired,
                "학번과 비밀번호를 입력해 주세요.",
            ));
        }
        match call_lms_bridge(json!({
            "op": "login",
            "student_id": request.student_id,
            "password": request.password,
        })) {
            Ok(response) if response.get("ok").and_then(Value::as_bool) == Some(true) => {
                LmsCommandResult::ok(LmsLoginResult {
                    credential_state: LmsCredentialState::Ready,
                    message: response
                        .get("message")
                        .and_then(Value::as_str)
                        .map(sanitize_lms_text)
                        .unwrap_or_else(|| "로그인 성공. 비밀번호는 저장하지 않고 LMS 세션만 OS 보안 저장소에 저장했습니다.".to_string()),
                    student_id_masked: response.get("student_id_masked").and_then(Value::as_str).map(sanitize_lms_text),
                })
            }
            Ok(response) => LmsCommandResult::err(bridge_response_error(&response)),
            Err(error) => LmsCommandResult::err(error),
        }
    }

    pub fn overview() -> LmsCommandResult<LmsOverview> {
        match call_lms_bridge(json!({ "op": "overview" })) {
            Ok(response) if response.get("ok").and_then(Value::as_bool) == Some(true) => {
                LmsCommandResult::ok(overview_from_bridge(&response))
            }
            Ok(response) => LmsCommandResult::err(bridge_response_error(&response)),
            Err(error) => LmsCommandResult::err(error),
        }
    }

    pub fn clear_session() -> LmsCommandResult<LmsClearSessionResult> {
        match call_lms_bridge(json!({ "op": "clear_session" })) {
            Ok(response) if response.get("ok").and_then(Value::as_bool) == Some(true) => {
                LmsCommandResult::ok(LmsClearSessionResult {
                    cleared: response
                        .get("cleared")
                        .and_then(Value::as_bool)
                        .unwrap_or(true),
                    message: response
                        .get("message")
                        .and_then(Value::as_str)
                        .map(sanitize_lms_text)
                        .unwrap_or_else(|| "저장된 LMS 세션을 삭제했습니다.".to_string()),
                })
            }
            Ok(response) => LmsCommandResult::err(bridge_response_error(&response)),
            Err(error) => LmsCommandResult::err(error),
        }
    }
}

fn status_for_error(error: LmsCommandError) -> LmsStatus {
    LmsStatus {
        credential_state: credential_state_for_error(&error.code),
        credential_message: error.message,
        read_only: true,
        session_clear_available: true,
        student_id_masked: None,
    }
}

fn overview_from_bridge(response: &Value) -> LmsOverview {
    let raw_courses = response
        .get("courses")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let raw_assignments = response
        .get("assignments")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let courses: Vec<LmsCourse> = raw_courses
        .iter()
        .filter_map(course_from_bridge)
        .take(MAX_COURSES)
        .collect();
    let assignments: Vec<LmsAssignment> = raw_assignments
        .iter()
        .filter_map(assignment_from_bridge)
        .take(MAX_ASSIGNMENTS)
        .collect();
    LmsOverview {
        read_only: true,
        summary: LmsOverviewSummary {
            course_count: raw_courses.len(),
            assignment_count: raw_assignments.len(),
            capped_course_count: courses.len(),
            capped_assignment_count: assignments.len(),
        },
        courses,
        assignments,
    }
}

fn course_from_bridge(value: &Value) -> Option<LmsCourse> {
    Some(LmsCourse {
        course_id: sanitize_lms_text(value.get("course_id")?.as_str()?),
        name: sanitize_lms_text(value.get("name")?.as_str()?),
        url: safe_lms_url(value.get("url")?.as_str()?)?,
        progress_text: value
            .get("progress_text")
            .and_then(Value::as_str)
            .map(sanitize_lms_text)
            .filter(|value| !value.is_empty()),
    })
}

fn assignment_from_bridge(value: &Value) -> Option<LmsAssignment> {
    Some(LmsAssignment {
        assignment_id: value
            .get("assignment_id")
            .and_then(Value::as_str)
            .map(sanitize_lms_text)
            .filter(|value| !value.is_empty()),
        course_id: sanitize_lms_text(value.get("course_id")?.as_str()?),
        course_name: value
            .get("course_name")
            .and_then(Value::as_str)
            .map(sanitize_lms_text)
            .filter(|value| !value.is_empty()),
        name: sanitize_lms_text(value.get("name")?.as_str()?),
        url: safe_lms_url(value.get("url")?.as_str()?)?,
        due_text: value
            .get("due_text")
            .and_then(Value::as_str)
            .map(sanitize_lms_text)
            .filter(|value| !value.is_empty()),
        status_text: value
            .get("status_text")
            .and_then(Value::as_str)
            .map(sanitize_lms_text)
            .filter(|value| !value.is_empty()),
        due_date: value
            .get("due_date")
            .and_then(Value::as_str)
            .map(sanitize_lms_text)
            .filter(|value| !value.is_empty()),
    })
}

fn call_lms_bridge(input: Value) -> Result<Value, LmsCommandError> {
    let bridge_path = lms_bridge_path().ok_or_else(|| {
        LmsCommandError::new(
            LmsDashboardErrorCode::BridgeUnavailable,
            "LMS Hs-MCP 브리지 파일을 찾지 못했습니다.",
        )
    })?;
    let python = std::env::var("HS_HUB_LMS_PYTHON")
        .or_else(|_| std::env::var("HS_HUB_STUDY_SPACE_PYTHON"))
        .unwrap_or_else(|_| "python3".to_string());
    let mut command = Command::new(python);
    command
        .arg(&bridge_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONDONTWRITEBYTECODE", "1");
    if let Some(python_path) = lms_python_path(&bridge_path) {
        let paths = std::env::var_os("PYTHONPATH")
            .map(|existing| {
                let mut paths = std::env::split_paths(&existing).collect::<Vec<_>>();
                paths.insert(0, python_path.clone());
                paths
            })
            .unwrap_or_else(|| vec![python_path]);
        if let Ok(joined) = std::env::join_paths(paths) {
            command.env("PYTHONPATH", joined);
        }
    }

    let mut child = command.spawn().map_err(|error| {
        LmsCommandError::with_details(
            LmsDashboardErrorCode::BridgeUnavailable,
            "LMS Hs-MCP 브리지를 실행하지 못했습니다.",
            error.to_string(),
        )
    })?;
    if let Some(stdin) = child.stdin.as_mut() {
        let payload = serde_json::to_vec(&input).map_err(|error| {
            LmsCommandError::with_details(
                LmsDashboardErrorCode::ParseError,
                "LMS 요청을 직렬화하지 못했습니다.",
                error.to_string(),
            )
        })?;
        stdin.write_all(&payload).map_err(|error| {
            LmsCommandError::with_details(
                LmsDashboardErrorCode::BridgeUnavailable,
                "LMS 브리지에 요청을 전달하지 못했습니다.",
                error.to_string(),
            )
        })?;
    }

    let output = wait_with_timeout(child, LMS_BRIDGE_TIMEOUT)?;
    if output.stdout.len() > MAX_BRIDGE_STDOUT_BYTES {
        return Err(LmsCommandError::new(
            LmsDashboardErrorCode::ParseError,
            "LMS 브리지 응답이 허용된 크기를 초과했습니다.",
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let response: Value = serde_json::from_str(stdout.trim()).map_err(|error| {
        LmsCommandError::with_details(
            LmsDashboardErrorCode::ParseError,
            "LMS 브리지 응답 형식이 올바르지 않습니다.",
            format!("{error} {}", String::from_utf8_lossy(&output.stderr)),
        )
    })?;
    if output.status.success() {
        Ok(response)
    } else {
        Err(bridge_response_error(&response))
    }
}

fn wait_with_timeout(
    mut child: std::process::Child,
    timeout: Duration,
) -> Result<std::process::Output, LmsCommandError> {
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child.wait_with_output().map_err(|error| {
                    LmsCommandError::with_details(
                        LmsDashboardErrorCode::BridgeUnavailable,
                        "LMS 브리지 응답을 읽지 못했습니다.",
                        error.to_string(),
                    )
                });
            }
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(LmsCommandError::new(
                    LmsDashboardErrorCode::BridgeTimeout,
                    "LMS 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
                ));
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(error) => {
                return Err(LmsCommandError::with_details(
                    LmsDashboardErrorCode::BridgeUnavailable,
                    "LMS 브리지 상태를 확인하지 못했습니다.",
                    error.to_string(),
                ))
            }
        }
    }
}

fn lms_bridge_path() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("HS_HUB_LMS_BRIDGE") {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    first_existing_path(lms_resource_candidates("lms-hs-mcp-bridge.py"))
}

fn lms_python_path(bridge_path: &Path) -> Option<PathBuf> {
    if let Ok(path) = std::env::var("HS_HUB_LMS_PYTHONPATH") {
        let candidate = PathBuf::from(path);
        if candidate.join("hs_mcp").is_dir() {
            return Some(candidate);
        }
    }
    let mut candidates = lms_resource_candidates("study-space-python");
    if let Some(parent) = bridge_path.parent() {
        candidates.insert(0, parent.join("study-space-python"));
    }
    candidates
        .into_iter()
        .find(|path| path.join("hs_mcp").is_dir())
}

fn lms_resource_candidates(resource_name: &str) -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("src-tauri/resources").join(resource_name),
        PathBuf::from("resources").join(resource_name),
    ];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join(resource_name));
            candidates.push(parent.join("resources").join(resource_name));
            candidates.push(parent.join("..").join("Resources").join(resource_name));
        }
    }
    candidates
}

fn first_existing_path(candidates: Vec<PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|path| path.exists())
}

fn bridge_response_error(response: &Value) -> LmsCommandError {
    let error = response.get("error").unwrap_or(response);
    let code = error
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or("UNKNOWN_ERROR");
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("LMS 브리지 오류가 발생했습니다.");
    if code == "BRIDGE_UNAVAILABLE" {
        return LmsCommandError::with_details(
            LmsDashboardErrorCode::BridgeUnavailable,
            "LMS 실행 환경을 찾지 못했습니다. hs-mcp 패키지 설치 또는 앱 번들 구성을 확인하세요.",
            message,
        );
    }
    map_lms_error(Some(code), message)
}

pub fn map_lms_error(raw_code: Option<&str>, raw_message: &str) -> LmsCommandError {
    let code = match raw_code
        .unwrap_or_default()
        .trim()
        .to_ascii_uppercase()
        .as_str()
    {
        "AUTH_REQUIRED" | "LOGIN_REQUIRED" => LmsDashboardErrorCode::AuthRequired,
        "AUTH_FAILED" => LmsDashboardErrorCode::AuthFailed,
        "KEYCHAIN_UNAVAILABLE" => LmsDashboardErrorCode::KeychainUnavailable,
        "BRIDGE_UNAVAILABLE" => LmsDashboardErrorCode::BridgeUnavailable,
        "BRIDGE_TIMEOUT" => LmsDashboardErrorCode::BridgeTimeout,
        "NETWORK_ERROR" => LmsDashboardErrorCode::NetworkError,
        "PARSE_ERROR" => LmsDashboardErrorCode::ParseError,
        "UNSAFE_URL" => LmsDashboardErrorCode::UnsafeUrl,
        _ => LmsDashboardErrorCode::UnknownError,
    };
    LmsCommandError::with_details(code.clone(), korean_error_message(&code), raw_message)
}

fn korean_error_message(code: &LmsDashboardErrorCode) -> &'static str {
    match code {
        LmsDashboardErrorCode::AuthRequired => "한성 e-class 로그인이 필요합니다.",
        LmsDashboardErrorCode::AuthFailed => "한성 e-class 인증에 실패했습니다.",
        LmsDashboardErrorCode::KeychainUnavailable => "보안 저장소를 사용할 수 없습니다.",
        LmsDashboardErrorCode::BridgeUnavailable => "LMS 실행 환경을 찾지 못했습니다.",
        LmsDashboardErrorCode::BridgeTimeout => "LMS 응답 시간이 초과되었습니다.",
        LmsDashboardErrorCode::NetworkError => "한성 e-class에 연결할 수 없습니다.",
        LmsDashboardErrorCode::ParseError => "LMS 응답을 처리할 수 없습니다.",
        LmsDashboardErrorCode::UnsafeUrl => "안전하지 않은 LMS 링크가 차단되었습니다.",
        LmsDashboardErrorCode::UnknownError => "알 수 없는 LMS 오류가 발생했습니다.",
    }
}

fn credential_state_for_error(code: &LmsDashboardErrorCode) -> LmsCredentialState {
    match code {
        LmsDashboardErrorCode::AuthRequired => LmsCredentialState::Missing,
        LmsDashboardErrorCode::AuthFailed => LmsCredentialState::AuthFailed,
        LmsDashboardErrorCode::KeychainUnavailable => LmsCredentialState::KeychainUnavailable,
        _ => LmsCredentialState::Missing,
    }
}

pub fn sanitize_lms_text(input: &str) -> String {
    let mut sanitized = input.to_string();
    for token in input.split_whitespace() {
        let core = token.trim_matches(|ch: char| "\"'`()[]{}.,;".contains(ch));
        if is_absolute_path(core) {
            sanitized = sanitized.replace(core, PATH_REDACTION);
        }
        if is_token_like(core) || is_sensitive_assignment(core) {
            sanitized = sanitized.replace(core, TOKEN_REDACTION);
        }
        if is_student_id_like(core) {
            sanitized = sanitized.replace(core, STUDENT_ID_REDACTION);
        }
    }
    collapse_whitespace(&sanitized)
}

fn safe_lms_url(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed == LMS_ALLOWED_ORIGIN || trimmed.starts_with(&format!("{LMS_ALLOWED_ORIGIN}/")) {
        Some(sanitize_lms_text(trimmed))
    } else {
        None
    }
}

fn is_absolute_path(value: &str) -> bool {
    (value.starts_with('/') && value.split('/').filter(|part| !part.is_empty()).count() >= 2)
        || is_windows_absolute_path(value)
}

fn is_windows_absolute_path(value: &str) -> bool {
    let mut chars = value.chars();
    matches!((chars.next(), chars.next(), chars.next()), (Some(letter), Some(':'), Some('\\')) if letter.is_ascii_alphabetic())
}

fn is_token_like(value: &str) -> bool {
    [
        "ghp_",
        "gho_",
        "ghr_",
        "ghs_",
        "ghu_",
        "github_pat_",
        "sk-",
        "xoxa-",
        "xoxb-",
        "xoxp-",
        "xoxr-",
        "xoxs-",
        "session=",
        "cookie=",
    ]
    .iter()
    .any(|prefix| value.starts_with(prefix))
}

fn is_sensitive_assignment(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "password=",
        "passwd=",
        "token=",
        "secret=",
        "authorization=",
        "cookie=",
        "session=",
    ]
    .iter()
    .any(|prefix| lower.starts_with(prefix))
}

fn is_student_id_like(value: &str) -> bool {
    let digits = value.chars().filter(|ch| ch.is_ascii_digit()).count();
    (7..=12).contains(&digits) && value.chars().all(|ch| ch.is_ascii_digit() || ch == '-')
}

fn collapse_whitespace(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_result_serializes_read_only_shape_without_secrets() {
        let status = LmsStatus {
            credential_state: LmsCredentialState::Ready,
            credential_message: "한성 e-class 세션이 준비되었습니다. (22***99)".to_string(),
            read_only: true,
            session_clear_available: true,
            student_id_masked: Some("22***99".to_string()),
        };
        let serialized = serde_json::to_string(&LmsCommandResult::ok(status)).unwrap();
        assert!(serialized.contains("\"read_only\":true"));
        assert!(!serialized.contains("password"));
        assert!(!serialized.contains("cookie"));
        assert!(!serialized.contains("session="));
    }

    #[test]
    fn overview_mapping_caps_payload_and_blocks_non_lms_urls() {
        let courses = (0..25)
            .map(|idx| json!({ "course_id": idx.to_string(), "name": format!("강좌 {idx}"), "url": format!("https://learn.hansung.ac.kr/course/view.php?id={idx}") }))
            .collect::<Vec<_>>();
        let mut assignments = (0..70)
            .map(|idx| json!({ "assignment_id": idx.to_string(), "course_id": "1", "course_name": "강좌", "name": format!("과제 {idx}"), "url": format!("https://learn.hansung.ac.kr/mod/assign/view.php?id={idx}"), "due_text": "2026-05-26" }))
            .collect::<Vec<_>>();
        assignments.push(json!({ "assignment_id": "external", "course_id": "1", "name": "외부", "url": "https://example.com/steal" }));
        let overview = overview_from_bridge(
            &json!({ "ok": true, "courses": courses, "assignments": assignments }),
        );
        assert_eq!(overview.courses.len(), MAX_COURSES);
        assert_eq!(overview.assignments.len(), MAX_ASSIGNMENTS);
        assert_eq!(overview.summary.course_count, 25);
        assert_eq!(overview.summary.assignment_count, 71);
        assert!(overview
            .assignments
            .iter()
            .all(|assignment| assignment.url.starts_with(LMS_ALLOWED_ORIGIN)));
    }

    #[test]
    fn redaction_removes_paths_tokens_passwords_sessions_and_student_ids() {
        let input =
            "failed /Users/demo/raw.html password=secret session=abc token=sk-fixture 2299999";
        let output = sanitize_lms_text(input);
        assert!(output.contains(PATH_REDACTION));
        assert!(output.contains(TOKEN_REDACTION));
        assert!(output.contains(STUDENT_ID_REDACTION));
        assert!(!output.contains("secret"));
        assert!(!output.contains("abc"));
        assert!(!output.contains("2299999"));
    }

    #[test]
    fn raw_lms_errors_map_to_korean_safe_messages() {
        let raw = "login failed for /Users/demo/raw.json password=fixture-secret student 2299999";
        let error = map_lms_error(Some("AUTH_FAILED"), raw);
        assert_eq!(error.code, LmsDashboardErrorCode::AuthFailed);
        assert_eq!(error.message, "한성 e-class 인증에 실패했습니다.");
        let details = error.safe_details.unwrap();
        assert!(details.contains(PATH_REDACTION));
        assert!(!details.contains("fixture-secret"));
        assert!(!details.contains("2299999"));
    }
}
