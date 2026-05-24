#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import sys
from typing import Any


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
    from hs_mcp.client import HansungFacilityClient
    from hs_mcp.facilities import list_reservation_areas
    from hs_mcp.session_store import KeyringSessionStore
    from hs_mcp.tools import FacilityTools
except Exception as exc:  # pragma: no cover - exercised from Rust/process boundary
    emit(bridge_error("BRIDGE_UNAVAILABLE", f"hs-mcp Python package is unavailable: {exc}"), 0)


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
        return {
            "ok": True,
            "logged_in": True,
            "student_id_masked": mask_student_id(session.student_id),
            "name": session.name or "",
            "areas": [area.__dict__ for area in list_reservation_areas()],
        }

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
            return await tools.list_spaces(area=area)
        if op == "check_availability":
            space = request.get("space")
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
