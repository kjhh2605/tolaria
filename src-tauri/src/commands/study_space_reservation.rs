use crate::study_space_reservation::{
    self, StudySpaceAdapterStatus, StudySpaceAreaKey, StudySpaceAvailabilityRequest,
    StudySpaceCommandResult, StudySpaceReservationRequest, StudySpaceRoom,
};

#[tauri::command]
pub fn study_space_status() -> StudySpaceAdapterStatus {
    study_space_reservation::status()
}

#[tauri::command]
pub fn study_space_list_spaces(
    area: StudySpaceAreaKey,
) -> StudySpaceCommandResult<Vec<StudySpaceRoom>> {
    study_space_reservation::list_spaces(area)
}

#[tauri::command]
pub fn study_space_check_availability(
    request: StudySpaceAvailabilityRequest,
) -> StudySpaceCommandResult<StudySpaceAdapterStatus> {
    study_space_reservation::check_availability(request)
}

#[tauri::command]
pub fn study_space_create_reservation(
    request: StudySpaceReservationRequest,
) -> StudySpaceCommandResult<StudySpaceAdapterStatus> {
    study_space_reservation::create_reservation(request)
}

#[tauri::command]
pub fn study_space_clear_session() -> StudySpaceCommandResult<()> {
    study_space_reservation::clear_session()
}
