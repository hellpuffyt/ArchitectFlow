"""Write the architecture JSON Schema and node registry for the web app.

Usage: python -m architectflow.schema.export <output-dir>
The web app's tests compare its hand-written TypeScript types against these files.
"""

from __future__ import annotations

import dataclasses
import json
import sys
from pathlib import Path

from .architecture import ArchitectureDocument
from .registry import NODE_TYPES


def main(out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    schema = ArchitectureDocument.model_json_schema()
    (out / "architecture.schema.json").write_text(json.dumps(schema, indent=2, sort_keys=True)
                                                  + "\n")
    registry = [dataclasses.asdict(spec) for spec in NODE_TYPES.values()]
    (out / "node-registry.json").write_text(json.dumps(registry, indent=2) + "\n")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../web/lib/generated")
