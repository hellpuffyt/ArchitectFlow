"""Design-system reference data."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from ..deps import CurrentPrincipal
from ..design.presets import all_presets

router = APIRouter(prefix="/api/design", tags=["design"])


@router.get("/presets")
def presets(_: CurrentPrincipal) -> list[dict[str, Any]]:
    """Professional starting themes; every token remains editable after applying one."""
    return all_presets()
