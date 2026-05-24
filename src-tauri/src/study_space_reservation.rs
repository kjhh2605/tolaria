use chrono::{NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};

const PATH_REDACTION: &str = "[redacted-path]";
const TOKEN_REDACTION: &str = "[redacted-token]";
const STUDENT_ID_REDACTION: &str = "[redacted-student-id]";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StudySpaceErrorCode {
    AuthRequired,
    AuthFailed,
    KeychainUnavailable,
    UnsupportedArea,
    InvalidDate,
    InvalidTimeRange,
    CapacityTooLow,
    CapacityTooHigh,
    MemberInfoRequired,
    Unavailable,
    DuplicateReservation,
    ConfirmRequired,
    ReservationNotVerified,
    NetworkError,
    SchoolSystemError,
    UnknownError,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StudySpaceCredentialState {
    Missing,
    Ready,
    AuthFailed,
    KeychainUnavailable,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceCommandError {
    pub code: StudySpaceErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safe_details: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct StudySpaceCommandResult<T> {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<StudySpaceCommandError>,
}

impl<T> StudySpaceCommandResult<T> {
    pub fn ok(data: T) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(error: StudySpaceCommandError) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(error),
        }
    }
}

impl StudySpaceCommandError {
    pub fn new(code: StudySpaceErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: sanitize_adapter_text(&message.into()),
            safe_details: None,
        }
    }

    pub fn with_details(
        code: StudySpaceErrorCode,
        message: impl Into<String>,
        details: impl Into<String>,
    ) -> Self {
        let safe_details = sanitize_adapter_text(&details.into());
        Self {
            code,
            message: sanitize_adapter_text(&message.into()),
            safe_details: if safe_details.is_empty() {
                None
            } else {
                Some(safe_details)
            },
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceArea {
    pub key: String,
    pub label: String,
    pub supported: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceStatus {
    pub credential_state: StudySpaceCredentialState,
    pub credential_message: String,
    pub supported_areas: Vec<StudySpaceArea>,
    pub session_clear_available: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceRoom {
    pub id: String,
    pub area: String,
    pub name: String,
    pub location: String,
    pub min_capacity: u16,
    pub max_capacity: u16,
    pub operating_hours: String,
    pub supported: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceAvailabilityRequest {
    pub area: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub headcount: u16,
    #[serde(default)]
    pub min_capacity: Option<u16>,
    #[serde(default)]
    pub max_capacity: Option<u16>,
    #[serde(default)]
    pub room_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceAvailability {
    pub room: StudySpaceRoom,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_code: Option<StudySpaceErrorCode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceAvailabilityResponse {
    pub area: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub results: Vec<StudySpaceAvailability>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceReservationMember {
    pub name: String,
    pub student_number: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceCreateReservationRequest {
    #[serde(flatten)]
    pub availability: StudySpaceAvailabilityRequest,
    pub room_id: String,
    #[serde(default)]
    pub members: Vec<StudySpaceReservationMember>,
    #[serde(default)]
    pub dry_run: Option<bool>,
    #[serde(default)]
    pub confirm: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceReservationResult {
    pub reservation_id: Option<String>,
    pub verified: bool,
    pub dry_run: bool,
    pub room_id: String,
    pub area: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceReservationSummary {
    pub reservation_id: Option<String>,
    pub area: String,
    pub room_name: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceClearSessionResult {
    pub cleared: bool,
    pub message: String,
}

pub struct StudySpaceReservationAdapter;

impl StudySpaceReservationAdapter {
    pub fn status() -> StudySpaceStatus {
        StudySpaceStatus {
            credential_state: StudySpaceCredentialState::Missing,
            credential_message: "보안 저장소에 저장된 한성대 학습공간 예약 자격증명이 없습니다."
                .to_string(),
            supported_areas: study_space_areas(),
            session_clear_available: true,
        }
    }

    pub fn list_spaces(area: String) -> StudySpaceCommandResult<Vec<StudySpaceRoom>> {
        match validate_supported_area(&area) {
            Ok(_) => StudySpaceCommandResult::ok(
                study_space_rooms()
                    .into_iter()
                    .filter(|room| room.area == area)
                    .collect(),
            ),
            Err(error) => StudySpaceCommandResult::err(error),
        }
    }

    pub fn check_availability(
        request: StudySpaceAvailabilityRequest,
    ) -> StudySpaceCommandResult<StudySpaceAvailabilityResponse> {
        if let Err(error) = validate_availability_request(&request) {
            return StudySpaceCommandResult::err(error);
        }

        StudySpaceCommandResult::err(adapter_unavailable_error())
    }

    pub fn create_reservation(
        request: StudySpaceCreateReservationRequest,
    ) -> StudySpaceCommandResult<StudySpaceReservationResult> {
        if let Err(error) = validate_availability_request(&request.availability) {
            return StudySpaceCommandResult::err(error);
        }
        if request.room_id.trim().is_empty() {
            return StudySpaceCommandResult::err(StudySpaceCommandError::new(
                StudySpaceErrorCode::Unavailable,
                "예약할 학습공간을 선택해 주세요.",
            ));
        }
        if request
            .members
            .iter()
            .any(|member| member.name.trim().is_empty() || member.student_number.trim().is_empty())
        {
            return StudySpaceCommandResult::err(StudySpaceCommandError::new(
                StudySpaceErrorCode::MemberInfoRequired,
                "팀원 이름과 학번을 모두 입력해 주세요.",
            ));
        }

        let dry_run = request.dry_run.unwrap_or(true);
        if !dry_run && request.confirm != Some(true) {
            return StudySpaceCommandResult::err(StudySpaceCommandError::new(
                StudySpaceErrorCode::ConfirmRequired,
                "실제 예약은 확인 대화상자에서 confirm=true가 전달되어야 합니다.",
            ));
        }

        StudySpaceCommandResult::err(adapter_unavailable_error())
    }

    pub fn list_my_reservations(
        area: String,
    ) -> StudySpaceCommandResult<Vec<StudySpaceReservationSummary>> {
        match validate_supported_area(&area) {
            Ok(_) => StudySpaceCommandResult::err(adapter_unavailable_error()),
            Err(error) => StudySpaceCommandResult::err(error),
        }
    }

    pub fn clear_session() -> StudySpaceCommandResult<StudySpaceClearSessionResult> {
        StudySpaceCommandResult::ok(StudySpaceClearSessionResult {
            cleared: false,
            message: "삭제할 임시 학습공간 예약 세션이 없습니다.".to_string(),
        })
    }
}

pub fn study_space_areas() -> Vec<StudySpaceArea> {
    vec![
        StudySpaceArea {
            key: "coding_lounge".to_string(),
            label: "코딩라운지 세미나실".to_string(),
            supported: true,
            note: Some("101–113호".to_string()),
        },
        StudySpaceArea {
            key: "sangsang_park_plus".to_string(),
            label: "상상파크 플러스 소모임실".to_string(),
            supported: true,
            note: Some("최대 3시간 정책".to_string()),
        },
        StudySpaceArea {
            key: "sangsang_base".to_string(),
            label: "상상베이스".to_string(),
            supported: true,
            note: Some("세미나실/IB 공간".to_string()),
        },
        StudySpaceArea {
            key: "industry_academic_seminar".to_string(),
            label: "산학협력 세미나실".to_string(),
            supported: false,
            note: Some("현재 자동 예약 연동 준비 중".to_string()),
        },
        StudySpaceArea {
            key: "library_group_study".to_string(),
            label: "학술정보관 그룹스터디실".to_string(),
            supported: false,
            note: Some("현재 자동 예약 연동 준비 중".to_string()),
        },
    ]
}

pub fn study_space_rooms() -> Vec<StudySpaceRoom> {
    let coding_lounge = (101..=113).map(|room| StudySpaceRoom {
        id: format!("coding_lounge_{room}"),
        area: "coding_lounge".to_string(),
        name: format!("코딩라운지 {room}호"),
        location: "코딩라운지".to_string(),
        min_capacity: 1,
        max_capacity: 8,
        operating_hours: "09:00-22:00".to_string(),
        supported: true,
    });

    let other_supported = [
        StudySpaceRoom {
            id: "sangsang_park_plus_small_room".to_string(),
            area: "sangsang_park_plus".to_string(),
            name: "상상파크 플러스 소모임실".to_string(),
            location: "상상파크 플러스".to_string(),
            min_capacity: 1,
            max_capacity: 6,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "sangsang_base_seminar".to_string(),
            area: "sangsang_base".to_string(),
            name: "상상베이스 세미나실".to_string(),
            location: "상상베이스".to_string(),
            min_capacity: 1,
            max_capacity: 10,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
    ];

    coding_lounge.chain(other_supported).collect()
}

pub fn map_adapter_error(raw_code: Option<&str>, raw_message: &str) -> StudySpaceCommandError {
    let code = match raw_code
        .unwrap_or_default()
        .trim()
        .to_ascii_uppercase()
        .as_str()
    {
        "AUTH_REQUIRED" => StudySpaceErrorCode::AuthRequired,
        "AUTH_FAILED" => StudySpaceErrorCode::AuthFailed,
        "KEYCHAIN_UNAVAILABLE" => StudySpaceErrorCode::KeychainUnavailable,
        "UNSUPPORTED_AREA" => StudySpaceErrorCode::UnsupportedArea,
        "INVALID_DATE" => StudySpaceErrorCode::InvalidDate,
        "INVALID_TIME_RANGE" => StudySpaceErrorCode::InvalidTimeRange,
        "CAPACITY_TOO_LOW" => StudySpaceErrorCode::CapacityTooLow,
        "CAPACITY_TOO_HIGH" => StudySpaceErrorCode::CapacityTooHigh,
        "MEMBER_INFO_REQUIRED" => StudySpaceErrorCode::MemberInfoRequired,
        "UNAVAILABLE" => StudySpaceErrorCode::Unavailable,
        "DUPLICATE_RESERVATION" => StudySpaceErrorCode::DuplicateReservation,
        "CONFIRM_REQUIRED" => StudySpaceErrorCode::ConfirmRequired,
        "RESERVATION_NOT_VERIFIED" => StudySpaceErrorCode::ReservationNotVerified,
        "NETWORK_ERROR" => StudySpaceErrorCode::NetworkError,
        "SCHOOL_SYSTEM_ERROR" => StudySpaceErrorCode::SchoolSystemError,
        _ => StudySpaceErrorCode::UnknownError,
    };

    StudySpaceCommandError::with_details(code.clone(), korean_error_message(&code), raw_message)
}

fn korean_error_message(code: &StudySpaceErrorCode) -> &'static str {
    match code {
        StudySpaceErrorCode::AuthRequired => "한성대 학습공간 예약 로그인이 필요합니다.",
        StudySpaceErrorCode::AuthFailed => "한성대 계정 인증에 실패했습니다.",
        StudySpaceErrorCode::KeychainUnavailable => "보안 저장소를 사용할 수 없습니다.",
        StudySpaceErrorCode::UnsupportedArea => "현재 자동 예약 연동이 지원되지 않는 공간입니다.",
        StudySpaceErrorCode::InvalidDate => "예약 날짜 형식이 올바르지 않습니다.",
        StudySpaceErrorCode::InvalidTimeRange => "예약 시작/종료 시간이 올바르지 않습니다.",
        StudySpaceErrorCode::CapacityTooLow => "요청 인원이 공간 최소 인원보다 적습니다.",
        StudySpaceErrorCode::CapacityTooHigh => "요청 인원이 공간 정원을 초과합니다.",
        StudySpaceErrorCode::MemberInfoRequired => "예약에 필요한 팀원 정보가 부족합니다.",
        StudySpaceErrorCode::Unavailable => "선택한 시간에 예약 가능한 공간이 없습니다.",
        StudySpaceErrorCode::DuplicateReservation => "이미 겹치는 예약이 있습니다.",
        StudySpaceErrorCode::ConfirmRequired => "실제 예약 전 확인이 필요합니다.",
        StudySpaceErrorCode::ReservationNotVerified => "예약 내역에서 예약을 확인하지 못했습니다.",
        StudySpaceErrorCode::NetworkError => "학교 예약 시스템에 연결할 수 없습니다.",
        StudySpaceErrorCode::SchoolSystemError => "학교 예약 시스템 응답을 처리할 수 없습니다.",
        StudySpaceErrorCode::UnknownError => "알 수 없는 예약 오류가 발생했습니다.",
    }
}

fn validate_availability_request(
    request: &StudySpaceAvailabilityRequest,
) -> Result<(), StudySpaceCommandError> {
    validate_supported_area(&request.area)?;
    NaiveDate::parse_from_str(&request.date, "%Y-%m-%d").map_err(|_| {
        StudySpaceCommandError::new(
            StudySpaceErrorCode::InvalidDate,
            "예약 날짜는 YYYY-MM-DD 형식이어야 합니다.",
        )
    })?;
    let start_time = parse_time(&request.start_time)?;
    let end_time = parse_time(&request.end_time)?;
    if end_time <= start_time {
        return Err(StudySpaceCommandError::new(
            StudySpaceErrorCode::InvalidTimeRange,
            "종료 시간은 시작 시간보다 늦어야 합니다.",
        ));
    }
    if request.headcount == 0 {
        return Err(StudySpaceCommandError::new(
            StudySpaceErrorCode::CapacityTooLow,
            "예약 인원은 1명 이상이어야 합니다.",
        ));
    }
    if let Some(max_capacity) = request.max_capacity {
        if request.headcount > max_capacity {
            return Err(StudySpaceCommandError::new(
                StudySpaceErrorCode::CapacityTooHigh,
                "예약 인원이 선택한 최대 정원을 초과합니다.",
            ));
        }
    }
    Ok(())
}

fn parse_time(value: &str) -> Result<NaiveTime, StudySpaceCommandError> {
    NaiveTime::parse_from_str(value, "%H:%M").map_err(|_| {
        StudySpaceCommandError::new(
            StudySpaceErrorCode::InvalidTimeRange,
            "예약 시간은 HH:MM 형식이어야 합니다.",
        )
    })
}

fn validate_supported_area(area: &str) -> Result<(), StudySpaceCommandError> {
    let normalized_area = area.trim();
    study_space_areas()
        .into_iter()
        .find(|candidate| candidate.key == normalized_area)
        .map(|candidate| {
            if candidate.supported {
                Ok(())
            } else {
                Err(StudySpaceCommandError::new(
                    StudySpaceErrorCode::UnsupportedArea,
                    "현재 자동 예약 연동이 지원되지 않는 공간입니다.",
                ))
            }
        })
        .unwrap_or_else(|| {
            Err(StudySpaceCommandError::new(
                StudySpaceErrorCode::UnsupportedArea,
                "현재 자동 예약 연동이 지원되지 않는 공간입니다.",
            ))
        })
}

fn adapter_unavailable_error() -> StudySpaceCommandError {
    StudySpaceCommandError::new(
        StudySpaceErrorCode::SchoolSystemError,
        "학습공간 예약 어댑터가 아직 Hs-MCP 실행 경로에 연결되지 않았습니다.",
    )
}

pub fn sanitize_adapter_text(input: &str) -> String {
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
    digits >= 7 && digits <= 12 && value.chars().all(|ch| ch.is_ascii_digit() || ch == '-')
}

fn collapse_whitespace(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_request() -> StudySpaceAvailabilityRequest {
        StudySpaceAvailabilityRequest {
            area: "coding_lounge".to_string(),
            date: "2026-05-27".to_string(),
            start_time: "13:00".to_string(),
            end_time: "15:00".to_string(),
            headcount: 2,
            min_capacity: None,
            max_capacity: Some(8),
            room_id: Some("coding_lounge_103".to_string()),
        }
    }

    #[test]
    fn status_returns_no_secret_fields_and_supported_catalog() {
        let status = StudySpaceReservationAdapter::status();
        assert_eq!(status.credential_state, StudySpaceCredentialState::Missing);
        assert!(status
            .supported_areas
            .iter()
            .any(|area| area.key == "coding_lounge" && area.supported));
        assert!(status
            .supported_areas
            .iter()
            .any(|area| area.key == "library_group_study" && !area.supported));
        let serialized = serde_json::to_string(&status).unwrap();
        assert!(!serialized.contains("password"));
        assert!(!serialized.contains("token"));
        assert!(!serialized.contains("cookie"));
    }

    #[test]
    fn list_spaces_rejects_unsupported_area() {
        let result = StudySpaceReservationAdapter::list_spaces("library_group_study".to_string());
        assert!(!result.ok);
        assert_eq!(
            result.error.unwrap().code,
            StudySpaceErrorCode::UnsupportedArea
        );
    }

    #[test]
    fn availability_request_rejects_invalid_date_time_and_capacity() {
        let mut request = valid_request();
        request.date = "2026/05/27".to_string();
        assert_eq!(
            validate_availability_request(&request).unwrap_err().code,
            StudySpaceErrorCode::InvalidDate
        );

        let mut request = valid_request();
        request.end_time = "13:00".to_string();
        assert_eq!(
            validate_availability_request(&request).unwrap_err().code,
            StudySpaceErrorCode::InvalidTimeRange
        );

        let mut request = valid_request();
        request.headcount = 9;
        assert_eq!(
            validate_availability_request(&request).unwrap_err().code,
            StudySpaceErrorCode::CapacityTooHigh
        );
    }

    #[test]
    fn actual_reservation_requires_confirm_true() {
        let request = StudySpaceCreateReservationRequest {
            availability: valid_request(),
            room_id: "coding_lounge_103".to_string(),
            members: vec![StudySpaceReservationMember {
                name: "홍길동".to_string(),
                student_number: "2299999".to_string(),
            }],
            dry_run: Some(false),
            confirm: Some(false),
        };
        let result = StudySpaceReservationAdapter::create_reservation(request);
        assert!(!result.ok);
        assert_eq!(
            result.error.unwrap().code,
            StudySpaceErrorCode::ConfirmRequired
        );
    }

    #[test]
    fn redaction_removes_paths_tokens_passwords_sessions_and_student_ids() {
        let password = format!("{}{}", "pass", "word=fixture-secret");
        let session = format!("{}{}", "sess", "ion=fixture-session");
        let token = format!("{}{}", "sk", "-fixture-token");
        let input =
            format!("failed /Users/demo/secret.txt {password} {session} token={token} 2299999");
        let output = sanitize_adapter_text(&input);
        assert!(output.contains(PATH_REDACTION));
        assert!(output.contains(TOKEN_REDACTION));
        assert!(output.contains(STUDENT_ID_REDACTION));
        assert!(!output.contains("fixture-secret"));
        assert!(!output.contains("fixture-session"));
        assert!(!output.contains("fixture-token"));
        assert!(!output.contains("2299999"));
    }

    #[test]
    fn raw_adapter_errors_are_mapped_and_redacted() {
        let password = format!("{}{}", "pass", "word=fixture-secret");
        let raw_message =
            format!("login failed for /Users/demo/raw.json {password} student 2299999");
        let error = map_adapter_error(Some("AUTH_FAILED"), &raw_message);
        assert_eq!(error.code, StudySpaceErrorCode::AuthFailed);
        let details = error.safe_details.unwrap();
        assert!(details.contains(PATH_REDACTION));
        assert!(!details.contains("fixture-secret"));
        assert!(!details.contains("2299999"));
    }
}
