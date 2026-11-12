"""Senaryo + storyboard üretimi.

- write_with_llm : Claude ile fikirden tam storyboard (ücretli, küçük tutar — onay ister)
- write_offline  : API gerektirmeyen şablon; alanları project.yaml'da elle doldurursunuz
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel

from .models import Camera, Character, Location, Project, Scene, Style, Transition

SYSTEM = """You are a senior film director, cinematographer and screenwriter preparing a \
production-ready storyboard for AI video generation (Runway, Kling, Veo).

Rules:
- `title`, `logline`, scene `title` and `narration` are written in natural, broadcast-quality \
Turkish. `narration` is voice-over text: at most 2.2 words per second of the scene's duration, \
or empty when silence serves the film better.
- Every visual field (appearance, wardrobe, location description, action, camera, lighting, \
atmosphere, motion, vfx, ambience, style look) is written in precise English, because video \
models follow English best.
- Characters: `appearance` must pin down face shape, age, skin tone, eyes, hair (color, length, \
style) and build; `wardrobe` must pin down each garment with color and material. These blocks are \
repeated verbatim in every shot to keep identity consistent, so make them specific and \
self-contained, and never restate them inside `action`.
- Locations: describe architecture, materials, palette, time of day and signature props once.
- Each scene is ONE continuous shot with ONE clear action that is physically plausible within its \
duration. Give every scene its own deliberate shot size, camera angle, camera movement, lens \
(focal length, aperture, depth of field), lighting setup, atmosphere and subject motion. Vary \
them across scenes the way a real edit would (establishing, coverage, inserts, close-ups).
- `motion` describes how bodies and objects move, with real-world weight and timing.
- `ambience` is a short English sound-effects prompt for the scene's environment (no music, no speech).
- `transition_type` is 'cut' unless a dissolve/fade is motivated; first-rate edits mostly cut.
- Scene durations must be one of the allowed values, and their sum must be close to the target.
- Refer to characters and locations by their `id` in scenes."""


class SceneDraft(BaseModel):
    title: str
    duration: float
    location: Optional[str]
    characters: list[str]
    action: str
    shot_size: str
    camera_angle: str
    camera_movement: str
    lens: str
    lighting: str
    atmosphere: str
    motion: str
    vfx: str
    narration: str
    speaker: Optional[str]
    ambience: str
    transition_type: Literal["cut", "fade", "dissolve", "fadeblack", "wipeleft", "slideleft", "circleopen"]


class CharacterDraft(BaseModel):
    id: str
    name: str
    appearance: str
    wardrobe: str


class LocationDraft(BaseModel):
    id: str
    name: str
    description: str


class StoryboardDraft(BaseModel):
    title: str
    logline: str
    style_look: str
    characters: list[CharacterDraft]
    locations: list[LocationDraft]
    scenes: list[SceneDraft]


def _to_project(d: StoryboardDraft, **base) -> Project:
    scenes = [
        Scene(id=f"s{i:02d}", title=s.title, duration=s.duration, location=s.location,
              characters=s.characters, action=s.action,
              camera=Camera(shot_size=s.shot_size, angle=s.camera_angle,
                            movement=s.camera_movement, lens=s.lens),
              lighting=s.lighting, atmosphere=s.atmosphere, motion=s.motion, vfx=s.vfx,
              narration=s.narration, speaker=s.speaker, ambience=s.ambience,
              transition=Transition(type=s.transition_type))
        for i, s in enumerate(d.scenes, 1)
    ]
    return Project(title=d.title, logline=d.logline, style=Style(look=d.style_look),
                   characters=[Character(**c.model_dump()) for c in d.characters],
                   locations=[Location(**l.model_dump()) for l in d.locations],
                   scenes=scenes, **base)


def write_with_llm(idea: str, total_seconds: float, allowed_durations: list[int],
                   model: str = "claude-opus-5-5", **base) -> Project:
    import anthropic

    client = anthropic.Anthropic()
    user = (f"Film idea (may be in Turkish):\n{idea}\n\n"
            f"Target total duration: {total_seconds:g} seconds.\n"
            f"Allowed scene durations (seconds): {allowed_durations}.\n"
            f"Delivery aspect ratio: {base.get('aspect', '16:9')} — compose every shot for it.\n"
            "Write the complete storyboard.")
    with client.beta.messages.stream(
        model=model,
        max_tokens=32000,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",            # güvenlik filtresi reddederse otomatik yedek model
        system=SYSTEM,
        messages=[{"role": "user", "content": user}],
        output_format=StoryboardDraft,
    ) as stream:
        msg = stream.get_final_message()
    if msg.stop_reason == "refusal":
        raise RuntimeError("Model bu fikri yazmayı reddetti; fikri değiştirip tekrar deneyin.")
    if msg.stop_reason == "max_tokens" or msg.parsed_output is None:
        raise RuntimeError("Storyboard tamamlanamadı (çıktı kesildi). Süreyi kısaltıp tekrar deneyin.")
    return _to_project(msg.parsed_output, **base)


_SHOTS = [
    ("extreme wide establishing shot", "high angle", "slow aerial push in", "24mm, f/8, deep focus"),
    ("medium shot", "eye level", "smooth tracking shot following the subject", "35mm, f/2.0, shallow depth of field"),
    ("close-up", "slightly low angle", "slow dolly in", "85mm, f/1.8, creamy bokeh"),
    ("insert detail shot", "top-down", "static with subtle handheld breathing", "100mm macro, f/2.8"),
    ("wide shot", "low angle", "slow crane up and pull back", "28mm, f/4"),
]


def write_offline(idea: str, total_seconds: float, allowed_durations: list[int], **base) -> Project:
    """LLM'siz iskelet: sahne sayısını ve kamera planını kurar; içerikleri siz yazarsınız."""
    per = min(allowed_durations, key=lambda d: abs(d - 5))
    count = max(1, round(total_seconds / per))
    scenes = []
    for i in range(count):
        size, angle, move, lens = _SHOTS[i % len(_SHOTS)]
        scenes.append(Scene(
            id=f"s{i + 1:02d}", title=f"Sahne {i + 1}", duration=per, location="mekan1",
            characters=["karakter1"], action=f"{idea} — (bu sahnede ne olduğunu İngilizce yazın)",
            camera=Camera(shot_size=size, angle=angle, movement=move, lens=lens),
            lighting="soft natural key light, gentle fill, motivated practicals",
            atmosphere="calm, cinematic", motion="natural, unhurried movement",
            narration="", ambience="",
        ))
    return Project(
        title=idea[:60], logline=idea,
        characters=[Character(id="karakter1", name="Karakter",
                              appearance="(yüz, yaş, saç, ten — İngilizce ve ayrıntılı)",
                              wardrobe="(kıyafet — renk ve kumaşla)")],
        locations=[Location(id="mekan1", name="Mekân", description="(mekân tarifi — İngilizce)")],
        scenes=scenes, **base)
