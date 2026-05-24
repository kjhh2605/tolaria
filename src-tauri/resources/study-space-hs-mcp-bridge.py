#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, cast


def add_bundled_runtime_to_path() -> None:
    runtime = Path(__file__).resolve().parent / "study-space-python"
    if runtime.is_dir():
        sys.path.insert(0, str(runtime))


add_bundled_runtime_to_path()


def emit(payload: dict[str, Any], code: int = 0) -> None:
    print(json.dumps(payload, ensure_ascii=False, default=str))
    raise SystemExit(code)


def mask_student_id(value: str | None) -> str | None:
    if not value:
        return value
    if len(value) <= 4:
        return "*" * len(value)
    return f"{value[:2]}{'*' * (len(value) - 4)}{value[-2:]}"


def bridge_error(code: str, message: str) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message}}


try:
    from bs4 import BeautifulSoup
    from bs4.element import Tag
    import hs_mcp.facilities as hs_facilities
    from hs_mcp.client import (
        HansungFacilityClient,
        LAYOUT,
        WEEKDAY_LABELS,
        _attr_str,
        _form_action,
        _resve_path,
        _safe_action_url,
        space_id_for_name,
    )
    from hs_mcp.facilities import (
        ReservationArea,
        check_slots_available,
        get_reservation_area,
        list_reservation_areas,
        normalize_space_name,
        validate_requested_slots,
    )
    from hs_mcp.models import AvailabilityResult, FacilitySpace
    from hs_mcp.session_store import KeyringSessionStore
    from hs_mcp.time_utils import make_hour_slots, validate_reservation_date
    from hs_mcp.tools import FacilityTools
except Exception as exc:  # pragma: no cover - exercised from Rust/process boundary
    emit(bridge_error("BRIDGE_UNAVAILABLE", f"hs-mcp Python package is unavailable: {exc}"), 0)


LIBRARY_GROUP_STUDY_SPACES: dict[str, str] = {
    "회의실(5F상상커먼스)": "94",
    "코워킹룸(3F창의열람실)": "93",
    "그룹스터디실(6F)": "92",
    "그룹스터디실(5F)": "91",
    "그룹스터디실(4F)": "90",
    "그룹스터디실(3F-2)": "89",
    "그룹스터디실(3F-1)": "88",
}


def install_library_group_study_area() -> None:
    hs_facilities.RESERVATION_AREAS.setdefault(
        "library_group_study",
        ReservationArea(
            key="library_group_study",
            display_name="학술정보관 그룹스터디실",
            site_id="hsel",
            fnct_no="14",
            group_id="14",
        ),
    )
    hs_facilities.AREA_ALIASES.update({
        "library_group_study": "library_group_study",
        "library": "library_group_study",
        "학술정보관": "library_group_study",
        "학술정보관 그룹스터디실": "library_group_study",
    })


install_library_group_study_area()


async def with_client(session: Any, action):
    client = HansungFacilityClient(session=session)
    try:
        return await action(client)
    finally:
        await client.close()


async def handle(request: dict[str, Any]) -> dict[str, Any]:
    op = request.get("op")
    store = KeyringSessionStore()

    if op == "status":
        try:
            session = store.load()
        except Exception as exc:
            return bridge_error("KEYCHAIN_UNAVAILABLE", str(exc))
        if not session:
            return {"ok": True, "logged_in": False, "areas": [area.__dict__ for area in list_reservation_areas()]}

        async def assert_session(client: HansungFacilityClient) -> dict[str, Any]:
            await client.assert_logged_in("coding_lounge")
            return {
                "ok": True,
                "logged_in": True,
                "student_id_masked": mask_student_id(session.student_id),
                "name": session.name or "",
                "areas": [area.__dict__ for area in list_reservation_areas()],
            }

        try:
            return await with_client(session, assert_session)
        except Exception as exc:
            return bridge_error(getattr(exc, "code", "AUTH_REQUIRED"), str(exc))

    if op == "login":
        student_id = str(request.get("student_id") or "").strip()
        password = str(request.get("password") or "")
        if not student_id or not password:
            return bridge_error("AUTH_REQUIRED", "학번과 비밀번호가 필요합니다.")
        client = HansungFacilityClient()
        try:
            session = await client.login(student_id, password)
            store.save(session)
            return {
                "ok": True,
                "logged_in": True,
                "student_id_masked": mask_student_id(session.student_id),
                "name": session.name or "",
                "message": "로그인 성공. 비밀번호는 저장하지 않았고 세션 쿠키만 OS 보안 저장소에 저장했습니다.",
            }
        finally:
            await client.close()

    if op == "clear_session":
        store.clear()
        return {"ok": True, "cleared": True, "message": "저장된 학습공간 예약 세션을 삭제했습니다."}

    session = store.load()
    if not session:
        return bridge_error("AUTH_REQUIRED", "한성대 학습공간 예약 로그인이 필요합니다.")

    async def tools_action(client: HansungFacilityClient) -> dict[str, Any]:
        tools = FacilityTools(client)
        area = str(request.get("area") or "coding_lounge")
        if op == "list_spaces":
            if area == "library_group_study":
                return {
                    "ok": True,
                    "area": get_reservation_area(area).__dict__,
                    "spaces": [space.model_dump() for space in _library_spaces()],
                }
            return await tools.list_spaces(area=area)
        if op == "check_availability":
            space = request.get("space")
            if area == "library_group_study":
                if space:
                    check = await _check_library_availability(
                        client,
                        space=str(space),
                        date=str(request.get("date") or ""),
                        start_time=str(request.get("start_time") or ""),
                        end_time=str(request.get("end_time") or ""),
                    )
                    return {"ok": True, "availability": check.model_dump()}
                results = []
                for space_item in _library_spaces():
                    check = await _check_library_availability(
                        client,
                        space=space_item.name,
                        date=str(request.get("date") or ""),
                        start_time=str(request.get("start_time") or ""),
                        end_time=str(request.get("end_time") or ""),
                    )
                    results.append({"space": space_item.model_dump(), "check": {"ok": True, "availability": check.model_dump()}})
                return {"ok": True, "area": get_reservation_area(area).__dict__, "results": results}
            if space:
                return await tools.check_availability(
                    space=str(space),
                    date=str(request.get("date") or ""),
                    start_time=str(request.get("start_time") or ""),
                    end_time=str(request.get("end_time") or ""),
                    area=area,
                )
            spaces_payload = await tools.list_spaces(area=area)
            if not spaces_payload.get("ok"):
                return spaces_payload
            results = []
            for space_item in spaces_payload.get("spaces", []):
                check = await tools.check_availability(
                    space=str(space_item.get("name") or ""),
                    date=str(request.get("date") or ""),
                    start_time=str(request.get("start_time") or ""),
                    end_time=str(request.get("end_time") or ""),
                    area=area,
                )
                results.append({"space": space_item, "check": check})
            return {"ok": True, "area": spaces_payload.get("area"), "results": results}
        if op == "create_reservation":
            if area in {"sangsang_park_plus", "sangsang_base", "library_group_study"}:
                result = await _create_reservation_with_required_add_items(
                    client,
                    area_key=area,
                    space=str(request.get("space") or ""),
                    date=str(request.get("date") or ""),
                    start_time=str(request.get("start_time") or ""),
                    end_time=str(request.get("end_time") or ""),
                    dry_run=bool(request.get("dry_run", True)),
                    confirm=bool(request.get("confirm", False)),
                    usage_info=request.get("usage_info") if isinstance(request.get("usage_info"), dict) else {},
                )
            else:
                result = await tools.create_reservation(
                    space=str(request.get("space") or ""),
                    date=str(request.get("date") or ""),
                    start_time=str(request.get("start_time") or ""),
                    end_time=str(request.get("end_time") or ""),
                    dry_run=bool(request.get("dry_run", True)),
                    confirm=bool(request.get("confirm", False)),
                    area=area,
                )
            if result.get("ok") and not result.get("dry_run"):
                history = await tools.list_my_reservations(area=area, include_personal_info=False)
                verified = _latest_matching_reservation(
                    history.get("reservations", []),
                    space=str(request.get("space") or ""),
                    date=str(request.get("date") or ""),
                    start_time=str(request.get("start_time") or ""),
                    end_time=str(request.get("end_time") or ""),
                )
                if verified:
                    result["reservation"] = verified
                else:
                    return bridge_error("RESERVATION_NOT_VERIFIED", "예약 신청 후 내 예약 목록에서 신청 내역을 확인하지 못했습니다.")
            return result
        if op == "list_my_reservations":
            return await tools.list_my_reservations(area=area, include_personal_info=False)
        return bridge_error("INVALID_REQUEST", f"Unknown op: {op}")

    return await with_client(session, tools_action)


async def _create_reservation_with_required_add_items(
    client: HansungFacilityClient,
    *,
    area_key: str,
    space: str,
    date: str,
    start_time: str,
    end_time: str,
    dry_run: bool,
    confirm: bool,
    usage_info: dict[str, Any],
) -> dict[str, Any]:
    if not dry_run and not confirm:
        return bridge_error("CONFIRM_REQUIRED", "실제 예약은 confirm=true가 필요합니다.")

    add_items = _required_add_items(area_key, usage_info, space)
    if not add_items:
        if area_key == "sangsang_base":
            return bridge_error("MEMBER_INFO_REQUIRED", "전체이용자 성명/학번과 총 인원수가 필요합니다.")
        if area_key == "library_group_study":
            if _library_space_requires_reason(space):
                return bridge_error("MEMBER_INFO_REQUIRED", "예약사유와 총 인원수가 필요합니다.")
            return bridge_error("MEMBER_INFO_REQUIRED", "동반 이용자 학번/이름과 총 인원수가 필요합니다.")
        return bridge_error("MEMBER_INFO_REQUIRED", "소속, 사용인원, 사용목적이 필요합니다.")

    try:
        reservation_area = get_reservation_area(area_key)
        slots = make_hour_slots(start_time, end_time)
        date = validate_reservation_date(date)
        validate_requested_slots(area_key, slots)
        spaces = _library_spaces() if area_key == "library_group_study" else await client.list_spaces(area_key)
        space_id = _library_space_id_for_name(space) if area_key == "library_group_study" else space_id_for_name(spaces, space, area_key)
        reserved = await client.get_reserved_slots(space_id, date, area_key)
        if area_key == "library_group_study":
            canonical_space = next(space_item.name for space_item in spaces if space_item.space_id == space_id)
            busy_slots = [slot for slot in slots if slot in set(reserved)]
            availability = AvailabilityResult(
                available=not busy_slots,
                space=canonical_space,
                date=date,
                requested_slots=slots,
                busy_slots=busy_slots,
                free_slots=slots if not busy_slots else [],
                message="예약 가능합니다." if not busy_slots else "요청 시간대가 이미 예약되어 있습니다.",
            )
        else:
            availability = check_slots_available(
                space=space,
                date=date,
                requested_slots=slots,
                reserved_slots=reserved,
                area=area_key,
            )
        if not availability.available:
            return {
                "ok": False,
                "error": {"code": "UNAVAILABLE", "message": availability.message},
                "availability": availability.model_dump(),
            }
        if dry_run:
            return {
                "ok": True,
                "dry_run": True,
                "area": reservation_area.__dict__,
                "reservation_request": {
                    "space": availability.space,
                    "space_id": space_id,
                    "date": date,
                    "slots": slots,
                    "usage_info": add_items,
                },
            }

        reservation = await _submit_reservation_with_add_items(
            client,
            area_key=area_key,
            space_id=space_id,
            date=date,
            slots=slots,
            expected_space_name=next(space_item.name for space_item in spaces if space_item.space_id == space_id),
            add_items=add_items,
        )
        if reservation is None:
            return bridge_error("RESERVATION_NOT_VERIFIED", "예약 신청 후 내 예약 목록에서 신청 내역을 확인하지 못했습니다.")
        return {
            "ok": True,
            "dry_run": False,
            "area": reservation_area.__dict__,
            "reservation": _reservation_dict(reservation),
        }
    except Exception as exc:
        return bridge_error(getattr(exc, "code", "INVALID_REQUEST"), str(exc))



def _library_spaces() -> list[FacilitySpace]:
    return [FacilitySpace(space_id=space_id, name=name, capacity=None) for name, space_id in LIBRARY_GROUP_STUDY_SPACES.items()]


def _library_space_id_for_name(space: str) -> str:
    normalized = space.replace(" ", "")
    for name, space_id in LIBRARY_GROUP_STUDY_SPACES.items():
        if name.replace(" ", "") == normalized:
            return space_id
    if space in LIBRARY_GROUP_STUDY_SPACES.values():
        return space
    raise ValueError(f"Unknown library study room: {space!r}")


def _library_space_requires_reason(space: str) -> bool:
    return space.startswith("회의실") or space.startswith("코워킹룸")


async def _check_library_availability(
    client: HansungFacilityClient,
    *,
    space: str,
    date: str,
    start_time: str,
    end_time: str,
) -> AvailabilityResult:
    slots = make_hour_slots(start_time, end_time)
    date = validate_reservation_date(date)
    space_id = _library_space_id_for_name(space)
    canonical_space = next(name for name, candidate_id in LIBRARY_GROUP_STUDY_SPACES.items() if candidate_id == space_id)
    reserved = await client.get_reserved_slots(space_id, date, "library_group_study")
    busy = [slot for slot in slots if slot in set(reserved)]
    available = not busy
    return AvailabilityResult(
        available=available,
        space=canonical_space,
        date=date,
        requested_slots=slots,
        busy_slots=busy,
        free_slots=slots if available else [],
        message="예약 가능합니다." if available else "요청 시간대가 이미 예약되어 있습니다.",
    )

def _required_add_items(area_key: str, usage_info: dict[str, Any], space: str = "") -> dict[str, str]:
    attendee_count = str(usage_info.get("attendee_count") or "").strip()
    if area_key == "library_group_study":
        if _library_space_requires_reason(space):
            reason = str(usage_info.get("reservation_reason") or "").strip()
            if not reason or not attendee_count:
                return {}
            return {"addItem1": reason, "addItem2": attendee_count}
        companion_users = str(usage_info.get("companion_users") or "").strip()
        if not companion_users or not attendee_count:
            return {}
        return {"addItem1": companion_users, "addItem2": attendee_count}

    if area_key == "sangsang_base":
        all_users = str(usage_info.get("all_users") or "").strip()
        if not all_users or not attendee_count:
            return {}
        return {"addItem1": all_users, "addItem2": attendee_count}

    affiliation = str(usage_info.get("affiliation") or "").strip()
    purpose = str(usage_info.get("purpose") or "").strip()
    if not affiliation or not attendee_count or not purpose:
        return {}
    return {"addItem1": affiliation, "addItem2": attendee_count, "addItem3": purpose}


async def _submit_reservation_with_add_items(
    client: HansungFacilityClient,
    *,
    area_key: str,
    space_id: str,
    date: str,
    slots: list[str],
    expected_space_name: str,
    add_items: dict[str, str],
) -> Any | None:
    await client.assert_logged_in(area_key)
    page = await client.http.get(_resve_path(area_key, f"artclRegistView.do?layout={LAYOUT}"))
    page.raise_for_status()
    soup = BeautifulSoup(page.text, "html.parser")
    form_node = soup.find("form", attrs={"name": "actionForm"}) or soup.find("form")
    form = form_node if isinstance(form_node, Tag) else None
    if not form:
        return None

    payload: dict[str, str | list[str]] = {}
    for field_node in form.find_all("input"):
        if not isinstance(field_node, Tag):
            continue
        name = _attr_str(field_node, "name")
        if name and _attr_str(field_node, "type") != "checkbox":
            payload[name] = _attr_str(field_node, "value")

    setup = await client._reservation_setup(space_id, area_key)
    payload.update(
        {
            "group": setup.get("resveGroupSeq", get_reservation_area(area_key).group_id),
            "resveSpceSeq": space_id,
            "resveDeStr": date,
            "resveTm": slots,
            "selDay": WEEKDAY_LABELS[datetime.strptime(date, "%Y-%m-%d").weekday()],
            "addItemCnt": str(len(add_items)),
            **{f"addItemMustYn{index}": "Y" for index in range(1, len(add_items) + 1)},
            **add_items,
            **setup,
        }
    )
    action = _form_action(form, _resve_path(area_key, "artclRegist.do"))
    response = await client.http.post(
        _safe_action_url(str(page.url), action, allowed_path_prefixes=("/resve/",)),
        data=cast(Any, payload),
    )
    response.raise_for_status()

    reservations = await client.list_my_reservations(area_key)
    slot_text = ",".join(slots)
    expected_space_normalized = normalize_space_name(expected_space_name, area_key)
    for reservation in reservations:
        if reservation.date != date or reservation.time != slot_text:
            continue
        if normalize_space_name(reservation.space, area_key) != expected_space_normalized:
            continue
        return reservation
    return None


def _reservation_dict(reservation: Any) -> dict[str, Any]:
    return {
        "reservation_id": getattr(reservation, "reservation_id", None),
        "space": getattr(reservation, "space", None),
        "date": getattr(reservation, "date", None),
        "time": getattr(reservation, "time", None),
        "status": getattr(reservation, "status", None),
    }

def _latest_matching_reservation(
    reservations: list[dict[str, Any]],
    *,
    space: str,
    date: str,
    start_time: str,
    end_time: str,
) -> dict[str, Any] | None:
    requested = _hour_slots(start_time, end_time)
    normalized_space = space.replace("코딩라운지", "세미나실").replace(" ", "")
    candidates = []
    for reservation in reservations:
        status = str(reservation.get("status") or "")
        if "취소" in status:
            continue
        if str(reservation.get("date") or "") != date:
            continue
        if str(reservation.get("space") or "").replace("코딩라운지", "세미나실").replace(" ", "") != normalized_space:
            continue
        if str(reservation.get("time") or "").replace(" ", "").split(",") != requested:
            continue
        candidates.append(reservation)
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: int(str(item.get("reservation_id") or "0")))[-1]


def _hour_slots(start_time: str, end_time: str) -> list[str]:
    start_hour = int(start_time.split(":", 1)[0])
    end_hour = int(end_time.split(":", 1)[0])
    return [f"{hour:02d}:00" for hour in range(start_hour, end_hour)]


def main() -> None:
    try:
        request = json.load(sys.stdin)
        response = asyncio.run(handle(request))
        emit(response)
    except SystemExit:
        raise
    except Exception as exc:
        emit(bridge_error(getattr(exc, "code", "UNKNOWN_ERROR"), str(exc)), 0)


if __name__ == "__main__":
    main()
