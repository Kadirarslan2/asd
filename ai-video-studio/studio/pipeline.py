"""Üretim hattı: planlanan işleri (video + ses) çalıştırır. Her ücretli istekten önce
Budget.consume() çağrılır; onaysız iş çalışmaz."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Callable

from . import post
from .audio import ElevenLabs, MockAudio
from .budget import Budget, Job
from .models import Project, Scene, State, Take
from .plan import PlanError, VideoPlan
from .prompting import build_prompt
from .providers import GenRequest, ProviderError, get_provider
from .store import Workspace

Tick = Callable[[str], None]


def _inputs(ws: Workspace, project: Project, state: State, scene: Scene, plan: VideoPlan) -> dict:
    image = last = video = None
    refs: list[Path] = []
    if plan.mode == "image":
        idx = project.scenes.index(scene)
        if scene.chain_from_previous and idx > 0:
            prev = project.scenes[idx - 1]
            take = state.of(prev.id).selected_take()
            if not take:
                raise PlanError(f"{scene.id}: önceki sahneye ({prev.id}) zincirli; önce o üretilmeli")
            image = post.last_frame(ws.abs(take.file), ws.dir("work", "frames") / f"{prev.id}_last.png")
        else:
            image = ws.resolve_asset(scene.input_image)
            if not image:
                raise PlanError(f"{scene.id}: mode=image için input_image gerekli")
        last = ws.resolve_asset(scene.last_image)
    elif plan.mode == "video":
        video = ws.resolve_asset(scene.input_video)
        if not video:
            raise PlanError(f"{scene.id}: mode=video için input_video gerekli")
    if plan.mode != "image" and plan.mcfg.get("references", 0):
        pool = [r for c in scene.characters if (ch := project.character(c)) for r in ch.reference_images]
        loc = project.location_of(scene)
        pool += loc.reference_images if loc else []
        refs = [ws.resolve_asset(r) for r in pool][: plan.mcfg["references"]]
    return {"image": image, "last_image": last, "video": video, "references": refs}


def run_video(ws: Workspace, project: Project, state: State, catalog: dict, scene: Scene,
              job: Job, plan: VideoPlan, budget: Budget, note: str = "", tick: Tick | None = None) -> Take:
    st = state.of(scene.id)
    n = len(st.takes) + 1
    out = ws.dir("scenes", scene.id) / f"take{n:02d}.mp4"
    pcfg = catalog["video"][plan.provider]
    prompt = build_prompt(project, scene, pcfg.get("max_prompt_chars", 2000))
    seed = scene.seed if scene.seed is not None else project.seed
    if seed is not None and n > 1:
        seed += n - 1               # yeniden üretimde farklı sonuç için
    req = GenRequest(prompt=prompt, negative=project.negative_prompt, mode=plan.mode,
                     aspect=plan.aspect, resolution=plan.resolution, duration=plan.duration,
                     seed=seed, upscale_4k=plan.upscale, label=f"{scene.id} · {scene.title} · çekim {n}",
                     **_inputs(ws, project, state, scene, plan))
    provider = get_provider(plan.provider, catalog)

    if not st.pending:
        budget.require(job)                           # <-- onay kapısı: her sağlayıcı için
    if provider.local:                                # yerel/ücretsiz üretici (mock)
        provider.render(req, out)
        budget.consume(job)
    else:
        if miss := provider.missing_keys():
            raise ProviderError(f"{plan.provider}: API anahtarı eksik: {', '.join(miss)} (.env dosyasına ekleyin)")
        pend = st.pending
        if not pend:
            task = provider.submit(req, plan.mcfg)
            budget.consume(job)
            pend = st.pending = {"key": job.key, "task": task, "stage": "gen", "usd": job.usd,
                                 "upscale": plan.upscale}
            ws.save_state(state)                      # görev kimliğini hemen kaydet
        wait = lambda label: provider.wait(  # noqa: E731
            pend["task"], tick=(lambda t: tick(f"{label} {int(t)} sn")) if tick else None)
        url = wait("üretiliyor")
        if pend.get("upscale") and pend["stage"] == "gen":
            pend.update(task=provider.upscale(url), stage="upscale")
            ws.save_state(state)
            url = wait("4K yükseltiliyor")
        provider.download(url, out)

    usd = (st.pending or {}).get("usd", job.usd)
    take = Take(n=n, file=ws.rel(out), provider=plan.provider, model=plan.model,
                duration=post.probe(out)["duration"], resolution=plan.resolution, usd=usd,
                prompt=prompt, created=datetime.now().isoformat(timespec="seconds"), note=note)
    st.takes.append(take)
    st.selected = n
    st.pending = None
    ws.save_state(state)
    return take


def run_audio(ws: Workspace, project: Project, state: State, catalog: dict, job: Job,
              budget: Budget, mock: bool = False) -> Path:
    cfg = catalog["audio"]["elevenlabs"]
    client = MockAudio(cfg) if mock else ElevenLabs(cfg)
    if miss := client.missing_keys():
        raise ProviderError(f"elevenlabs: API anahtarı eksik: {', '.join(miss)} (.env dosyasına ekleyin)")
    scene = project.scene(job.scene_id)
    st = state.of(scene.id)
    if job.kind == "vo" and not mock and not job.detail["voice"]:
        raise PlanError("Seslendirme için ses seçilmemiş. `studio voices` ile bir ses bulun ve "
                        "project.yaml → audio.voice_id alanına yazın.")
    budget.require(job)                               # <-- onay kapısı
    if job.kind == "vo":
        out = ws.dir("audio") / f"{scene.id}_vo.mp3"
        client.tts(scene.narration.strip(), job.detail["voice"], job.detail["model"], out, project.language)
        budget.consume(job)
        st.vo, st.vo_key, st.vo_duration = ws.rel(out), job.key, post.probe(out)["duration"]
    else:
        out = ws.dir("audio") / f"{scene.id}_amb.mp3"
        client.sfx(scene.ambience.strip(), job.detail["seconds"], out)
        budget.consume(job)
        st.amb, st.amb_key = ws.rel(out), job.key
    ws.save_state(state)
    return out
