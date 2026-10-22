"""Unit tests for the prompt generator (pure function of a revision)."""

from __future__ import annotations

from architectflow.prompts import MODE_SECTIONS, generate_prompt
from architectflow.schema import ArchitectureDocument, PromptSettings

from .test_changes_and_providers import jewellery


def test_prompt_is_pure_and_labeled() -> None:
    d = jewellery()
    a = generate_prompt(d, 7, "Gems", PromptSettings())
    assert a == generate_prompt(d, 7, "Gems", PromptSettings())
    assert "design revision 7" in a
    for label in ("[CONFIRMED]", "[ASSUMPTION]", "[UNRESOLVED]", "[OPTIONAL]"):
        assert label in a
    assert "does not guarantee a correct implementation" in a


def test_every_mode_renders_its_sections() -> None:
    d = jewellery()
    for mode in MODE_SECTIONS:
        out = generate_prompt(d, 1, "Gems", PromptSettings(mode=mode))  # type: ignore[arg-type]
        assert out.startswith("# Gems")
    db = generate_prompt(d, 1, "Gems", PromptSettings(mode="database"))
    assert "## Data model" in db and "## Components" not in db
    assert "FK → tenant.id" in db


def test_section_selection_and_presets() -> None:
    d = jewellery()
    out = generate_prompt(
        d, 1, "Gems", PromptSettings(sections=["overview", "api"], preset="openai_codex")
    )
    assert "## API" in out and "## Data model" not in out
    assert "OpenAI Codex" in out


def test_empty_design_is_honest() -> None:
    out = generate_prompt(ArchitectureDocument(), 1, "Empty", PromptSettings())
    assert "[UNRESOLVED] The architecture graph is empty." in out
