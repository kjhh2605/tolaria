use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const HS_MCP_PACKAGE_ENV: &str = "HS_MCP_PACKAGE_PATH";
const HS_MCP_MODULE_CANDIDATES: &[&str] = &[
    "study_space_reservation_mcp",
    "study_space_reservation",
    "hs_mcp",
    "hansung_mcp",
];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StudySpaceAreaKey {
    CodingLounge,
    SangsangParkPlus,
    SangsangBase,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StudySpaceArea {
    pub key: StudySpaceAreaKey,
    pub label_ko: &'static str,
    pub supported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
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
    AdapterUnavailable,
    UnknownError,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StudySpaceError {
    pub code: StudySpaceErrorCode,
    pub message_ko: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StudySpaceAdapterStatus {
    pub adapter_available: bool,
    pub package_path: Option<String>,
    pub package_source: Option<String>,
    pub supported_areas: Vec<StudySpaceArea>,
    pub credential_ready: bool,
    pub session_ready: bool,
    pub error: Option<StudySpaceError>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StudySpaceRoom {
    pub area: StudySpaceAreaKey,
    pub room_id: String,
    pub label_ko: String,
    pub capacity_min: u8,
    pub capacity_max: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StudySpaceAvailabilityRequest {
    pub area: StudySpaceAreaKey,
    pub room_id: Option<String>,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub headcount: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StudySpaceTeamMember {
    pub student_number: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StudySpaceReservationRequest {
    pub availability: StudySpaceAvailabilityRequest,
    #[serde(default = "default_dry_run")]
    pub dry_run: bool,
    #[serde(default)]
    pub confirm: bool,
    #[serde(default)]
    pub members: Vec<StudySpaceTeamMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StudySpaceCommandResult<T> {
    pub ok: bool,
    pub data: Option<T>,
    pub error: Option<StudySpaceError>,
}

fn default_dry_run() -> bool {
    true
}

impl<T> StudySpaceCommandResult<T> {
    fn ok(data: T) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    fn err(error: StudySpaceError) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(error),
        }
    }
}

pub fn status() -> StudySpaceAdapterStatus {
    let package = resolve_hs_mcp_package_path();
    let error = package.is_none().then(|| StudySpaceError {
        code: StudySpaceErrorCode::AdapterUnavailable,
        message_ko: "Hs-MCP 예약 어댑터 패키지를 찾을 수 없습니다. 앱 안전 경계는 준비되었지만 실제 예약 호출은 비활성화되었습니다.".into(),
    });

    StudySpaceAdapterStatus {
        adapter_available: package.is_some(),
        package_path: package
            .as_ref()
            .map(|resolved| resolved.path.to_string_lossy().into_owned()),
        package_source: package.map(|resolved| resolved.source),
        supported_areas: supported_areas(),
        credential_ready: false,
        session_ready: false,
        error,
    }
}

pub fn list_spaces(area: StudySpaceAreaKey) -> StudySpaceCommandResult<Vec<StudySpaceRoom>> {
    if !is_supported_area(area) {
        return StudySpaceCommandResult::err(error(StudySpaceErrorCode::UnsupportedArea));
    }

    StudySpaceCommandResult::ok(match area {
        StudySpaceAreaKey::CodingLounge => (101..=113)
            .map(|number| StudySpaceRoom {
                area,
                room_id: format!("coding_lounge_{number}"),
                label_ko: format!("코딩라운지 세미나실 {number}호"),
                capacity_min: 1,
                capacity_max: 8,
            })
            .collect(),
        StudySpaceAreaKey::SangsangParkPlus => (1..=6)
            .map(|number| StudySpaceRoom {
                area,
                room_id: format!("sangsang_park_plus_{number}"),
                label_ko: format!("상상파크 플러스 소모임실 {number}"),
                capacity_min: 1,
                capacity_max: 6,
            })
            .collect(),
        StudySpaceAreaKey::SangsangBase => vec![StudySpaceRoom {
            area,
            room_id: "sangsang_base_seminar".into(),
            label_ko: "상상베이스 세미나실/IB 공간".into(),
            capacity_min: 1,
            capacity_max: 10,
        }],
    })
}

pub fn check_availability(
    request: StudySpaceAvailabilityRequest,
) -> StudySpaceCommandResult<StudySpaceAdapterStatus> {
    if let Err(error) = validate_availability_request(&request) {
        return StudySpaceCommandResult::err(error);
    }

    let current = status();
    if !current.adapter_available {
        return StudySpaceCommandResult::err(error(StudySpaceErrorCode::AdapterUnavailable));
    }

    StudySpaceCommandResult::ok(current)
}

pub fn create_reservation(
    request: StudySpaceReservationRequest,
) -> StudySpaceCommandResult<StudySpaceAdapterStatus> {
    if !request.dry_run && !request.confirm {
        return StudySpaceCommandResult::err(error(StudySpaceErrorCode::ConfirmRequired));
    }
    if !request.dry_run
        && request
            .members
            .iter()
            .any(|member| member.student_number.trim().is_empty() || member.name.trim().is_empty())
    {
        return StudySpaceCommandResult::err(error(StudySpaceErrorCode::MemberInfoRequired));
    }

    check_availability(request.availability)
}

pub fn clear_session() -> StudySpaceCommandResult<()> {
    StudySpaceCommandResult::ok(())
}

fn supported_areas() -> Vec<StudySpaceArea> {
    vec![
        StudySpaceArea {
            key: StudySpaceAreaKey::CodingLounge,
            label_ko: "코딩라운지",
            supported: true,
        },
        StudySpaceArea {
            key: StudySpaceAreaKey::SangsangParkPlus,
            label_ko: "상상파크 플러스",
            supported: true,
        },
        StudySpaceArea {
            key: StudySpaceAreaKey::SangsangBase,
            label_ko: "상상베이스",
            supported: true,
        },
    ]
}

fn is_supported_area(area: StudySpaceAreaKey) -> bool {
    supported_areas()
        .into_iter()
        .any(|candidate| candidate.key == area && candidate.supported)
}

fn validate_availability_request(
    request: &StudySpaceAvailabilityRequest,
) -> Result<(), StudySpaceError> {
    if !is_supported_area(request.area) {
        return Err(error(StudySpaceErrorCode::UnsupportedArea));
    }
    if !valid_iso_date(&request.date) {
        return Err(error(StudySpaceErrorCode::InvalidDate));
    }
    if !valid_time_range(&request.start_time, &request.end_time) {
        return Err(error(StudySpaceErrorCode::InvalidTimeRange));
    }
    if request.headcount == 0 {
        return Err(error(StudySpaceErrorCode::CapacityTooLow));
    }
    Ok(())
}

fn valid_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
}

fn valid_time_range(start: &str, end: &str) -> bool {
    match (parse_hhmm(start), parse_hhmm(end)) {
        (Some(start), Some(end)) => start < end,
        _ => false,
    }
}

fn parse_hhmm(value: &str) -> Option<u16> {
    let (hour, minute) = value.split_once(':')?;
    if hour.len() != 2 || minute.len() != 2 {
        return None;
    }
    let hour: u16 = hour.parse().ok()?;
    let minute: u16 = minute.parse().ok()?;
    if hour > 23 || minute > 59 {
        return None;
    }
    Some(hour * 60 + minute)
}

fn error(code: StudySpaceErrorCode) -> StudySpaceError {
    StudySpaceError {
        message_ko: korean_error_message(code).into(),
        code,
    }
}

fn korean_error_message(code: StudySpaceErrorCode) -> &'static str {
    match code {
        StudySpaceErrorCode::AuthRequired => "한성대학교 로그인 정보가 필요합니다.",
        StudySpaceErrorCode::AuthFailed => {
            "로그인에 실패했습니다. 학번과 비밀번호를 확인해 주세요."
        }
        StudySpaceErrorCode::KeychainUnavailable => "이 기기에서 보안 저장소를 사용할 수 없습니다.",
        StudySpaceErrorCode::UnsupportedArea => "현재 자동 예약 연동이 지원되지 않는 공간입니다.",
        StudySpaceErrorCode::InvalidDate => "예약 날짜 형식이 올바르지 않습니다.",
        StudySpaceErrorCode::InvalidTimeRange => "예약 시작/종료 시간이 올바르지 않습니다.",
        StudySpaceErrorCode::CapacityTooLow => "예약 인원은 1명 이상이어야 합니다.",
        StudySpaceErrorCode::CapacityTooHigh => "선택한 공간의 정원을 초과했습니다.",
        StudySpaceErrorCode::MemberInfoRequired => "실제 예약에는 팀원 이름과 학번이 필요합니다.",
        StudySpaceErrorCode::Unavailable => "선택한 시간에 예약 가능한 공간이 없습니다.",
        StudySpaceErrorCode::DuplicateReservation => "이미 같은 시간대 예약이 있습니다.",
        StudySpaceErrorCode::ConfirmRequired => "실제 예약을 진행하려면 확인이 필요합니다.",
        StudySpaceErrorCode::ReservationNotVerified => "예약 내역에서 예약을 확인하지 못했습니다.",
        StudySpaceErrorCode::NetworkError => "학교 예약 시스템에 연결하지 못했습니다.",
        StudySpaceErrorCode::SchoolSystemError => "학교 예약 시스템 오류가 발생했습니다.",
        StudySpaceErrorCode::AdapterUnavailable => "예약 어댑터를 사용할 수 없습니다.",
        StudySpaceErrorCode::UnknownError => "알 수 없는 예약 오류가 발생했습니다.",
    }
}

#[derive(Debug, Clone)]
struct ResolvedPackagePath {
    path: PathBuf,
    source: String,
}

fn resolve_hs_mcp_package_path() -> Option<ResolvedPackagePath> {
    std::env::var_os(HS_MCP_PACKAGE_ENV)
        .map(PathBuf::from)
        .and_then(|path| {
            valid_package_path(&path).then_some(ResolvedPackagePath {
                path,
                source: HS_MCP_PACKAGE_ENV.into(),
            })
        })
        .or_else(resolve_local_package_path)
}

fn resolve_local_package_path() -> Option<ResolvedPackagePath> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent()?;
    [
        repo_root.join("hs-mcp"),
        repo_root.join("Hs-MCP"),
        repo_root.join("vendor/hs-mcp"),
        repo_root.join("vendor/Hs-MCP"),
    ]
    .into_iter()
    .find(|path| valid_package_path(path))
    .map(|path| ResolvedPackagePath {
        path,
        source: "repo-local".into(),
    })
}

fn valid_package_path(path: &Path) -> bool {
    path.is_dir()
        && (path.join("pyproject.toml").is_file()
            || HS_MCP_MODULE_CANDIDATES
                .iter()
                .any(|module| path.join(module).join("__init__.py").is_file()))
}

pub fn redact_sensitive_text(input: &str) -> String {
    input
        .split_whitespace()
        .map(redact_sensitive_token)
        .collect::<Vec<_>>()
        .join(" ")
}

fn redact_sensitive_token(token: &str) -> &str {
    let lower = token.to_ascii_lowercase();
    if ["password", "token", "cookie", "session", "authorization"]
        .iter()
        .any(|key| lower.contains(key))
    {
        "[redacted]"
    } else {
        token
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn availability_request() -> StudySpaceAvailabilityRequest {
        StudySpaceAvailabilityRequest {
            area: StudySpaceAreaKey::CodingLounge,
            room_id: Some("coding_lounge_103".into()),
            date: "2026-05-27".into(),
            start_time: "13:00".into(),
            end_time: "15:00".into(),
            headcount: 2,
        }
    }

    #[test]
    fn status_exposes_supported_areas_without_credentials() {
        let status = status();
        assert!(status
            .supported_areas
            .iter()
            .any(|area| area.key == StudySpaceAreaKey::CodingLounge));
        let serialized = serde_json::to_string(&status).unwrap();
        assert!(!serialized.to_ascii_lowercase().contains("password"));
        assert!(!serialized.to_ascii_lowercase().contains("token"));
    }

    #[test]
    fn coding_lounge_catalog_contains_live_qa_room_103() {
        let rooms = list_spaces(StudySpaceAreaKey::CodingLounge).data.unwrap();
        assert!(rooms
            .iter()
            .any(|room| room.room_id == "coding_lounge_103" && room.label_ko.contains("103호")));
    }

    #[test]
    fn validates_date_time_and_headcount_before_adapter_call() {
        let mut request = availability_request();
        request.end_time = "12:00".into();
        assert_eq!(
            check_availability(request).error.unwrap().code,
            StudySpaceErrorCode::InvalidTimeRange
        );

        let mut request = availability_request();
        request.headcount = 0;
        assert_eq!(
            check_availability(request).error.unwrap().code,
            StudySpaceErrorCode::CapacityTooLow
        );
    }

    #[test]
    fn actual_reservation_requires_confirm_and_member_info() {
        let request = StudySpaceReservationRequest {
            availability: availability_request(),
            dry_run: false,
            confirm: false,
            members: vec![StudySpaceTeamMember {
                student_number: "1234567".into(),
                name: "홍길동".into(),
            }],
        };
        assert_eq!(
            create_reservation(request).error.unwrap().code,
            StudySpaceErrorCode::ConfirmRequired
        );

        let request = StudySpaceReservationRequest {
            availability: availability_request(),
            dry_run: false,
            confirm: true,
            members: vec![StudySpaceTeamMember {
                student_number: "".into(),
                name: "홍길동".into(),
            }],
        };
        assert_eq!(
            create_reservation(request).error.unwrap().code,
            StudySpaceErrorCode::MemberInfoRequired
        );
    }

    #[test]
    fn package_path_accepts_python_project_or_module_root() {
        let temp = tempfile::tempdir().unwrap();
        assert!(!valid_package_path(temp.path()));
        std::fs::write(
            temp.path().join("pyproject.toml"),
            "[project]\nname='hs-mcp'\n",
        )
        .unwrap();
        assert!(valid_package_path(temp.path()));
    }

    #[test]
    fn redacts_sensitive_adapter_diagnostics() {
        let input = "password=secret token=abc cookie=xyz session=id keep-room-103";
        let redacted = redact_sensitive_text(input);
        assert_eq!(
            redacted,
            "[redacted] [redacted] [redacted] [redacted] keep-room-103"
        );
    }
}
