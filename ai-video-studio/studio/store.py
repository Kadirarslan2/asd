"""Proje klasörü, katalog ve durum dosyalarının okunup yazılması."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

import yaml

from .models import Project, State

PKG_CATALOG = Path(__file__).with_name("catalog.yaml")


def home() -> Path:
    return Path(os.getenv("STUDIO_HOME", "projects"))


def load_catalog() -> dict:
    for cand in (os.getenv("STUDIO_CATALOG"), "catalog.yaml"):
        if cand and Path(cand).is_file():
            return yaml.safe_load(Path(cand).read_text(encoding="utf-8"))
    return yaml.safe_load(PKG_CATALOG.read_text(encoding="utf-8"))


def slugify(text: str) -> str:
    tr = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
    s = re.sub(r"[^a-z0-9]+", "-", text.translate(tr).lower()).strip("-")
    return s[:40] or "proje"


class Workspace:
    """Bir projenin diskteki hali."""

    def __init__(self, ref: str | Path):
        p = Path(ref)
        direct = p.is_absolute() or len(p.parts) > 1 or (p / "project.yaml").is_file()
        self.root = p if direct else home() / p
        self.project_file = self.root / "project.yaml"
        self.state_file = self.root / "state.json"
        self.ledger_file = self.root / "ledger.jsonl"
        self.approval_file = self.root / "approval.json"

    def exists(self) -> bool:
        return self.project_file.is_file()

    def dir(self, *parts: str) -> Path:
        d = self.root.joinpath(*parts)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def rel(self, path: Path) -> str:
        return path.relative_to(self.root).as_posix()

    def abs(self, rel: str) -> Path:
        p = Path(rel)
        return p if p.is_absolute() else self.root / p

    # --- proje ---
    def load_project(self) -> Project:
        if not self.exists():
            raise FileNotFoundError(f"Proje bulunamadı: {self.project_file}")
        return Project.model_validate(yaml.safe_load(self.project_file.read_text(encoding="utf-8")))

    def save_project(self, project: Project) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        data = project.model_dump(mode="json")
        self.project_file.write_text(
            yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=100), encoding="utf-8")

    # --- durum ---
    def load_state(self) -> State:
        if self.state_file.is_file():
            return State.model_validate_json(self.state_file.read_text(encoding="utf-8"))
        return State()

    def save_state(self, state: State) -> None:
        tmp = self.state_file.with_suffix(".tmp")
        tmp.write_text(state.model_dump_json(indent=2), encoding="utf-8")
        tmp.replace(self.state_file)

    def resolve_asset(self, ref: str | None) -> Path | None:
        """Projede geçen dosya yolu: mutlak, proje klasörüne göre veya çalışma dizinine göre."""
        if not ref:
            return None
        for cand in (Path(ref), self.root / ref):
            if cand.is_file():
                return cand
        raise FileNotFoundError(f"Dosya bulunamadı: {ref}")


def read_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else default
