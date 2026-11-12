"""Sahne → video modeli istemi. Tutarlılığın ilk katmanı burada sağlanır:
karakter ve mekân tanımları her sahnede KELİMESİ KELİMESİNE aynı blokla geçer."""
from __future__ import annotations

from .models import Project, Scene

REALISM = (
    "Photorealistic. Physically accurate motion with real weight, inertia and momentum; "
    "natural human body mechanics, gait and facial micro-expressions; realistic cloth, hair, "
    "smoke and fluid dynamics; correct anatomy and hands; natural motion blur."
)
LOCK = ("Keep every character's face, hairstyle, age and outfit and the set design exactly as "
        "described, identical to the other shots of this film.")


def build_prompt(project: Project, scene: Scene, max_chars: int = 4000) -> str:
    cam = scene.camera
    chars = [project.character(c) for c in scene.characters]
    loc = project.location_of(scene)
    # Öncelik sırasıyla: sığmayan düşük öncelikli parçalar atılır.
    parts: list[str] = [
        f"{cam.shot_size}, {cam.angle} angle, camera: {cam.movement}. Lens: {cam.lens}.",
        scene.action.strip().rstrip(".") + ".",
    ]
    for c in chars:
        if c:
            wear = f", wearing {c.wardrobe}" if c.wardrobe else ""
            parts.append(f"{c.name}: {c.appearance}{wear}.")
    if loc:
        parts.append(f"Location — {loc.name}: {loc.description}.")
    if scene.lighting:
        parts.append(f"Lighting: {scene.lighting}.")
    if scene.atmosphere:
        parts.append(f"Atmosphere: {scene.atmosphere}.")
    if scene.motion:
        parts.append(f"Motion: {scene.motion}.")
    if scene.notes:
        parts.append(f"Director's note: {scene.notes}.")
    if scene.vfx:
        parts.append(f"Effects: {scene.vfx}.")
    parts.append(f"Style: {project.style.look}.")
    if chars or loc:
        parts.append(LOCK)
    parts.append(REALISM)

    out = ""
    for p in parts:
        if len(out) + len(p) + 1 > max_chars:
            continue
        out = f"{out} {p}".strip()
    return out
