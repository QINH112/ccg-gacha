from __future__ import annotations

import os
from pathlib import Path


def resolve_design_root(root: Path) -> Path:
    """Resolve the design/ asset directory.

    Priority:
      1. ASTRAL_DESIGN_DIR environment variable
      2. <repo>/design            (historical layout, assets inside the project)
      3. <repo>/../design         (current layout, D:\\kaifa\\design next to the project)

    Raising here is intentional: silently falling back to a missing directory would
    let build scripts write assets into the game package or skip validation.
    """
    env = os.environ.get("ASTRAL_DESIGN_DIR")
    if env:
        candidate = Path(env).expanduser()
        if not candidate.is_dir():
            raise FileNotFoundError(f"ASTRAL_DESIGN_DIR does not exist: {candidate}")
        return candidate.resolve()
    for candidate in (root / "design", root.parent / "design"):
        if candidate.is_dir():
            return candidate.resolve()
    raise FileNotFoundError(
        "design directory not found; set ASTRAL_DESIGN_DIR or create one of: "
        + ", ".join(str(root / "design") + ", " + str(root.parent / "design") for _ in [0])
    )
