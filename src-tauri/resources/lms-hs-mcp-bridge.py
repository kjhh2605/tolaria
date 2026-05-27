#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

LMS_ALLOWED_HOST = "learn.hansung.ac.kr"
MAX_COURSES = 20
MAX_ASSIGNMENTS = 60


def add_bundled_runtime_to_path() -> None:
    runtime = Path(__file__).resolve().parent / "study-space-python"
    if runtime.is_dir() and str(runtime) not in sys.path:
        # Keep the bundled runtime behind the Python stdlib so top-level packages
        # bundled by dependencies (for example keyring.backends.macOS.http) cannot
        # shadow stdlib packages such as http.client during httpx imports.
        sys.path.append(str(runtime))


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
    return {"ok": False, "read_only": True, "error": {"code": code, "message": message}}


def safe_lms_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.netloc != LMS_ALLOWED_HOST:
        return None
    return value


try:
    from hs_mcp.lms import HansungLmsClient, LmsTools, lms_session_store, parse_lms_assignments
except Exception as exc:  # pragma: no cover - exercised from Rust/process boundary
    emit(bridge_error("BRIDGE_UNAVAILABLE", f"hs-mcp LMS package is unavailable: {exc}"), 0)


async def with_client(session: Any, action):
    client = HansungLmsClient(session=session)
    try:
        return await action(client)
    finally:
        await client.close()


def safe_course(course: dict[str, Any]) -> dict[str, Any] | None:
    url = safe_lms_url(course.get("url"))
    if not url:
        return None
    return {
        "course_id": str(course.get("course_id") or ""),
        "name": str(course.get("name") or ""),
        "url": url,
        "progress_text": course.get("progress_text"),
    }


def normalized_due_date(value: Any) -> str | None:
    if not value:
        return None
    text = " ".join(str(value).split())
    patterns = [
        r"(?P<year>\d{4})[-./](?P<month>\d{1,2})[-./](?P<day>\d{1,2})",
        r"(?P<year>\d{4})\s*년\s*(?P<month>\d{1,2})\s*월\s*(?P<day>\d{1,2})\s*일",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        try:
            return date(int(match.group("year")), int(match.group("month")), int(match.group("day"))).isoformat()
        except ValueError:
            return None
    return None


def safe_assignment(assignment: dict[str, Any]) -> dict[str, Any] | None:
    url = safe_lms_url(assignment.get("url"))
    if not url:
        return None
    return {
        "assignment_id": assignment.get("assignment_id"),
        "course_id": str(assignment.get("course_id") or ""),
        "course_name": assignment.get("course_name"),
        "name": str(assignment.get("name") or ""),
        "url": url,
        "due_text": assignment.get("due_text"),
        "status_text": assignment.get("status_text"),
        "due_date": assignment.get("due_date") or normalized_due_date(assignment.get("due_text")),
    }


async def handle(request: dict[str, Any]) -> dict[str, Any]:
    op = request.get("op")
    store = lms_session_store()

    if op == "status":
        try:
            session = store.load()
        except Exception as exc:
            return bridge_error("KEYCHAIN_UNAVAILABLE", str(exc))
        if not session:
            return {"ok": True, "logged_in": False, "read_only": True}

        return {
            "ok": True,
            "logged_in": True,
            "read_only": True,
            "student_id_masked": mask_student_id(getattr(session, "student_id", None)),
        }

    if op == "login":
        student_id = str(request.get("student_id") or "").strip()
        password = str(request.get("password") or "")
        if not student_id or not password:
            return bridge_error("AUTH_REQUIRED", "학번과 비밀번호가 필요합니다.")
        client = HansungLmsClient()
        try:
            session = await client.login(student_id, password)
            store.save(session)
            return {
                "ok": True,
                "logged_in": True,
                "read_only": True,
                "student_id_masked": mask_student_id(getattr(session, "student_id", None)),
                "message": "로그인 성공. 비밀번호는 저장하지 않고 LMS 세션만 OS 보안 저장소에 저장했습니다.",
            }
        finally:
            await client.close()

    if op == "clear_session":
        store.clear()
        return {"ok": True, "read_only": True, "cleared": True, "message": "저장된 LMS 세션을 삭제했습니다."}

    session = store.load()
    if not session:
        return bridge_error("AUTH_REQUIRED", "한성 e-class 로그인이 필요합니다.")

    async def tools_action(client: HansungLmsClient) -> dict[str, Any]:
        if op == "overview":
            courses_raw = [course.model_dump() for course in await client.list_courses()]
            assignments_raw: list[dict[str, Any]] = []
            for course in courses_raw:
                course_id = str(course.get("course_id") or "")
                if not course_id:
                    continue
                response = await client.http.get(f"/mod/assign/index.php?id={course_id}")
                response.raise_for_status()
                assignments_raw.extend(
                    assignment.model_dump()
                    for assignment in parse_lms_assignments(
                        response.text,
                        base_url=client.base_url,
                        course_id=course_id,
                        course_name=str(course.get("name") or ""),
                    )
                )
            courses = [item for item in (safe_course(course) for course in courses_raw) if item]
            assignments = [item for item in (safe_assignment(assignment) for assignment in assignments_raw) if item]
            assignments.sort(
                key=lambda item: (
                    item.get("due_date") is None,
                    item.get("due_date") or "9999-12-31",
                    item.get("due_text") or "",
                    item.get("name") or "",
                )
            )
            return {
                "ok": True,
                "read_only": True,
                "summary": {"course_count": len(courses), "assignment_count": len(assignments)},
                "courses": courses[:MAX_COURSES],
                "assignments": assignments[:MAX_ASSIGNMENTS],
            }
        return bridge_error("INVALID_REQUEST", "지원하지 않는 LMS 작업입니다.")

    try:
        return await with_client(session, tools_action)
    except Exception as exc:
        return bridge_error(getattr(exc, "code", "UNKNOWN_ERROR"), str(exc))


def main() -> None:
    try:
        request = json.loads(sys.stdin.read() or "{}")
        response = asyncio.run(handle(request))
        emit(response, 0)
    except json.JSONDecodeError as exc:
        emit(bridge_error("PARSE_ERROR", str(exc)), 0)
    except SystemExit:
        raise
    except Exception as exc:
        emit(bridge_error(getattr(exc, "code", "UNKNOWN_ERROR"), str(exc)), 0)


if __name__ == "__main__":
    main()
