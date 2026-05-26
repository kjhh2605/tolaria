use crate::lms_dashboard::{
    LmsClearSessionResult, LmsCommandResult, LmsDashboardAdapter, LmsLoginRequest, LmsLoginResult,
    LmsOverview, LmsStatus,
};

#[tauri::command]
pub fn lms_status() -> LmsCommandResult<LmsStatus> {
    LmsCommandResult::ok(LmsDashboardAdapter::status())
}

#[tauri::command]
pub fn lms_login(request: LmsLoginRequest) -> LmsCommandResult<LmsLoginResult> {
    LmsDashboardAdapter::login(request)
}

#[tauri::command]
pub fn lms_overview() -> LmsCommandResult<LmsOverview> {
    LmsDashboardAdapter::overview()
}

#[tauri::command]
pub fn lms_clear_session() -> LmsCommandResult<LmsClearSessionResult> {
    LmsDashboardAdapter::clear_session()
}
