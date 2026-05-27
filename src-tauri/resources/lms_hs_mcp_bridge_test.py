from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest

BRIDGE_PATH = Path(__file__).with_name('lms-hs-mcp-bridge.py')


def load_bridge():
    spec = importlib.util.spec_from_file_location('lms_hs_mcp_bridge', BRIDGE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LmsBridgeAssignmentTest(unittest.TestCase):
    def test_safe_assignment_normalizes_due_date_from_lms_due_text(self) -> None:
        bridge = load_bridge()

        assignment = bridge.safe_assignment({
            'assignment_id': '1161907',
            'course_id': '46500',
            'name': '프로젝트 최종보고서',
            'url': 'https://learn.hansung.ac.kr/mod/assign/view.php?id=1161907',
            'due_text': '2026-06-14 23:55',
            'status_text': '미제출',
        })

        self.assertIsNotNone(assignment)
        self.assertEqual(assignment['due_date'], '2026-06-14')

    def test_safe_assignment_normalizes_korean_due_text(self) -> None:
        bridge = load_bridge()

        assignment = bridge.safe_assignment({
            'assignment_id': '1163242',
            'course_id': '46355',
            'name': '과제2',
            'url': 'https://learn.hansung.ac.kr/mod/assign/view.php?id=1163242',
            'due_text': '2026년 6월 8일 00:10',
        })

        self.assertIsNotNone(assignment)
        self.assertEqual(assignment['due_date'], '2026-06-08')


if __name__ == '__main__':
    unittest.main()
