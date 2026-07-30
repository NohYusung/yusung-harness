import argparse
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

import complete_task


class FakeResponse:
    def __init__(self, body: str, content_type: str = "application/json") -> None:
        self._body = body.encode("utf-8")
        self.headers = {"Content-Type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        return None

    def read(self) -> bytes:
        return self._body


def task_message(
    *,
    project_id: int = 17,
    task_id: int = 29,
    status: str = "COMPLETED",
) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {
                            "id": task_id,
                            "projectId": project_id,
                            "status": status,
                        }
                    ),
                }
            ]
        },
    }


class CompleteTaskTests(unittest.TestCase):
    def test_request_uses_fixed_completed_status(self) -> None:
        captured = {}

        def opener(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return FakeResponse(json.dumps(task_message()))

        task = complete_task.complete_task(
            project_id=17,
            task_id=29,
            endpoint="http://127.0.0.1:4000/mcp",
            timeout=3.5,
            opener=opener,
        )

        request = captured["request"]
        payload = json.loads(request.data.decode("utf-8"))

        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("Content-type"), "application/json")
        self.assertEqual(
            request.get_header("Accept"),
            "application/json, text/event-stream",
        )
        self.assertEqual(captured["timeout"], 3.5)
        self.assertEqual(payload["method"], "tools/call")
        self.assertEqual(payload["params"]["name"], "update_task")
        self.assertEqual(
            payload["params"]["arguments"],
            {"projectId": 17, "taskId": 29, "status": "COMPLETED"},
        )
        self.assertEqual(task["status"], "COMPLETED")

    def test_sse_success_returns_verified_task(self) -> None:
        message = json.dumps(task_message())

        def opener(request, timeout):
            del request, timeout
            return FakeResponse(
                f"event: message\ndata: {message}\n\n",
                "text/event-stream; charset=utf-8",
            )

        task = complete_task.complete_task(
            project_id=17,
            task_id=29,
            endpoint="http://127.0.0.1:4000/mcp",
            opener=opener,
        )

        self.assertEqual(task["id"], 29)
        self.assertEqual(task["projectId"], 17)
        self.assertEqual(task["status"], "COMPLETED")

    def test_rejects_invalid_positive_integer_inputs(self) -> None:
        for value in ("", "0", "-1", "1.5", "abc", True):
            with self.subTest(value=value):
                with self.assertRaises(argparse.ArgumentTypeError):
                    complete_task.positive_integer(value)

    def test_rejects_invalid_timeout_inputs(self) -> None:
        for value in ("0", "-1", "nan", "inf", "abc"):
            with self.subTest(value=value):
                with self.assertRaises(argparse.ArgumentTypeError):
                    complete_task.positive_timeout(value)

    def test_parser_prefers_repository_mcp_url_environment_variable(self) -> None:
        with patch.dict(
            "os.environ",
            {"HARNESS_MCP_URL": "http://127.0.0.1:4100/mcp"},
            clear=True,
        ):
            args = complete_task.create_parser().parse_args(
                ["--project-id", "17", "--task-id", "29"]
            )

        self.assertEqual(args.mcp_url, "http://127.0.0.1:4100/mcp")

    def test_json_rpc_error_fails(self) -> None:
        def opener(request, timeout):
            del request, timeout
            return FakeResponse(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "error": {"code": -32603, "message": "failed"},
                    }
                )
            )

        with self.assertRaisesRegex(complete_task.TaskCompletionError, "failed"):
            complete_task.complete_task(17, 29, opener=opener)

    def test_tool_result_error_fails(self) -> None:
        def opener(request, timeout):
            del request, timeout
            return FakeResponse(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "result": {
                            "isError": True,
                            "content": [
                                {
                                    "type": "text",
                                    "text": '{"error":{"message":"Task not found"}}',
                                }
                            ],
                        },
                    }
                )
            )

        with self.assertRaisesRegex(
            complete_task.TaskCompletionError,
            "Task not found",
        ):
            complete_task.complete_task(17, 29, opener=opener)

    def test_mismatched_task_fails(self) -> None:
        for message in (
            task_message(task_id=30),
            task_message(project_id=18),
            task_message(status="PENDING"),
        ):
            with self.subTest(message=message):
                def opener(request, timeout, current=message):
                    del request, timeout
                    return FakeResponse(json.dumps(current))

                with self.assertRaises(complete_task.TaskCompletionError):
                    complete_task.complete_task(17, 29, opener=opener)

    def test_transport_errors_fail(self) -> None:
        errors = (
            URLError("connection refused"),
            TimeoutError("timed out"),
            HTTPError(
                "http://127.0.0.1:4000/mcp",
                500,
                "Internal Server Error",
                {},
                None,
            ),
        )

        for error in errors:
            with self.subTest(error=error):
                def opener(request, timeout, current=error):
                    del request, timeout
                    raise current

                with self.assertRaises(complete_task.TaskCompletionError):
                    complete_task.complete_task(17, 29, opener=opener)


if __name__ == "__main__":
    unittest.main()
