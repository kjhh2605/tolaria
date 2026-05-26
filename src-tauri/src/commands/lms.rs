use crate::lms_dashboard::{
    LmsClearSessionResult, LmsCommandError, LmsCommandResult, LmsDashboardAdapter,
    LmsDashboardErrorCode, LmsLoginRequest, LmsLoginResult, LmsOverview, LmsStatus,
};

fn task_panic_error(error: tokio::task::JoinError) -> LmsCommandError {
    LmsCommandError::with_details(
        LmsDashboardErrorCode::BridgeUnavailable,
        "LMS 작업을 완료하지 못했습니다.",
        error.to_string(),
    )
}

#[tauri::command]
pub async fn lms_status() -> LmsCommandResult<LmsStatus> {
    match tokio::task::spawn_blocking(LmsDashboardAdapter::status).await {
        Ok(status) => LmsCommandResult::ok(status),
        Err(error) => LmsCommandResult::err(task_panic_error(error)),
    }
}

#[tauri::command]
pub async fn lms_login(request: LmsLoginRequest) -> LmsCommandResult<LmsLoginResult> {
    match tokio::task::spawn_blocking(move || LmsDashboardAdapter::login(request)).await {
        Ok(result) => result,
        Err(error) => LmsCommandResult::err(task_panic_error(error)),
    }
}

#[tauri::command]
pub async fn lms_overview() -> LmsCommandResult<LmsOverview> {
    match tokio::task::spawn_blocking(LmsDashboardAdapter::overview).await {
        Ok(result) => result,
        Err(error) => LmsCommandResult::err(task_panic_error(error)),
    }
}

#[tauri::command]
pub async fn lms_clear_session() -> LmsCommandResult<LmsClearSessionResult> {
    match tokio::task::spawn_blocking(LmsDashboardAdapter::clear_session).await {
        Ok(result) => result,
        Err(error) => LmsCommandResult::err(task_panic_error(error)),
    }
}
