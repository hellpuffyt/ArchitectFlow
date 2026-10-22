"""Escaping helpers so user text cannot break out of diagram/markup syntax."""

from __future__ import annotations

import re


def mermaid_label(text: str) -> str:
    """Safe text for a double-quoted Mermaid label."""
    t = re.sub(r"[\r\n\t]+", " ", text).strip()
    t = t.replace("&", "#amp;").replace('"', "#quot;").replace("<", "#lt;")
    t = t.replace(">", "#gt;").replace("`", "'").replace("|", "#124;")
    return t[:200] or " "


def plantuml_label(text: str) -> str:
    t = re.sub(r"[\r\n\t]+", " ", text).strip().replace('"', "'")
    return t[:200] or " "


def md_cell(text: str) -> str:
    """Markdown table cell: no pipes/newlines, HTML neutralized."""
    t = re.sub(r"[\r\n]+", " ", text).replace("|", "\\|")
    return t.replace("<", "&lt;").replace(">", "&gt;")


def md_text(text: str) -> str:
    return text.replace("<", "&lt;").replace(">", "&gt;")


def ident(i: int, prefix: str = "n") -> str:
    return f"{prefix}{i}"
