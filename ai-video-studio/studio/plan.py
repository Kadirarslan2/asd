"""Planlama: her sahne için hangi model, mod, süre ve çözünürlükle üretileceğini ve
bunun tahmini maliyetini hesaplar. Hiçbir ağ isteği yapmaz."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from .budget import Job
from .models import RES_ORDER, Project, Scene, State


class PlanError(Exception):
    pass


@dataclass
class VideoPlan:
    provider: str
    model: str
    mcfg: dict
    mode: str
    aspect: str
    resolution: str
    duration: int
    usd: float
    upscale: bool = False
    notes: list[str] = field(default_factory=list)


def effective_mode(project: Project, scene: Scene) -> str:
    if scene.chain_from_previous and project.scenes.index(scene) > 0:
        return "image"
    return scene.mode


def plan_video(project: Project, scene: Scene, catalog: dict,
               provider: str | None = None, model: str | None = None) -> VideoPlan:
    pname = provider or scene.provider or project.provider
    if pname not in catalog["video"]:
        raise PlanError(f"Bilinmeyen sağlayıcı: {pname}")
    pcfg = catalog["video"][pname]
    mname = (model or (scene.model if not provider else None)
             or (project.model if pname == project.provider else None) or pcfg["default_model"])
    if mname not in pcfg["models"]:
        raise PlanError(f"{pname}: bilinmeyen model '{mname}' (mevcut: {', '.join(pcfg['models'])})")
    notes: list[str] = []
    mode = effective_mode(project, scene)
    m = pcfg["models"][mname]
    if mode not in m["modes"]:
        alt = next((k for k, v in pcfg["models"].items() if mode in v["modes"]), None)
        if not alt:
            who = [f"{p}/{k}" for p, c in catalog["video"].items() if p != "mock"
                   for k, v in c["models"].items() if mode in v["modes"]]
            raise PlanError(f"{scene.id}: {pname} '{mode}' modunu desteklemiyor. Destekleyenler: {', '.join(who)}")
        notes.append(f"{mname} '{mode}' modunu desteklemediği için {alt} kullanılacak")
        mname, m = alt, pcfg["models"][alt]

    aspect = project.aspect
    if aspect not in m["aspects"]:
        aspect = "16:9" if "16:9" in m["aspects"] else m["aspects"][0]
        notes.append(f"model {project.aspect} üretmiyor; {aspect} üretilip kurguda {project.aspect} olarak kırpılacak")

    allowed = sorted(m["durations"])
    duration = next((d for d in allowed if d >= scene.duration - 1e-6), None)
    if duration is None:
        raise PlanError(f"{scene.id}: {scene.duration:g} sn, {mname} için fazla uzun "
                        f"(en çok {allowed[-1]} sn). Sahneyi bölün.")

    target = project.resolution
    usable = [r for r in RES_ORDER if r in m["resolutions"] and RES_ORDER.index(r) <= RES_ORDER.index(target)]
    resolution = usable[-1] if usable else sorted(m["resolutions"], key=RES_ORDER.index)[0]
    hires = m.get("hires_duration")
    if hires and resolution in ("1080p", "4k") and duration != hires:
        notes.append(f"{resolution} bu modelde yalnızca {hires} sn üretilir; klip {hires} sn üretilip kurguda kısaltılacak")
        duration = hires

    usd = duration * m["usd_per_sec"][resolution]
    upscale = False
    if RES_ORDER.index(resolution) < RES_ORDER.index(target):
        if target == "4k" and m.get("upscale_4k") and pcfg.get("upscale"):
            upscale = True
            usd += duration * pcfg["upscale"]["usd_per_sec"]
            notes.append(f"doğal çıktı {resolution}; sağlayıcının 4K yükselticisi kullanılacak")
        else:
            notes.append(f"doğal çıktı {resolution}; {target} çıktısı FFmpeg (lanczos) ile büyütülecek")
    if duration > scene.duration + 1e-6 and not any("kısaltılacak" in n for n in notes):
        notes.append(f"{duration} sn üretilip {scene.duration:g} sn'ye kısaltılacak")
    return VideoPlan(pname, mname, m, mode, aspect, resolution, duration, round(usd, 4), upscale, notes)


def _h(*parts) -> str:
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:10]


def video_job(project: Project, state: State, catalog: dict, scene: Scene,
              provider: str | None = None, model: str | None = None) -> tuple[Job, VideoPlan]:
    plan = plan_video(project, scene, catalog, provider, model)
    st = state.of(scene.id)
    n = len(st.takes) + 1
    if st.pending:        # ücreti ödenmiş, yarıda kalmış görev: ücretsiz devam
        return Job(st.pending["key"], "video", scene.id,
                   f"{scene.id} çekim {n} — yarıda kalan görev sürdürülecek", 0.0), plan
    key = f"video:{scene.id}:t{n}:{plan.provider}/{plan.model}:{plan.duration}s:{plan.resolution}" \
          + ("+4k" if plan.upscale else "")
    label = f"{scene.id} çekim {n} — {plan.provider}/{plan.model}, {plan.mode}, {plan.duration} sn, {plan.resolution}"
    return Job(key, "video", scene.id, label, plan.usd, notes=plan.notes), plan


def video_jobs(project: Project, state: State, catalog: dict, scenes: list[Scene] | None = None,
               provider: str | None = None) -> list[tuple[Job, VideoPlan]]:
    """Henüz çekimi olmayan sahneler için işler."""
    out = []
    for s in scenes or project.scenes:
        st = state.of(s.id)
        if st.takes and not st.pending:
            continue
        out.append(video_job(project, state, catalog, s, provider))
    return out


def audio_jobs(project: Project, state: State, catalog: dict, scenes: list[Scene] | None = None,
               mock: bool = False) -> list[Job]:
    cfg = catalog["audio"]["elevenlabs"]
    model = project.audio.tts_model or cfg["default_tts_model"]
    if not mock and model not in cfg["tts_models"]:
        raise PlanError(f"Bilinmeyen TTS modeli: {model}")
    rate = 0.0 if mock else cfg["tts_models"][model]["usd_per_1k_chars"]
    sfx_rate = 0.0 if mock else cfg["sfx"]["usd_per_sec"]
    pre = "mock-" if mock else ""
    jobs: list[Job] = []
    for s in scenes or project.scenes:
        st = state.of(s.id)
        if s.narration.strip():
            ch = project.character(s.speaker) if s.speaker else None
            voice = (ch.voice_id if ch and ch.voice_id else None) or project.audio.voice_id \
                or cfg.get("default_voice_id") or ""
            key = f"{pre}vo:{s.id}:{_h(s.narration, voice, model)}"
            if st.vo_key != key:
                n = len(s.narration)
                jobs.append(Job(key, "vo", s.id, f"{s.id} seslendirme — {n} karakter, {model}",
                                round(n / 1000 * rate, 4), {"voice": voice, "model": model}))
        if s.ambience.strip():
            dur = min(max(s.duration, 1.0), cfg["sfx"]["max_seconds"])
            key = f"{pre}amb:{s.id}:{_h(s.ambience, dur)}"
            if st.amb_key != key:
                jobs.append(Job(key, "amb", s.id, f"{s.id} ortam sesi — {dur:g} sn",
                                round(dur * sfx_rate, 4), {"seconds": dur}))
    return jobs
