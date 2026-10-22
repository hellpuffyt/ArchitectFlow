"""Pre-flight checks on raw (untrusted) JSON before schema validation.

These catch input that JSON allows but the document model or PostgreSQL cannot hold, so
it is rejected with a field path instead of failing deep inside the stack:

* nesting deeper than :data:`MAX_JSON_DEPTH` (legitimate documents stay far below it);
* the NUL character (U+0000), which ``jsonb``/``text`` columns cannot store;
* unpaired UTF-16 surrogates, which are not valid Unicode text;
* ``NaN``/``Infinity``, which Python's JSON parser accepts but JSON does not define.

The walk is iterative, so hostile nesting cannot exhaust the interpreter stack.
"""

from __future__ import annotations

import math
from typing import Any

MAX_JSON_DEPTH = 64
MAX_REPORTED = 20


def _safe(text: str) -> str:
    """Text that can always be encoded as UTF-8 (for echoing keys in error paths)."""
    return text.encode("utf-8", "backslashreplace").decode("utf-8").replace("\x00", "\\u0000")


def _path(parts: tuple[str, ...]) -> str:
    if len(parts) > 12:
        parts = (*parts[:10], "…", parts[-1])
    return ".".join(parts) or "(document)"


def _text_problem(text: str) -> str | None:
    if "\x00" in text:
        return "contains a NUL character (U+0000), which cannot be stored; remove it"
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return "contains an unpaired UTF-16 surrogate (invalid Unicode); re-encode the file"
    return None


def scan_untrusted(raw: Any) -> list[dict[str, str]]:
    """Return ``{path, message}`` errors for values no saved document may contain."""
    errors: list[dict[str, str]] = []
    stack: list[tuple[Any, tuple[str, ...]]] = [(raw, ())]
    while stack and len(errors) < MAX_REPORTED:
        value, parts = stack.pop()
        if isinstance(value, dict | list) and len(parts) >= MAX_JSON_DEPTH:
            errors.append(
                {
                    "path": _path(parts),
                    "message": f"nested more than {MAX_JSON_DEPTH} levels deep; "
                    "architecture documents never need this",
                }
            )
            continue
        if isinstance(value, dict):
            children: list[tuple[Any, tuple[str, ...]]] = []
            for key, child in value.items():
                key_text = str(key)
                problem = _text_problem(key_text)
                if problem:
                    errors.append(
                        {"path": _path((*parts, _safe(key_text))), "message": f"key {problem}"}
                    )
                    continue
                children.append((child, (*parts, key_text)))
            stack.extend(reversed(children))
        elif isinstance(value, list):
            stack.extend((child, (*parts, str(i))) for i, child in reversed(list(enumerate(value))))
        elif isinstance(value, str):
            problem = _text_problem(value)
            if problem:
                errors.append({"path": _path(parts), "message": problem})
        elif isinstance(value, float) and not math.isfinite(value):
            errors.append(
                {"path": _path(parts), "message": "must be a finite number (NaN/Infinity)"}
            )
    return errors
