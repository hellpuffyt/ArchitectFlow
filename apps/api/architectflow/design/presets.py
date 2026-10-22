"""Professional starting points. Every token stays editable after applying a preset."""

from __future__ import annotations

from typing import Any

from ..schema import Theme

_PRESETS: dict[str, dict[str, Any]] = {
    "developer-dark": {
        "name": "Developer dark",
        "appearance": "dark",
        "dark": {
            "primary": "#5b8cff",
            "on_primary": "#06122e",
            "accent": "#3ccf91",
            "background": "#0b0d12",
            "surface": "#141821",
            "text": "#e6e9f0",
            "muted_text": "#9aa3b5",
            "border": "#262c3a",
        },
        "typography": {"body_font": "Inter, system-ui, sans-serif", "base_size": 14},
        "spacing": {"density": "compact"},
        "radii": {"sm": 4, "md": 6, "lg": 10},
        "components": {"navigation": "sidebar", "card": "outlined", "table_density": "compact"},
    },
    "saas-light": {
        "name": "SaaS light",
        "appearance": "light",
        "light": {
            "primary": "#4f46e5",
            "on_primary": "#ffffff",
            "accent": "#0ea5e9",
            "background": "#ffffff",
            "surface": "#f8fafc",
            "text": "#0f172a",
            "muted_text": "#475569",
            "border": "#e2e8f0",
        },
        "radii": {"sm": 6, "md": 10, "lg": 16},
        "elevation": {"shadow": "subtle"},
        "components": {"button_radius": "lg", "card": "elevated", "navigation": "topbar"},
    },
    "enterprise-compact": {
        "name": "Enterprise compact",
        "appearance": "light",
        "light": {
            "primary": "#1f4e8c",
            "on_primary": "#ffffff",
            "accent": "#0f766e",
            "background": "#f4f6f8",
            "surface": "#ffffff",
            "text": "#111827",
            "muted_text": "#4b5563",
            "border": "#cfd6df",
        },
        "typography": {"base_size": 13, "line_height": 1.4},
        "spacing": {"density": "compact"},
        "radii": {"sm": 2, "md": 4, "lg": 6},
        "elevation": {"shadow": "none"},
        "components": {"navigation": "sidebar", "table_density": "compact", "card": "flat"},
    },
    "emerald-premium-dark": {
        "name": "Emerald premium dark",
        "appearance": "dark",
        "dark": {
            "primary": "#10b981",
            "on_primary": "#04130d",
            "accent": "#a7f3d0",
            "background": "#07110d",
            "surface": "#0f1d17",
            "text": "#ecfdf5",
            "muted_text": "#9fc4b4",
            "border": "#1d3a2f",
        },
        "typography": {"heading_weight": 700},
        "radii": {"sm": 6, "md": 12, "lg": 20},
        "elevation": {"shadow": "medium"},
        "components": {"button_radius": "full"},
    },
    "warm-minimal": {
        "name": "Warm minimal",
        "appearance": "light",
        "light": {
            "primary": "#b4532a",
            "on_primary": "#ffffff",
            "accent": "#7c6f64",
            "background": "#fbf8f4",
            "surface": "#ffffff",
            "text": "#2b2118",
            "muted_text": "#6b5d50",
            "border": "#e7ddd2",
        },
        "typography": {"heading_font": "Georgia, serif", "base_size": 16},
        "spacing": {"density": "spacious"},
        "elevation": {"shadow": "none"},
        "components": {"button": "outline", "card": "flat"},
    },
    "high-contrast": {
        "name": "High contrast",
        "appearance": "light",
        "light": {
            "primary": "#0033cc",
            "on_primary": "#ffffff",
            "accent": "#7a00cc",
            "background": "#ffffff",
            "surface": "#ffffff",
            "text": "#000000",
            "muted_text": "#1f1f1f",
            "border": "#000000",
        },
        "elevation": {"border_width": 2, "shadow": "none"},
        "typography": {"base_size": 17},
        "motion": {"intensity": "none"},
    },
}

PRESETS: tuple[str, ...] = tuple(_PRESETS)


def preset_theme(key: str, theme_id: str) -> Theme:
    """Build a full theme from a preset (unknown keys raise KeyError)."""
    spec = _PRESETS[key]
    base = Theme(id=theme_id, name=spec["name"], preset=key).model_dump()
    for section, values in spec.items():
        if isinstance(values, dict):
            base[section] = {**base[section], **values}
        else:
            base[section] = values
    return Theme.model_validate(base)


def all_presets() -> list[dict[str, Any]]:
    return [preset_theme(k, k).model_dump() for k in PRESETS]
