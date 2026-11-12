"""Veri modelleri: proje (senaryo + storyboard) ve üretim durumu."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Aspect = Literal["16:9", "9:16", "1:1"]
Resolution = Literal["720p", "1080p", "4k"]
Mode = Literal["text", "image", "video"]

DIMENSIONS: dict[tuple[str, str], tuple[int, int]] = {
    ("16:9", "720p"): (1280, 720), ("16:9", "1080p"): (1920, 1080), ("16:9", "4k"): (3840, 2160),
    ("9:16", "720p"): (720, 1280), ("9:16", "1080p"): (1080, 1920), ("9:16", "4k"): (2160, 3840),
    ("1:1", "720p"): (720, 720), ("1:1", "1080p"): (1080, 1080), ("1:1", "4k"): (2160, 2160),
}
RES_ORDER = ["720p", "1080p", "4k"]


class Camera(BaseModel):
    shot_size: str = "medium shot"
    angle: str = "eye level"
    movement: str = "slow dolly in"
    lens: str = "35mm, f/2.0, shallow depth of field"


class Transition(BaseModel):
    """Bir sonraki sahneye geçiş. type: 'cut' veya FFmpeg xfade adı (fade, dissolve,
    wipeleft, slideup, circleopen, fadeblack, smoothleft ...)."""
    type: str = "cut"
    duration: float = 0.5


class Character(BaseModel):
    id: str
    name: str
    appearance: str = Field(description="Yüz, yaş, saç, ten, vücut — her sahnede aynen kullanılır")
    wardrobe: str = Field(default="", description="Kıyafet — her sahnede aynen kullanılır")
    voice_id: Optional[str] = None
    reference_images: list[str] = []


class Location(BaseModel):
    id: str
    name: str
    description: str
    reference_images: list[str] = []


class Scene(BaseModel):
    id: str
    title: str
    duration: float = 5.0
    location: Optional[str] = None
    characters: list[str] = []
    action: str
    camera: Camera = Camera()
    lighting: str = ""
    atmosphere: str = ""
    motion: str = ""
    vfx: str = ""
    narration: str = ""              # Türkçe seslendirme metni
    speaker: Optional[str] = None    # karakter id'si; boşsa anlatıcı sesi
    ambience: str = ""               # ortam sesi tarifi (İngilizce önerilir)
    transition: Transition = Transition()
    mode: Mode = "text"
    input_image: Optional[str] = None   # mode=image için ilk kare
    last_image: Optional[str] = None    # destekleyen modellerde son kare
    input_video: Optional[str] = None   # mode=video için referans video
    chain_from_previous: bool = False   # önceki sahnenin son karesini ilk kare yap
    provider: Optional[str] = None      # sahneye özel sağlayıcı
    model: Optional[str] = None
    seed: Optional[int] = None
    notes: str = ""                     # yönetmen notu (yeniden üretimde eklenir)


class Style(BaseModel):
    look: str = "cinematic, photorealistic, shot on ARRI Alexa, natural film color"
    grade: str = "cinematic"         # neutral | cinematic | warm | cold_noir | vibrant
    lut: Optional[str] = None        # .cube LUT dosyası
    grain: int = 0                   # 0-20 film greni
    vignette: bool = False
    sharpen: bool = False


class AudioConfig(BaseModel):
    voice_id: Optional[str] = None
    tts_model: Optional[str] = None
    narration_volume: float = 1.0
    ambience_volume: float = 0.35
    clip_audio_volume: float = 0.0   # modelin ürettiği ses (Veo) — 0 = kapalı
    music: Optional[str] = None      # arka plan müziği dosyası
    music_volume: float = 0.25
    ducking: bool = True             # seslendirme sırasında müziği kıs
    lufs: float = -14.0
    fit_to_voice: bool = True        # seslendirme uzunsa sahneyi son karede uzat


class Project(BaseModel):
    title: str
    logline: str = ""
    language: str = "tr"
    aspect: Aspect = "16:9"
    resolution: Resolution = "1080p"
    fps: int = 24
    provider: str = "veo"
    model: Optional[str] = None
    seed: Optional[int] = None
    negative_prompt: str = (
        "morphing, warping, extra limbs, deformed hands, distorted face, flicker, jitter, "
        "text, watermark, logo, cartoon, low quality, floating objects, unnatural motion"
    )
    style: Style = Style()
    audio: AudioConfig = AudioConfig()
    characters: list[Character] = []
    locations: list[Location] = []
    scenes: list[Scene] = []

    def scene(self, ref: str) -> Scene:
        """'3', 's03' veya sahne id'si ile sahne bul."""
        for i, s in enumerate(self.scenes, 1):
            if ref == s.id or ref == str(i):
                return s
        raise KeyError(f"Sahne bulunamadı: {ref} (mevcut: {', '.join(s.id for s in self.scenes)})")

    def character(self, cid: str) -> Character | None:
        return next((c for c in self.characters if c.id == cid), None)

    def location_of(self, scene: Scene) -> Location | None:
        return next((l for l in self.locations if l.id == scene.location), None)


# ---- üretim durumu (state.json) -------------------------------------------

class Take(BaseModel):
    n: int
    file: str
    provider: str
    model: str
    duration: float
    resolution: str
    usd: float
    prompt: str
    created: str
    note: str = ""


class SceneState(BaseModel):
    takes: list[Take] = []
    selected: Optional[int] = None
    pending: Optional[dict] = None   # yarıda kalan ücretli iş (task_id) — tekrar ödememek için
    vo: Optional[str] = None
    vo_key: Optional[str] = None
    vo_duration: float = 0.0
    amb: Optional[str] = None
    amb_key: Optional[str] = None

    def selected_take(self) -> Take | None:
        return next((t for t in self.takes if t.n == self.selected), None)


class State(BaseModel):
    scenes: dict[str, SceneState] = {}

    def of(self, sid: str) -> SceneState:
        return self.scenes.setdefault(sid, SceneState())
