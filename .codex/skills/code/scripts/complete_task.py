#!/usr/bin/env python3
"""Mark one yusung-harness Task as COMPLETED through the local MCP server."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Callable
from urllib.parse import urlparse


DEFAULT_MCP_URL = "http://127.0.0.1:4000/mcp"
DEFAULT_TIMEOUT_SECONDS = 10.0
MAX_SAFE_INTEGER = 9_007_199_254_740_991
REQUEST_ID = 1


class TaskCompletionError(RuntimeError):
    """Raised when the MCP server does not confirm the requested completion."""


def positive_integer(value: object) -> int:
    """Parse an MCP identifier while rejecting booleans and non-integers."""
    if isinstance(value, bool):
        raise argparse.ArgumentTypeError("must be a positive integer")

    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = int(value)
        except ValueError as error:
            raise argparse.ArgumentTypeError(
                "must be a positive integer"
            ) from error
    else:
        raise argparse.ArgumentTypeError("must be a positive integer")

    if parsed <= 0 or parsed > MAX_SAFE_INTEGER:
        raise argparse.ArgumentTypeError(
            f"must be between 1 and {MAX_SAFE_INTEGER}"
        )

    return parsed


def positive_timeout(value: str) -> float:
    """Parse a positive network timeout in seconds."""
    try:
        parsed = float(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("must be a positive number") from error

    if not math.isfinite(parsed) or parsed <= 0:
        raise argparse.ArgumentTypeError("must be a positive number")

    return parsed


def mcp_url(value: str) -> str:
    """Validate the HTTP(S) MCP endpoint accepted by urllib."""
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise argparse.ArgumentTypeError("must be an absolute HTTP(S) URL")
    return value


def build_payload(project_id: int, task_id: int) -> dict[str, Any]:
    """Build the fixed update_task request without exposing status as input."""
    return {
        "jsonrpc": "2.0",
        "id": REQUEST_ID,
        "method": "tools/call",
        "params": {
            "name": "update_task",
            "arguments": {
                "projectId": project_id,
                "taskId": task_id,
                "status": "COMPLETED",
            },
        },
    }


def _parse_json(value: str, context: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError as error:
        raise TaskCompletionError(f"Invalid {context}: {error.msg}") from error


def _parse_sse(body: str) -> dict[str, Any]:
    data_lines: list[str] = []
    messages: list[dict[str, Any]] = []

    def flush_event() -> None:
        if not data_lines:
            return

        data = "\n".join(data_lines)
        data_lines.clear()
        if data == "[DONE]":
            return

        message = _parse_json(data, "SSE data")
        if not isinstance(message, dict):
            raise TaskCompletionError("SSE data must contain a JSON object")
        messages.append(message)

    for line in body.splitlines():
        if not line:
            flush_event()
            continue
        if line.startswith(":"):
            continue
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip(" "))

    flush_event()

    for message in reversed(messages):
        if message.get("id") == REQUEST_ID:
            return message

    raise TaskCompletionError("SSE response did not contain the request result")


def parse_response(body: str, content_type: str) -> dict[str, Any]:
    """Parse either an MCP JSON response or a Streamable HTTP SSE response."""
    if not body.strip():
        raise TaskCompletionError("MCP response body was empty")

    if "text/event-stream" in content_type.lower():
        return _parse_sse(body)

    message = _parse_json(body, "JSON response")
    if not isinstance(message, dict):
        raise TaskCompletionError("MCP response must contain a JSON object")
    return message


def _content_text(result: dict[str, Any]) -> str:
    content = result.get("content")
    if not isinstance(content, list):
        raise TaskCompletionError("MCP result did not contain content")

    text_items = [
        item.get("text")
        for item in content
        if isinstance(item, dict)
        and item.get("type") == "text"
        and isinstance(item.get("text"), str)
    ]
    if not text_items:
        raise TaskCompletionError("MCP result did not contain text content")

    return "\n".join(text_items)


def _verify_task(
    message: dict[str, Any],
    project_id: int,
    task_id: int,
) -> dict[str, Any]:
    if message.get("id") != REQUEST_ID:
        raise TaskCompletionError("MCP response id did not match the request")

    error = message.get("error")
    if error is not None:
        detail = error.get("message") if isinstance(error, dict) else str(error)
        raise TaskCompletionError(f"MCP JSON-RPC error: {detail}")

    result = message.get("result")
    if not isinstance(result, dict):
        raise TaskCompletionError("MCP response did not contain a result")

    content_text = _content_text(result)
    if result.get("isError") is True:
        raise TaskCompletionError(f"update_task failed: {content_text}")

    task = _parse_json(content_text, "Task result")
    if not isinstance(task, dict):
        raise TaskCompletionError("Task result must contain a JSON object")

    expected = {
        "id": task_id,
        "projectId": project_id,
        "status": "COMPLETED",
    }
    actual = {key: task.get(key) for key in expected}
    if actual != expected:
        raise TaskCompletionError(
            f"Task completion was not confirmed: expected {expected}, got {actual}"
        )

    return task


def complete_task(
    project_id: int,
    task_id: int,
    endpoint: str = DEFAULT_MCP_URL,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> dict[str, Any]:
    """Call update_task and return the verified COMPLETED Task."""
    project_id = positive_integer(project_id)
    task_id = positive_integer(task_id)
    endpoint = mcp_url(endpoint)
    if timeout <= 0:
        raise TaskCompletionError("timeout must be positive")

    request = urllib.request.Request(
        endpoint,
        data=json.dumps(build_payload(project_id, task_id)).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        method="POST",
    )

    try:
        with opener(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            content_type = response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as error:
        detail = (
            error.read().decode("utf-8", errors="replace")
            if error.fp is not None
            else str(error.reason)
        )
        raise TaskCompletionError(
            f"MCP HTTP {error.code}: {detail or error.reason}"
        ) from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        reason = getattr(error, "reason", error)
        raise TaskCompletionError(f"MCP connection failed: {reason}") from error

    return _verify_task(
        parse_response(body, content_type),
        project_id,
        task_id,
    )


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Mark one yusung-harness Task as COMPLETED.",
    )
    parser.add_argument("--project-id", required=True, type=positive_integer)
    parser.add_argument("--task-id", required=True, type=positive_integer)
    parser.add_argument(
        "--mcp-url",
        default=(
            os.environ.get("HARNESS_MCP_URL")
            or os.environ.get("YUSUNG_HARNESS_MCP_URL")
            or DEFAULT_MCP_URL
        ),
        type=mcp_url,
    )
    parser.add_argument(
        "--timeout",
        default=DEFAULT_TIMEOUT_SECONDS,
        type=positive_timeout,
        help="request timeout in seconds (default: %(default)s)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = create_parser().parse_args(argv)

    try:
        task = complete_task(
            project_id=args.project_id,
            task_id=args.task_id,
            endpoint=args.mcp_url,
            timeout=args.timeout,
        )
    except TaskCompletionError as error:
        print(f"Task completion failed: {error}", file=sys.stderr)
        return 1

    print(f"Task {task['id']} status: {task['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
