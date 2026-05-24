use chrono::{NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};
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
pub struct StudySpaceAvailabilitySlot {
    pub start_time: String,
    pub end_time: String,
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct StudySpaceAvailability {
    pub room: StudySpaceRoom,
    pub available: bool,
    pub slots: Vec<StudySpaceAvailabilitySlot>,
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
pub struct StudySpaceReservationUsageInfo {
    #[serde(default)]
    pub affiliation: Option<String>,
    pub attendee_count: u16,
    #[serde(default)]
    pub purpose: Option<String>,
    #[serde(default)]
    pub all_users: Option<String>,
    #[serde(default)]
    pub companion_users: Option<String>,
    #[serde(default)]
    pub reservation_reason: Option<String>,
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
    pub usage_info: Option<StudySpaceReservationUsageInfo>,
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
        if requires_member_details(&request.availability.area)
            && request.members.iter().any(|member| {
                member.name.trim().is_empty() || member.student_number.trim().is_empty()
            })
        {
            return StudySpaceCommandResult::err(StudySpaceCommandError::new(
                StudySpaceErrorCode::MemberInfoRequired,
                "팀원 이름과 학번을 모두 입력해 주세요.",
            ));
        }
        if let Err(error) = validate_usage_info(
            &request.availability.area,
            &request.room_id,
            request.usage_info.as_ref(),
        ) {
            return StudySpaceCommandResult::err(error);
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
            "usage_info": request.usage_info.clone(),
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
            key: "library_group_study".to_string(),
            label: "학술정보관 그룹스터디실".to_string(),
            supported: true,
            note: Some("그룹스터디실/회의실/코워킹룸".to_string()),
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
            id: "sangsang_park_plus_critical_thinking".to_string(),
            area: "sangsang_park_plus".to_string(),
            name: "소모임실 Critical Thinking".to_string(),
            location: "상상파크 플러스".to_string(),
            min_capacity: 1,
            max_capacity: 6,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "sangsang_park_plus_creativity".to_string(),
            area: "sangsang_park_plus".to_string(),
            name: "소모임실 Creativity".to_string(),
            location: "상상파크 플러스".to_string(),
            min_capacity: 1,
            max_capacity: 6,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "sangsang_park_plus_convergence".to_string(),
            area: "sangsang_park_plus".to_string(),
            name: "소모임실 Convergence".to_string(),
            location: "상상파크 플러스".to_string(),
            min_capacity: 1,
            max_capacity: 6,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "sangsang_park_plus_communication".to_string(),
            area: "sangsang_park_plus".to_string(),
            name: "소모임실 Communication".to_string(),
            location: "상상파크 플러스".to_string(),
            min_capacity: 1,
            max_capacity: 6,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "sangsang_park_plus_collaboration".to_string(),
            area: "sangsang_park_plus".to_string(),
            name: "소모임실 Collaboration".to_string(),
            location: "상상파크 플러스".to_string(),
            min_capacity: 1,
            max_capacity: 6,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "sangsang_park_plus_challenge".to_string(),
            area: "sangsang_park_plus".to_string(),
            name: "소모임실 Challenge".to_string(),
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
        StudySpaceRoom {
            id: "library_meeting_5f_sangsang_commons".to_string(),
            area: "library_group_study".to_string(),
            name: "회의실(5F상상커먼스)".to_string(),
            location: "학술정보관".to_string(),
            min_capacity: 1,
            max_capacity: 12,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "library_coworking_3f_creative_reading".to_string(),
            area: "library_group_study".to_string(),
            name: "코워킹룸(3F창의열람실)".to_string(),
            location: "학술정보관".to_string(),
            min_capacity: 1,
            max_capacity: 12,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "library_group_study_6f".to_string(),
            area: "library_group_study".to_string(),
            name: "그룹스터디실(6F)".to_string(),
            location: "학술정보관".to_string(),
            min_capacity: 1,
            max_capacity: 8,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "library_group_study_5f".to_string(),
            area: "library_group_study".to_string(),
            name: "그룹스터디실(5F)".to_string(),
            location: "학술정보관".to_string(),
            min_capacity: 1,
            max_capacity: 8,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "library_group_study_4f".to_string(),
            area: "library_group_study".to_string(),
            name: "그룹스터디실(4F)".to_string(),
            location: "학술정보관".to_string(),
            min_capacity: 1,
            max_capacity: 8,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "library_group_study_3f_2".to_string(),
            area: "library_group_study".to_string(),
            name: "그룹스터디실(3F-2)".to_string(),
            location: "학술정보관".to_string(),
            min_capacity: 1,
            max_capacity: 8,
            operating_hours: "09:00-21:00".to_string(),
            supported: true,
        },
        StudySpaceRoom {
            id: "library_group_study_3f_1".to_string(),
            area: "library_group_study".to_string(),
            name: "그룹스터디실(3F-1)".to_string(),
            location: "학술정보관".to_string(),
            min_capacity: 1,
            max_capacity: 8,
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
        "AUTH_REQUIRED" | "LOGIN_REQUIRED" => StudySpaceErrorCode::AuthRequired,
        "AUTH_FAILED" => StudySpaceErrorCode::AuthFailed,
        "KEYCHAIN_UNAVAILABLE" => StudySpaceErrorCode::KeychainUnavailable,
        "UNSUPPORTED_AREA" => StudySpaceErrorCode::UnsupportedArea,
        "INVALID_DATE" => StudySpaceErrorCode::InvalidDate,
        "INVALID_TIME_RANGE" => StudySpaceErrorCode::InvalidTimeRange,
        "CAPACITY_TOO_LOW" => StudySpaceErrorCode::CapacityTooLow,
        "CAPACITY_TOO_HIGH" => StudySpaceErrorCode::CapacityTooHigh,
        "MEMBER_INFO_REQUIRED" => StudySpaceErrorCode::MemberInfoRequired,
        "UNAVAILABLE" | "SPACE_NOT_FOUND" => StudySpaceErrorCode::Unavailable,
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

fn requires_member_details(area: &str) -> bool {
    !matches!(area, "coding_lounge" | "sangsang_park_plus")
}

fn requires_usage_details(area: &str) -> bool {
    matches!(
        area,
        "sangsang_park_plus" | "sangsang_base" | "library_group_study"
    )
}

fn library_room_requires_reason(room_id: &str) -> bool {
    matches!(
        room_id,
        "library_meeting_5f_sangsang_commons" | "library_coworking_3f_creative_reading"
    )
}

fn validate_usage_info(
    area: &str,
    room_id: &str,
    usage_info: Option<&StudySpaceReservationUsageInfo>,
) -> Result<(), StudySpaceCommandError> {
    if !requires_usage_details(area) {
        return Ok(());
    }
    let Some(usage_info) = usage_info else {
        let message = if area == "sangsang_base" {
            "전체이용자 성명/학번과 총 인원수를 입력해 주세요."
        } else if area == "library_group_study" && library_room_requires_reason(room_id) {
            "예약사유와 총 인원수를 입력해 주세요."
        } else if area == "library_group_study" {
            "동반 이용자 학번/이름과 총 인원수를 입력해 주세요."
        } else {
            "소속, 사용인원, 사용목적을 모두 입력해 주세요."
        };
        return Err(StudySpaceCommandError::new(
            StudySpaceErrorCode::MemberInfoRequired,
            message,
        ));
    };
    if area == "sangsang_base" {
        let all_users = usage_info.all_users.as_deref().unwrap_or_default().trim();
        if all_users.is_empty() || usage_info.attendee_count == 0 {
            return Err(StudySpaceCommandError::new(
                StudySpaceErrorCode::MemberInfoRequired,
                "전체이용자 성명/학번과 총 인원수를 입력해 주세요.",
            ));
        }
        return Ok(());
    }
    if area == "library_group_study" {
        if library_room_requires_reason(room_id) {
            let reason = usage_info
                .reservation_reason
                .as_deref()
                .unwrap_or_default()
                .trim();
            if reason.is_empty() || usage_info.attendee_count == 0 {
                return Err(StudySpaceCommandError::new(
                    StudySpaceErrorCode::MemberInfoRequired,
                    "예약사유와 총 인원수를 입력해 주세요.",
                ));
            }
            return Ok(());
        }
        let companion_users = usage_info
            .companion_users
            .as_deref()
            .unwrap_or_default()
            .trim();
        if companion_users.is_empty() || usage_info.attendee_count == 0 {
            return Err(StudySpaceCommandError::new(
                StudySpaceErrorCode::MemberInfoRequired,
                "동반 이용자 학번/이름과 총 인원수를 입력해 주세요.",
            ));
        }
        return Ok(());
    }
    let affiliation = usage_info.affiliation.as_deref().unwrap_or_default().trim();
    let purpose = usage_info.purpose.as_deref().unwrap_or_default().trim();
    if affiliation.is_empty() || purpose.is_empty() || usage_info.attendee_count == 0 {
        return Err(StudySpaceCommandError::new(
            StudySpaceErrorCode::MemberInfoRequired,
            "소속, 사용인원, 사용목적을 모두 입력해 주세요.",
        ));
    }
    Ok(())
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
    study_space_rooms()
        .into_iter()
        .find(|room| room.id == room_id)
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
    } else if let Some(catalog_room) = study_space_rooms()
        .into_iter()
        .find(|room| room.area == area && room.name == display_name)
    {
        catalog_room.id
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

fn slot_statuses_from_availability(
    availability: Option<&Value>,
    fallback_available: bool,
    fallback_reason: Option<&str>,
) -> Vec<StudySpaceAvailabilitySlot> {
    let Some(availability) = availability else {
        return Vec::new();
    };
    let requested_slots = availability
        .get("requested_slots")
        .and_then(Value::as_array)
        .map(|slots| {
            slots
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if requested_slots.is_empty() {
        return Vec::new();
    }
    let busy_slots = availability
        .get("busy_slots")
        .and_then(Value::as_array)
        .map(|slots| {
            slots
                .iter()
                .filter_map(Value::as_str)
                .collect::<std::collections::HashSet<_>>()
        })
        .unwrap_or_default();
    requested_slots
        .into_iter()
        .map(|slot| {
            let available = if busy_slots.is_empty() {
                fallback_available
            } else {
                !busy_slots.contains(slot.as_str())
            };
            StudySpaceAvailabilitySlot {
                end_time: slot_end_time(&slot),
                start_time: slot,
                available,
                reason: if available {
                    None
                } else {
                    Some(fallback_reason.unwrap_or("예약됨").to_string())
                },
            }
        })
        .collect()
}

fn slot_end_time(slot: &str) -> String {
    NaiveTime::parse_from_str(slot, "%H:%M")
        .ok()
        .map(|time| time.overflowing_add_signed(chrono::Duration::hours(1)).0)
        .map(|time| time.format("%H:%M").to_string())
        .unwrap_or_else(|| slot.to_string())
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
                let raw_available = availability
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
                let slots =
                    slot_statuses_from_availability(availability, raw_available, reason.as_deref());
                let available = if slots.is_empty() {
                    raw_available
                } else {
                    slots.iter().all(|slot| slot.available)
                };
                Some(StudySpaceAvailability {
                    room,
                    available,
                    slots,
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
    let raw_available = availability
        .and_then(|value| value.get("available"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    StudySpaceAvailabilityResponse {
        area: request.area.clone(),
        date: request.date.clone(),
        start_time: request.start_time.clone(),
        end_time: request.end_time.clone(),
        results: vec![{
            let reason = availability
                .and_then(|value| value.get("message"))
                .and_then(Value::as_str)
                .map(ToString::to_string);
            let slots =
                slot_statuses_from_availability(availability, raw_available, reason.as_deref());
            let available = if slots.is_empty() {
                raw_available
            } else {
                slots.iter().all(|slot| slot.available)
            };
            StudySpaceAvailability {
                room,
                available,
                slots,
                reason_code: if available {
                    None
                } else {
                    Some(StudySpaceErrorCode::Unavailable)
                },
                reason,
            }
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
    let last = slots.next_back().unwrap_or(start.as_str());
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
    let mut command = Command::new(python);
    command
        .arg(&bridge_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONDONTWRITEBYTECODE", "1");
    if let Some(python_path) = hs_mcp_python_path(&bridge_path) {
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
    first_existing_path(study_space_resource_candidates(
        "study-space-hs-mcp-bridge.py",
    ))
}

fn hs_mcp_python_path(bridge_path: &Path) -> Option<PathBuf> {
    if let Ok(path) = std::env::var("HS_HUB_STUDY_SPACE_PYTHONPATH") {
        let candidate = PathBuf::from(path);
        if candidate.join("hs_mcp").is_dir() {
            return Some(candidate);
        }
    }

    let mut candidates = study_space_resource_candidates("study-space-python");
    if let Some(parent) = bridge_path.parent() {
        candidates.insert(0, parent.join("study-space-python"));
    }
    candidates
        .into_iter()
        .find(|path| path.join("hs_mcp").is_dir())
}

fn study_space_resource_candidates(resource_name: &str) -> Vec<PathBuf> {
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
    (7..=12).contains(&digits) && value.chars().all(|ch| ch.is_ascii_digit() || ch == '-')
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

    fn valid_create_request() -> StudySpaceCreateReservationRequest {
        StudySpaceCreateReservationRequest {
            availability: valid_request(),
            room_id: "coding_lounge_103".to_string(),
            members: Vec::new(),
            usage_info: None,
            dry_run: Some(false),
            confirm: Some(false),
        }
    }

    #[test]
    fn study_space_resource_candidates_cover_dev_and_packaged_layouts() {
        let candidates = study_space_resource_candidates("study-space-python");
        assert!(candidates
            .iter()
            .any(|path| path == &PathBuf::from("src-tauri/resources/study-space-python")));
        assert!(candidates
            .iter()
            .any(|path| path.ends_with(Path::new("Resources/study-space-python"))));
    }

    #[test]
    fn hs_mcp_python_path_uses_bridge_sibling_runtime() {
        let temp = tempfile::tempdir().unwrap();
        let bridge = temp.path().join("study-space-hs-mcp-bridge.py");
        let runtime = temp.path().join("study-space-python");
        std::fs::create_dir_all(runtime.join("hs_mcp")).unwrap();
        std::fs::write(&bridge, "").unwrap();

        assert_eq!(hs_mcp_python_path(&bridge), Some(runtime));
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
            .any(|area| area.key == "library_group_study" && area.supported));
        let serialized = serde_json::to_string(&status).unwrap();
        assert!(!serialized.contains("password"));
        assert!(!serialized.contains("token"));
        assert!(!serialized.contains("cookie"));
    }

    #[test]
    fn list_spaces_includes_library_group_study_rooms() {
        let result = StudySpaceReservationAdapter::list_spaces("library_group_study".to_string());
        assert!(result.ok);
        let rooms = result.data.unwrap();
        assert!(rooms.iter().any(|room| room.id == "library_group_study_6f"));
        assert!(rooms
            .iter()
            .any(|room| room.id == "library_coworking_3f_creative_reading"));
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
    fn availability_mapping_preserves_per_hour_busy_slots() {
        let request = StudySpaceAvailabilityRequest {
            room_id: None,
            ..valid_request()
        };
        let response = json!({
            "ok": true,
            "results": [{
                "space": { "space_id": "103", "name": "세미나실 103호", "capacity": 8 },
                "check": {
                    "ok": true,
                    "availability": {
                        "available": true,
                        "requested_slots": ["13:00", "14:00"],
                        "busy_slots": ["14:00"],
                        "free_slots": ["13:00"],
                        "message": "요청 시간대가 이미 예약되어 있습니다."
                    }
                }
            }]
        });

        let mapped = availability_response_from_bridge(&request, &response);

        assert_eq!(mapped.results[0].room.id, "coding_lounge_103");
        assert!(!mapped.results[0].available);
        assert_eq!(mapped.results[0].slots.len(), 2);
        assert!(mapped.results[0].slots[0].available);
        assert!(!mapped.results[0].slots[1].available);
        assert_eq!(mapped.results[0].slots[1].start_time, "14:00");
        assert_eq!(mapped.results[0].slots[1].end_time, "15:00");
    }

    #[test]
    fn actual_reservation_requires_confirm_true_without_members_for_coding_lounge() {
        let result = StudySpaceReservationAdapter::create_reservation(valid_create_request());
        assert!(!result.ok);
        assert_eq!(
            result.error.unwrap().code,
            StudySpaceErrorCode::ConfirmRequired
        );
    }

    #[test]
    fn sangsang_park_plus_requires_usage_details_but_not_members() {
        let mut request = valid_create_request();
        request.availability.area = "sangsang_park_plus".to_string();
        request.availability.room_id = Some("sangsang_park_plus_critical_thinking".to_string());
        request.room_id = "sangsang_park_plus_critical_thinking".to_string();

        let result = StudySpaceReservationAdapter::create_reservation(request);

        assert!(!result.ok);
        let error = result.error.unwrap();
        assert_eq!(error.code, StudySpaceErrorCode::MemberInfoRequired);
        assert!(error.message.contains("소속"));
    }

    #[test]
    fn sangsang_park_plus_accepts_usage_details_and_empty_members_until_confirm_gate() {
        let mut request = valid_create_request();
        request.availability.area = "sangsang_park_plus".to_string();
        request.availability.room_id = Some("sangsang_park_plus_critical_thinking".to_string());
        request.room_id = "sangsang_park_plus_critical_thinking".to_string();
        request.usage_info = Some(StudySpaceReservationUsageInfo {
            affiliation: Some("컴퓨터공학부".to_string()),
            attendee_count: 2,
            purpose: Some("팀 프로젝트 회의".to_string()),
            all_users: None,
            companion_users: None,
            reservation_reason: None,
        });

        let result = StudySpaceReservationAdapter::create_reservation(request);

        assert!(!result.ok);
        assert_eq!(
            result.error.unwrap().code,
            StudySpaceErrorCode::ConfirmRequired
        );
    }

    #[test]
    fn sangsang_base_requires_all_users_but_not_members() {
        let mut request = valid_create_request();
        request.availability.area = "sangsang_base".to_string();
        request.availability.room_id = Some("sangsang_base_seminar".to_string());
        request.room_id = "sangsang_base_seminar".to_string();

        let result = StudySpaceReservationAdapter::create_reservation(request);

        assert!(!result.ok);
        let error = result.error.unwrap();
        assert_eq!(error.code, StudySpaceErrorCode::MemberInfoRequired);
        assert!(error.message.contains("전체이용자"));
    }

    #[test]
    fn sangsang_base_accepts_all_users_until_confirm_gate() {
        let mut request = valid_create_request();
        request.availability.area = "sangsang_base".to_string();
        request.availability.room_id = Some("sangsang_base_seminar".to_string());
        request.room_id = "sangsang_base_seminar".to_string();
        request.usage_info = Some(StudySpaceReservationUsageInfo {
            affiliation: None,
            attendee_count: 2,
            purpose: None,
            all_users: Some("김한성 2170001, 이상상 2170002".to_string()),
            companion_users: None,
            reservation_reason: None,
        });

        let result = StudySpaceReservationAdapter::create_reservation(request);

        assert!(!result.ok);
        assert_eq!(
            result.error.unwrap().code,
            StudySpaceErrorCode::ConfirmRequired
        );
    }

    #[test]
    fn library_group_study_requires_companion_users_for_group_rooms() {
        let mut request = valid_create_request();
        request.availability.area = "library_group_study".to_string();
        request.availability.room_id = Some("library_group_study_6f".to_string());
        request.room_id = "library_group_study_6f".to_string();

        let result = StudySpaceReservationAdapter::create_reservation(request);

        assert!(!result.ok);
        let error = result.error.unwrap();
        assert_eq!(error.code, StudySpaceErrorCode::MemberInfoRequired);
        assert!(error.message.contains("동반 이용자"));
    }

    #[test]
    fn library_group_study_accepts_companion_users_until_confirm_gate() {
        let mut request = valid_create_request();
        request.availability.area = "library_group_study".to_string();
        request.availability.room_id = Some("library_group_study_6f".to_string());
        request.room_id = "library_group_study_6f".to_string();
        request.usage_info = Some(StudySpaceReservationUsageInfo {
            affiliation: None,
            attendee_count: 2,
            purpose: None,
            all_users: None,
            companion_users: Some("23홍길동, 24김한성".to_string()),
            reservation_reason: None,
        });

        let result = StudySpaceReservationAdapter::create_reservation(request);

        assert!(!result.ok);
        assert_eq!(
            result.error.unwrap().code,
            StudySpaceErrorCode::ConfirmRequired
        );
    }

    #[test]
    fn library_coworking_requires_reservation_reason() {
        let mut request = valid_create_request();
        request.availability.area = "library_group_study".to_string();
        request.availability.room_id = Some("library_coworking_3f_creative_reading".to_string());
        request.room_id = "library_coworking_3f_creative_reading".to_string();

        let result = StudySpaceReservationAdapter::create_reservation(request);

        assert!(!result.ok);
        let error = result.error.unwrap();
        assert_eq!(error.code, StudySpaceErrorCode::MemberInfoRequired);
        assert!(error.message.contains("예약사유"));
    }

    #[test]
    fn library_coworking_accepts_reservation_reason_until_confirm_gate() {
        let mut request = valid_create_request();
        request.availability.area = "library_group_study".to_string();
        request.availability.room_id = Some("library_coworking_3f_creative_reading".to_string());
        request.room_id = "library_coworking_3f_creative_reading".to_string();
        request.usage_info = Some(StudySpaceReservationUsageInfo {
            affiliation: None,
            attendee_count: 2,
            purpose: None,
            all_users: None,
            companion_users: None,
            reservation_reason: Some("팀 프로젝트 회의".to_string()),
        });

        let result = StudySpaceReservationAdapter::create_reservation(request);

        assert!(!result.ok);
        assert_eq!(
            result.error.unwrap().code,
            StudySpaceErrorCode::ConfirmRequired
        );
    }

    #[test]
    fn sangsang_live_room_ids_map_back_to_hs_mcp_space_names() {
        assert_eq!(
            hs_mcp_space_name_for_room_id("sangsang_park_plus_critical_thinking"),
            Some("소모임실 Critical Thinking".to_string())
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
    fn hs_mcp_login_required_maps_to_auth_required() {
        let error = map_adapter_error(
            Some("LOGIN_REQUIRED"),
            "로그인이 필요합니다. `hs-mcp login`을 먼저 실행하세요.",
        );
        assert_eq!(error.code, StudySpaceErrorCode::AuthRequired);
        assert_eq!(error.message, "한성대 학습공간 예약 로그인이 필요합니다.");
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
