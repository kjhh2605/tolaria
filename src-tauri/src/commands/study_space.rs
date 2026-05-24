use crate::study_space_reservation::{
    StudySpaceAvailabilityRequest, StudySpaceAvailabilityResponse, StudySpaceClearSessionResult,
    StudySpaceCommandResult, StudySpaceCreateReservationRequest, StudySpaceReservationAdapter,
    StudySpaceReservationResult, StudySpaceReservationSummary, StudySpaceRoom, StudySpaceStatus,
};

#[tauri::command]
pub fn study_space_status() -> StudySpaceCommandResult<StudySpaceStatus> {
    StudySpaceCommandResult::ok(StudySpaceReservationAdapter::status())
}

#[tauri::command]
pub fn study_space_list_spaces(area: String) -> StudySpaceCommandResult<Vec<StudySpaceRoom>> {
    StudySpaceReservationAdapter::list_spaces(area)
}

#[tauri::command]
pub fn study_space_check_availability(
    request: StudySpaceAvailabilityRequest,
) -> StudySpaceCommandResult<StudySpaceAvailabilityResponse> {
    StudySpaceReservationAdapter::check_availability(request)
}

#[tauri::command]
pub fn study_space_create_reservation(
    request: StudySpaceCreateReservationRequest,
) -> StudySpaceCommandResult<StudySpaceReservationResult> {
    StudySpaceReservationAdapter::create_reservation(request)
}

#[tauri::command]
pub fn study_space_list_my_reservations(
    area: String,
) -> StudySpaceCommandResult<Vec<StudySpaceReservationSummary>> {
    StudySpaceReservationAdapter::list_my_reservations(area)
}

#[tauri::command]
pub fn study_space_clear_session() -> StudySpaceCommandResult<StudySpaceClearSessionResult> {
    StudySpaceReservationAdapter::clear_session()
}
