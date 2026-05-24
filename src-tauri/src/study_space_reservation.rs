use chrono::{NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

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
pub struct StudySpaceCredentialLoginRequest {
    pub student_id: String,
    pub password: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceCredentialLoginResult {
    pub credential_state: StudySpaceCredentialState,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub student_id_masked: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
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
        match call_hs_mcp_bridge(json!({ "op": "status" })) {
            Ok(response) if response.get("ok").and_then(Value::as_bool) == Some(true) => {
                let logged_in = response
                    .get("logged_in")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                StudySpaceStatus {
                    credential_state: if logged_in {
                        StudySpaceCredentialState::Ready
                    } else {
                        StudySpaceCredentialState::Missing
                    },
                    credential_message: if logged_in {
                        let masked = response
                            .get("student_id_masked")
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        if masked.is_empty() {
                            "한성대 학습공간 예약 세션이 보안 저장소에 저장되어 있습니다."
                                .to_string()
                        } else {
                            format!("한성대 학습공간 예약 세션이 준비되었습니다. ({masked})")
                        }
                    } else {
                        "보안 저장소에 저장된 한성대 학습공간 예약 세션이 없습니다.".to_string()
                    },
                    supported_areas: study_space_areas(),
                    session_clear_available: true,
                }
            }
            Ok(response) => {
                let error = bridge_response_error(&response);
                StudySpaceStatus {
                    credential_state: credential_state_for_error(&error.code),
                    credential_message: error.message,
                    supported_areas: study_space_areas(),
                    session_clear_available: true,
                }
            }
            Err(error) => StudySpaceStatus {
                credential_state: credential_state_for_error(&error.code),
                credential_message: error.message,
                supported_areas: study_space_areas(),
                session_clear_available: true,
            },
        }
    }

    pub fn save_credentials(
        request: StudySpaceCredentialLoginRequest,
    ) -> StudySpaceCommandResult<StudySpaceCredentialLoginResult> {
        if request.student_id.trim().is_empty() || request.password.is_empty() {
            return StudySpaceCommandResult::err(StudySpaceCommandError::new(
                StudySpaceErrorCode::AuthRequired,
                "학번과 비밀번호를 입력해 주세요.",
            ));
        }
        match call_hs_mcp_bridge(json!({
            "op": "login",
            "student_id": request.student_id,
            "password": request.password,
        })) {
            Ok(response) if response.get("ok").and_then(Value::as_bool) == Some(true) => {
                StudySpaceCommandResult::ok(StudySpaceCredentialLoginResult {
                    credential_state: StudySpaceCredentialState::Ready,
                    message: response
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("로그인 성공. 비밀번호는 저장하지 않았고 세션 쿠키만 OS 보안 저장소에 저장했습니다.")
                        .to_string(),
                    student_id_masked: response
                        .get("student_id_masked")
                        .and_then(Value::as_str)
                        .map(ToString::to_string),
                    name: response
                        .get("name")
                        .and_then(Value::as_str)
                        .filter(|value| !value.is_empty())
                        .map(ToString::to_string),
                })
            }
            Ok(response) => StudySpaceCommandResult::err(bridge_response_error(&response)),
            Err(error) => StudySpaceCommandResult::err(error),
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

        match call_hs_mcp_bridge(json!({
            "op": "check_availability",
            "area": request.area.clone(),
            "date": request.date.clone(),
            "start_time": request.start_time.clone(),
            "end_time": request.end_time.clone(),
            "space": request.room_id.as_deref().and_then(hs_mcp_space_name_for_room_id),
        })) {
            Ok(response) if response.get("ok").and_then(Value::as_bool) == Some(true) => {
                StudySpaceCommandResult::ok(availability_response_from_bridge(&request, &response))
            }
            Ok(response) => StudySpaceCommandResult::err(bridge_response_error(&response)),
            Err(error) => StudySpaceCommandResult::err(error),
        }
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

        let Some(space_name) = hs_mcp_space_name_for_room_id(&request.room_id) else {
            return StudySpaceCommandResult::err(StudySpaceCommandError::new(
                StudySpaceErrorCode::Unavailable,
                "예약할 학습공간을 찾지 못했습니다.",
            ));
        };

        match call_hs_mcp_bridge(json!({
            "op": "create_reservation",
            "area": request.availability.area.clone(),
            "space": space_name,
            "date": request.availability.date.clone(),
            "start_time": request.availability.start_time.clone(),
            "end_time": request.availability.end_time.clone(),
            "dry_run": dry_run,
            "confirm": request.confirm.unwrap_or(false),
            "members": request.members.clone(),
        })) {
            Ok(response) if response.get("ok").and_then(Value::as_bool) == Some(true) => {
                StudySpaceCommandResult::ok(reservation_result_from_bridge(&request, &response))
            }
            Ok(response) => StudySpaceCommandResult::err(bridge_response_error(&response)),
            Err(error) => StudySpaceCommandResult::err(error),
        }
    }

    pub fn list_my_reservations(
        area: String,
    ) -> StudySpaceCommandResult<Vec<StudySpaceReservationSummary>> {
        match validate_supported_area(&area) {
            Ok(_) => match call_hs_mcp_bridge(json!({
                "op": "list_my_reservations",
                "area": area,
            })) {
                Ok(response) if response.get("ok").and_then(Value::as_bool) == Some(true) => {
                    StudySpaceCommandResult::ok(reservation_summaries_from_bridge(&response))
                }
                Ok(response) => StudySpaceCommandResult::err(bridge_response_error(&response)),
                Err(error) => StudySpaceCommandResult::err(error),
            },
            Err(error) => StudySpaceCommandResult::err(error),
        }
    }

    pub fn clear_session() -> StudySpaceCommandResult<StudySpaceClearSessionResult> {
        match call_hs_mcp_bridge(json!({ "op": "clear_session" })) {
            Ok(response) if response.get("ok").and_then(Value::as_bool) == Some(true) => {
                StudySpaceCommandResult::ok(StudySpaceClearSessionResult {
                    cleared: response
                        .get("cleared")
                        .and_then(Value::as_bool)
                        .unwrap_or(true),
                    message: response
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("저장된 학습공간 예약 세션을 삭제했습니다.")
                        .to_string(),
                })
            }
            Ok(response) => StudySpaceCommandResult::err(bridge_response_error(&response)),
            Err(error) => StudySpaceCommandResult::err(error),
        }
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
        max_capacity: if room <= 105 { 12 } else { 8 },
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

fn hs_mcp_space_name_for_room_id(room_id: &str) -> Option<String> {
    let area = if room_id.starts_with("coding_lounge_") {
        "coding_lounge"
    } else if room_id == "sangsang_park_plus_small_room" {
        "sangsang_park_plus"
    } else if room_id == "sangsang_base_seminar" {
        "sangsang_base"
    } else {
        return None;
    };
    study_space_rooms()
        .into_iter()
        .find(|room| room.id == room_id && room.area == area)
        .map(|room| {
            if room.area == "coding_lounge" {
                room.name.replace("코딩라운지", "세미나실")
            } else {
                room.name
            }
        })
}

fn room_from_hs_mcp_space(area: &str, space: &Value) -> Option<StudySpaceRoom> {
    let raw_name = space.get("name").and_then(Value::as_str)?;
    let id = space
        .get("space_id")
        .and_then(Value::as_str)
        .unwrap_or(raw_name);
    let display_name = if area == "coding_lounge" {
        raw_name.replace("세미나실", "코딩라운지")
    } else {
        raw_name.to_string()
    };
    let local_id = if area == "coding_lounge" {
        raw_name
            .chars()
            .filter(|ch| ch.is_ascii_digit())
            .collect::<String>()
            .parse::<u16>()
            .ok()
            .map(|room| format!("coding_lounge_{room}"))
            .unwrap_or_else(|| format!("coding_lounge_{id}"))
    } else if area == "sangsang_park_plus" {
        format!("sangsang_park_plus_{}", id.replace(' ', "_"))
    } else {
        format!("sangsang_base_{}", id.replace(' ', "_"))
    };
    let capacity = space
        .get("capacity")
        .and_then(Value::as_u64)
        .map(|value| value as u16);
    Some(StudySpaceRoom {
        id: local_id,
        area: area.to_string(),
        name: display_name,
        location: area_label(area),
        min_capacity: 1,
        max_capacity: capacity.unwrap_or_else(|| default_max_capacity(area)),
        operating_hours: default_operating_hours(area).to_string(),
        supported: true,
    })
}

fn area_label(area: &str) -> String {
    study_space_areas()
        .into_iter()
        .find(|candidate| candidate.key == area)
        .map(|candidate| candidate.label)
        .unwrap_or_else(|| area.to_string())
}

fn default_max_capacity(area: &str) -> u16 {
    match area {
        "coding_lounge" => 8,
        "sangsang_park_plus" => 6,
        "sangsang_base" => 10,
        _ => 8,
    }
}

fn default_operating_hours(area: &str) -> &'static str {
    match area {
        "coding_lounge" => "09:00-22:00",
        _ => "09:00-21:00",
    }
}

fn availability_response_from_bridge(
    request: &StudySpaceAvailabilityRequest,
    response: &Value,
) -> StudySpaceAvailabilityResponse {
    if let Some(results) = response.get("results").and_then(Value::as_array) {
        let mapped = results
            .iter()
            .filter_map(|item| {
                let space = item.get("space")?;
                let room = room_from_hs_mcp_space(&request.area, space)?;
                let check = item.get("check")?;
                let availability = check.get("availability");
                let available = availability
                    .and_then(|value| value.get("available"))
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let reason = availability
                    .and_then(|value| value.get("message"))
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
                    .or_else(|| {
                        check
                            .get("error")
                            .and_then(|error| error.get("message"))
                            .and_then(Value::as_str)
                            .map(ToString::to_string)
                    });
                Some(StudySpaceAvailability {
                    room,
                    available,
                    reason_code: if available {
                        None
                    } else {
                        Some(StudySpaceErrorCode::Unavailable)
                    },
                    reason,
                })
            })
            .collect();
        return StudySpaceAvailabilityResponse {
            area: request.area.clone(),
            date: request.date.clone(),
            start_time: request.start_time.clone(),
            end_time: request.end_time.clone(),
            results: mapped,
        };
    }

    let room = request
        .room_id
        .as_deref()
        .and_then(|room_id| {
            study_space_rooms()
                .into_iter()
                .find(|room| room.id == room_id)
        })
        .or_else(|| {
            study_space_rooms()
                .into_iter()
                .find(|room| room.area == request.area)
        })
        .unwrap_or_else(|| StudySpaceRoom {
            id: "unknown".to_string(),
            area: request.area.clone(),
            name: "알 수 없는 공간".to_string(),
            location: area_label(&request.area),
            min_capacity: 1,
            max_capacity: default_max_capacity(&request.area),
            operating_hours: default_operating_hours(&request.area).to_string(),
            supported: true,
        });
    let availability = response.get("availability");
    let available = availability
        .and_then(|value| value.get("available"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    StudySpaceAvailabilityResponse {
        area: request.area.clone(),
        date: request.date.clone(),
        start_time: request.start_time.clone(),
        end_time: request.end_time.clone(),
        results: vec![StudySpaceAvailability {
            room,
            available,
            reason_code: if available {
                None
            } else {
                Some(StudySpaceErrorCode::Unavailable)
            },
            reason: availability
                .and_then(|value| value.get("message"))
                .and_then(Value::as_str)
                .map(ToString::to_string),
        }],
    }
}

fn reservation_result_from_bridge(
    request: &StudySpaceCreateReservationRequest,
    response: &Value,
) -> StudySpaceReservationResult {
    let reservation = response.get("reservation");
    StudySpaceReservationResult {
        reservation_id: reservation
            .and_then(|value| value.get("reservation_id"))
            .and_then(Value::as_str)
            .map(ToString::to_string),
        verified: reservation.is_some(),
        dry_run: response
            .get("dry_run")
            .and_then(Value::as_bool)
            .unwrap_or_else(|| request.dry_run.unwrap_or(true)),
        room_id: request.room_id.clone(),
        area: request.availability.area.clone(),
        date: request.availability.date.clone(),
        start_time: request.availability.start_time.clone(),
        end_time: request.availability.end_time.clone(),
    }
}

fn reservation_summaries_from_bridge(response: &Value) -> Vec<StudySpaceReservationSummary> {
    let area = response
        .get("area")
        .and_then(|area| area.get("key"))
        .and_then(Value::as_str)
        .unwrap_or("coding_lounge");
    response
        .get("reservations")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|reservation| {
            let time = reservation
                .get("time")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let (start_time, end_time) = reservation_time_range(time);
            StudySpaceReservationSummary {
                reservation_id: reservation
                    .get("reservation_id")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                area: area.to_string(),
                room_name: reservation
                    .get("space")
                    .and_then(Value::as_str)
                    .unwrap_or("알 수 없는 공간")
                    .replace("세미나실", "코딩라운지"),
                date: reservation
                    .get("date")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                start_time,
                end_time,
            }
        })
        .collect()
}

fn reservation_time_range(time: &str) -> (String, String) {
    let mut slots = time.split(',').filter(|slot| !slot.is_empty());
    let start = slots.next().unwrap_or("").to_string();
    let last = slots.last().unwrap_or(start.as_str());
    let end = NaiveTime::parse_from_str(last, "%H:%M")
        .ok()
        .map(|time| time.overflowing_add_signed(chrono::Duration::hours(1)).0)
        .map(|time| time.format("%H:%M").to_string())
        .unwrap_or_else(|| start.clone());
    (start, end)
}

fn call_hs_mcp_bridge(input: Value) -> Result<Value, StudySpaceCommandError> {
    let bridge_path = hs_mcp_bridge_path().ok_or_else(|| {
        StudySpaceCommandError::new(
            StudySpaceErrorCode::SchoolSystemError,
            "Hs-MCP 브리지 파일을 찾지 못했습니다.",
        )
    })?;
    let python =
        std::env::var("HS_HUB_STUDY_SPACE_PYTHON").unwrap_or_else(|_| "python3".to_string());
    let mut child = Command::new(python)
        .arg(bridge_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            StudySpaceCommandError::with_details(
                StudySpaceErrorCode::SchoolSystemError,
                "Hs-MCP 브리지를 실행하지 못했습니다.",
                error.to_string(),
            )
        })?;
    if let Some(stdin) = child.stdin.as_mut() {
        let payload = serde_json::to_vec(&input).map_err(|error| {
            StudySpaceCommandError::with_details(
                StudySpaceErrorCode::SchoolSystemError,
                "Hs-MCP 요청을 직렬화하지 못했습니다.",
                error.to_string(),
            )
        })?;
        stdin.write_all(&payload).map_err(|error| {
            StudySpaceCommandError::with_details(
                StudySpaceErrorCode::SchoolSystemError,
                "Hs-MCP 브리지에 요청을 전달하지 못했습니다.",
                error.to_string(),
            )
        })?;
    }
    let output = child.wait_with_output().map_err(|error| {
        StudySpaceCommandError::with_details(
            StudySpaceErrorCode::SchoolSystemError,
            "Hs-MCP 브리지 응답을 읽지 못했습니다.",
            error.to_string(),
        )
    })?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let response: Value = serde_json::from_str(stdout.trim()).map_err(|error| {
        StudySpaceCommandError::with_details(
            StudySpaceErrorCode::SchoolSystemError,
            "Hs-MCP 브리지 응답 형식이 올바르지 않습니다.",
            format!("{error} {}", String::from_utf8_lossy(&output.stderr)),
        )
    })?;
    if output.status.success() {
        Ok(response)
    } else {
        Err(bridge_response_error(&response))
    }
}

fn hs_mcp_bridge_path() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("HS_HUB_STUDY_SPACE_BRIDGE") {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    let candidates = [
        PathBuf::from("src-tauri/resources/study-space-hs-mcp-bridge.py"),
        PathBuf::from("resources/study-space-hs-mcp-bridge.py"),
        std::env::current_exe()
            .ok()
            .and_then(|path| {
                path.parent()
                    .map(|parent| parent.join("study-space-hs-mcp-bridge.py"))
            })
            .unwrap_or_default(),
    ];
    candidates.into_iter().find(|path| path.exists())
}

fn bridge_response_error(response: &Value) -> StudySpaceCommandError {
    let error = response.get("error").unwrap_or(response);
    let code = error
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or("UNKNOWN_ERROR");
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("Hs-MCP 브리지 오류가 발생했습니다.");
    if code == "BRIDGE_UNAVAILABLE" {
        return StudySpaceCommandError::with_details(
            StudySpaceErrorCode::SchoolSystemError,
            "Hs-MCP 실행 환경을 찾지 못했습니다. hs-mcp 패키지 설치 또는 앱 번들 구성을 확인하세요.",
            message,
        );
    }
    map_adapter_error(Some(code), message)
}

fn credential_state_for_error(code: &StudySpaceErrorCode) -> StudySpaceCredentialState {
    match code {
        StudySpaceErrorCode::AuthRequired => StudySpaceCredentialState::Missing,
        StudySpaceErrorCode::AuthFailed => StudySpaceCredentialState::AuthFailed,
        StudySpaceErrorCode::KeychainUnavailable => StudySpaceCredentialState::KeychainUnavailable,
        _ => StudySpaceCredentialState::Missing,
    }
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
        assert!(matches!(
            status.credential_state,
            StudySpaceCredentialState::Missing
                | StudySpaceCredentialState::Ready
                | StudySpaceCredentialState::AuthFailed
                | StudySpaceCredentialState::KeychainUnavailable
        ));
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
