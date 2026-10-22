"""Derive an implementation prompt from one saved revision.

``generate_prompt`` is a pure function of (document, revision number, project name,
settings): it never looks at chat history or earlier graphs, so a prompt can always
be traced to — and regenerated from — exactly one revision.

Every statement is labeled:
  [CONFIRMED]  stated by the user or deliberately saved in the design
  [ASSUMPTION] inferred; the user has not confirmed it
  [OPTIONAL]   a suggestion the implementer may skip
  [UNRESOLVED] an open question the implementer must not guess silently
"""

from __future__ import annotations

import re
from collections.abc import Callable

from ..schema import NODE_TYPES, ArchitectureDocument, PromptSection, PromptSettings
from ..validation import run_validation
from .design_sections import design_section, pages_section

C, A, OPT, U = "[CONFIRMED]", "[ASSUMPTION]", "[OPTIONAL]", "[UNRESOLVED]"

MODE_SECTIONS: dict[str, tuple[PromptSection, ...]] = {
    "complete_app": (
        "overview",
        "requirements",
        "journeys",
        "components",
        "connections",
        "data",
        "api",
        "security",
        "deployment",
        "design",
        "pages",
        "testing",
        "decisions",
        "open_questions",
    ),
    "frontend": (
        "overview",
        "requirements",
        "journeys",
        "design",
        "pages",
        "api",
        "security",
        "testing",
        "open_questions",
    ),
    "design_system": ("overview", "design", "testing", "open_questions"),
    "page": ("overview", "pages", "design", "api", "security", "testing", "open_questions"),
    "backend_api": (
        "overview",
        "requirements",
        "components",
        "connections",
        "data",
        "api",
        "security",
        "deployment",
        "testing",
        "decisions",
        "open_questions",
    ),
    "database": ("overview", "requirements", "data", "security", "testing", "open_questions"),
    "architecture_docs": (
        "overview",
        "requirements",
        "journeys",
        "components",
        "connections",
        "data",
        "api",
        "security",
        "deployment",
        "decisions",
        "open_questions",
    ),
    "testing_qa": (
        "overview",
        "requirements",
        "journeys",
        "api",
        "security",
        "testing",
        "open_questions",
    ),
}

_MODE_GOAL = {
    "complete_app": "Implement the complete application described below.",
    "frontend": "Implement the frontend only, against the API contract below.",
    "design_system": "Implement the UI design system (tokens and reusable components).",
    "page": "Implement the single page described below.",
    "backend_api": "Implement the backend services and API described below.",
    "database": "Implement the database schema and migrations described below.",
    "architecture_docs": "Write architecture documentation for the design below. Do not "
    "write application code.",
    "testing_qa": "Write a test plan and automated tests for the design below.",
}

_PRESET = {
    "claude_code": (
        "## How to work (Claude Code)\n"
        "- Read the repository before changing it; follow its conventions.\n"
        "- Work in small steps. After each step run the relevant tests and fix failures.\n"
        "- Ask before destructive or irreversible operations.\n"
        "- Treat [ASSUMPTION] items as defaults you may change; raise [UNRESOLVED] items with "
        "the user instead of guessing.\n"
    ),
    "openai_codex": (
        "## How to work (OpenAI Codex)\n"
        "- Inspect the existing code first; keep changes focused and reviewable.\n"
        "- Run the test suite after each change and report real results.\n"
        "- Treat [ASSUMPTION] items as defaults; list [UNRESOLVED] items in your final "
        "summary rather than guessing.\n"
    ),
    "generic_agent": (
        "## How to work\n"
        "- Plan before coding; implement incrementally; verify each step with tests.\n"
        "- Treat [ASSUMPTION] items as changeable defaults and [UNRESOLVED] items as open "
        "questions.\n"
    ),
}


def _req_label(status: str) -> str:
    return C if status == "confirmed" else A


def _overview(doc: ArchitectureDocument, name: str) -> list[str]:
    out = ["## Overview", f"Project: {name}"]
    out.append(f"{C} Vision: {doc.vision}" if doc.vision else f"{U} No vision text saved.")
    if doc.technology_preferences:
        out.append(f"{C} Technology preferences: {', '.join(doc.technology_preferences)}")
    if doc.integrations:
        out.append(f"{C} Integrations: {', '.join(doc.integrations)}")
    return out


def _requirements(doc: ArchitectureDocument) -> list[str]:
    r = doc.requirements
    out = ["## Requirements", "### Functional"]
    out += [f"- {_req_label(x.status)} ({x.priority}) {x.text}" for x in r.functional] or [
        f"- {U} No functional requirements saved."
    ]
    out.append("### Non-functional")
    out += [
        f"- {_req_label(x.status)} ({x.priority}, {x.category or 'general'}) {x.text}"
        for x in r.nonfunctional
    ] or [f"- {U} No non-functional requirements saved."]
    roles = [a for a in doc.actors if a.is_role]
    if roles:
        out.append("### Roles")
        out += [
            f"- {C} {a.name} (`{a.id}`){': ' + a.description if a.description else ''}"
            for a in roles
        ]
    if doc.constraints:
        out.append("### Constraints")
        out += [f"- {C} {c.text}" for c in doc.constraints]
    if doc.assumptions:
        out.append("### Assumptions")
        out += [f"- {C if a.confirmed else A} {a.text}" for a in doc.assumptions]
    return out


def _journeys(doc: ArchitectureDocument) -> list[str]:
    if not doc.workflows:
        return ["## User journeys", f"{U} No user journeys saved."]
    labels = {n.id: n.label for n in doc.nodes}
    out = ["## User journeys"]
    for wf in doc.workflows:
        steps = " → ".join(labels.get(s, s) for s in wf.steps)
        out.append(f"- {C} {wf.name}: {steps or wf.description}")
    return out


def _cell(text: str) -> str:
    """Markdown table cell: user text must not add rows or columns."""
    return re.sub(r"\s*[\r\n]+\s*", " ", text).replace("|", "\\|")


def _components(doc: ArchitectureDocument) -> list[str]:
    out = [
        "## Components",
        "| id | type | name | technology | responsibility | replicas |",
        "|---|---|---|---|---|---|",
    ]
    for n in sorted(doc.nodes, key=lambda n: n.id):
        spec = NODE_TYPES.get(n.type)
        tech = n.technology or f"{U} choose"
        out.append(
            f"| `{n.id}` | {spec.label if spec else n.type} | {_cell(n.label)} | {_cell(tech)} | "
            f"{_cell(n.description) or '—'} | {n.replicas} |"
        )
    if not doc.nodes:
        out = ["## Components", f"{U} The architecture graph is empty."]
    return out


def _connections(doc: ArchitectureDocument) -> list[str]:
    labels = {n.id: n.label for n in doc.nodes}
    out = ["## Connections"]
    for e in sorted(doc.edges, key=lambda e: e.id):
        mode = "sync" if e.synchronous else "async"
        enc = {True: "encrypted", False: "UNENCRYPTED", None: "encryption unstated"}[e.encrypted]
        extra = f" — {e.label}" if e.label else ""
        out.append(
            f"- {C} {labels.get(e.source, e.source)} → {labels.get(e.target, e.target)}: "
            f"{e.protocol}, {mode}, {enc}{extra}"
        )
    if not doc.edges:
        out.append(f"{U} No connections saved.")
    return out


def _data(doc: ArchitectureDocument) -> list[str]:
    out = ["## Data model"]
    if not doc.database.entities:
        return [*out, f"{U} No entities saved; design the schema from the requirements."]
    names = {e.id: e.name for e in doc.database.entities}
    for ent in doc.database.entities:
        out.append(f"### `{ent.name}`" + (f" — {ent.label}" if ent.label else ""))
        for f in ent.fields:
            flags: list[str] = [f.type]
            if f.primary_key:
                flags.append("PK")
            if not f.nullable:
                flags.append("NOT NULL")
            if f.unique:
                flags.append("UNIQUE")
            if f.foreign_key:
                flags.append(
                    f"FK → {names.get(f.foreign_key.entity_id, '?')}."
                    f"{f.foreign_key.field} ON DELETE {f.foreign_key.on_delete}"
                )
            out.append(f"- `{f.name}`: {', '.join(flags)}")
        for ix in ent.indexes:
            out.append(
                f"- {OPT} index ({', '.join(ix.fields)})" + (f" — {ix.reason}" if ix.reason else "")
            )
    return out


def _api(doc: ArchitectureDocument) -> list[str]:
    out = ["## API"]
    if not doc.api.endpoints:
        return [*out, f"{U} No endpoints saved."]
    labels = {n.id: n.label for n in doc.nodes}
    for ep in doc.api.endpoints:
        auth = ep.auth if ep.auth != "roles" else f"roles: {', '.join(ep.roles)}"
        svc = labels.get(ep.service_node_id or "", f"{U} unassigned service")
        out.append(f"### `{ep.method} {ep.path}` — {ep.summary}")
        out.append(f"- Implemented by: {svc}; auth: {auth}")
        if ep.request_fields:
            out.append(
                "- Request: "
                + ", ".join(
                    f"{f.name}:{f.type}{'' if f.required else '?'}" for f in ep.request_fields
                )
            )
        if ep.response_fields:
            shape = "list of " if ep.response_is_list else ""
            out.append(
                f"- Response ({shape}object): "
                + ", ".join(f"{f.name}:{f.type}" for f in ep.response_fields)
            )
        if ep.paginated:
            out.append("- Paginated (cursor or limit/offset; document which).")
        if ep.errors:
            out.append("- Errors: " + ", ".join(f"{e.status} {e.description}" for e in ep.errors))
    return out


def _security(doc: ArchitectureDocument) -> list[str]:
    out = ["## Security"]
    auth_nodes = [n.label for n in doc.nodes if n.type == "auth_service"]
    out.append(
        f"{C} Authentication via: {', '.join(auth_nodes)}"
        if auth_nodes
        else f"{U} No authentication component in the design."
    )
    out.append(f"{C} Enforce authorization on the server for every protected endpoint.")
    out.append(f"{C} Keep secrets out of source control and client bundles.")
    public = [n.label for n in doc.nodes if n.public]
    if public:
        out.append(f"{C} Publicly reachable: {', '.join(public)}")
    findings = [
        f
        for f in run_validation(doc)
        if f.rule
        in {
            "missing-auth",
            "public-internal-component",
            "client-to-datastore",
            "unencrypted-boundary",
            "missing-secrets-management",
            "plaintext-protocol",
        }
    ]
    for f in findings:
        out.append(f"- {OPT} Validation recommendation — {f.title}: {f.remediation}")
    return out


def _deployment(doc: ArchitectureDocument) -> list[str]:
    out = ["## Deployment"]
    infra = [n for n in doc.nodes if n.type == "cloud_resource"]
    out += [f"- {C} {n.label}: {n.technology or n.description}" for n in infra]
    scaled = [n for n in doc.nodes if n.replicas > 1]
    out += [f"- {C} {n.label} runs {n.replicas} replicas" for n in scaled]
    if not infra:
        out.append(f"- {U} Hosting platform and environments are not specified.")
    out.append(f"- {OPT} Provide a reproducible local setup (e.g. Docker Compose) and CI.")
    return out


def _design(doc: ArchitectureDocument) -> list[str]:
    return design_section(doc)


def _pages(doc: ArchitectureDocument) -> list[str]:
    return pages_section(doc)


def _testing(doc: ArchitectureDocument) -> list[str]:
    out = ["## Testing and acceptance criteria"]
    out += [f"- {C} {ac.text}" for ac in doc.requirements.acceptance_criteria]
    out.append(
        f"- {C} Unit tests for business logic; integration tests for every endpoint "
        "including authorization failures."
    )
    out.append(f"- {C} An end-to-end test for each user journey.")
    if not doc.requirements.acceptance_criteria:
        out.append(f"- {U} No acceptance criteria saved; agree them before implementing.")
    return out


def _decisions(doc: ArchitectureDocument) -> list[str]:
    out = ["## Architecture decisions"]
    for d in doc.decisions:
        label = C if d.status == "accepted" else A
        out.append(
            f"- {label} {d.title}. Why: {d.rationale or '—'}. Trade-offs: {d.tradeoffs or '—'}"
        )
    if not doc.decisions:
        out.append(f"- {U} No decisions recorded.")
    return out


def _open_questions(doc: ArchitectureDocument) -> list[str]:
    out = ["## Open questions"]
    out += [f"- {U} {q}" for q in doc.open_questions]
    unconfirmed = [a for a in doc.assumptions if not a.confirmed]
    out += [f"- {U} Confirm assumption: {a.text}" for a in unconfirmed]
    if len(out) == 1:
        out.append("- None recorded.")
    return out


_BUILDERS: dict[PromptSection, Callable[[ArchitectureDocument], list[str]]] = {
    "requirements": _requirements,
    "journeys": _journeys,
    "components": _components,
    "connections": _connections,
    "data": _data,
    "api": _api,
    "security": _security,
    "deployment": _deployment,
    "design": _design,
    "pages": _pages,
    "testing": _testing,
    "decisions": _decisions,
    "open_questions": _open_questions,
}


def generate_prompt(
    doc: ArchitectureDocument, revision: int, project_name: str, settings: PromptSettings
) -> str:
    """Return the Markdown prompt for ``doc`` (saved as ``revision``)."""
    allowed = MODE_SECTIONS[settings.mode]
    chosen = [s for s in allowed if s in settings.sections]
    parts = [
        f"# {project_name} — implementation brief",
        f"Source: ArchitectFlow design revision {revision}. Mode: {settings.mode}. "
        f"Labels: {C} stated/saved, {A} inferred and unconfirmed, {OPT} suggestion, "
        f"{U} open question.",
        "",
        f"**Goal:** {_MODE_GOAL[settings.mode]}",
        "",
        _PRESET[settings.preset],
    ]
    for section in chosen:
        if section == "overview":
            lines = _overview(doc, project_name)
        elif section == "pages" and settings.mode == "page":
            lines = pages_section(doc, settings.page_id)
        else:
            lines = _BUILDERS[section](doc)
        parts.append("\n".join(lines))
        parts.append("")
    parts.append(
        "## Definition of done\n"
        "- All [CONFIRMED] requirements and acceptance criteria are met and tested.\n"
        "- [UNRESOLVED] questions are answered by the user or listed in your summary.\n"
        "- This brief describes intent; it does not guarantee a correct "
        "implementation. Verify against the acceptance criteria."
    )
    return "\n".join(parts).strip() + "\n"
