"""Komut satırı arayüzü:  studio --help"""
from __future__ import annotations

import webbrowser
from pathlib import Path
from typing import Optional

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

from . import post
from .budget import ApprovalRequired, Budget, Job
from .models import DIMENSIONS, Project
from .plan import PlanError, audio_jobs, video_job, video_jobs
from .store import Workspace, home, load_catalog, slugify

load_dotenv(Path.cwd() / ".env")
app = typer.Typer(add_completion=False, no_args_is_help=True, rich_markup_mode=None,
                  help="AI Video Studio — senaryo → storyboard → video → ses → kurgu")
con = Console()
P = typer.Argument(..., help="Proje adı (projects/ altındaki klasör) veya klasör yolu")


def _fail(msg: str) -> None:
    con.print(f"[red]✗[/red] {msg}")
    raise typer.Exit(1)


def _open(ref: str) -> tuple[Workspace, Project]:
    ws = Workspace(ref)
    if not ws.exists():
        _fail(f"Proje bulunamadı: {ws.project_file}")
    return ws, ws.load_project()


def _cost_table(jobs: list[Job], title: str) -> float:
    t = Table(title=title, show_lines=False)
    t.add_column("İş")
    t.add_column("Tahmini USD", justify="right")
    t.add_column("Notlar", style="dim")
    for j in jobs:
        t.add_row(j.label, f"${j.usd:.2f}" if j.paid else "ücretsiz", "; ".join(j.notes))
    total = sum(j.usd for j in jobs)
    t.add_section()
    t.add_row("[bold]TOPLAM[/bold]", f"[bold]${total:.2f}[/bold]", "")
    con.print(t)
    return total


def _confirm(jobs: list[Job], budget: Budget, title: str) -> bool:
    """Ücretli işleri gösterir ve açık onay ister. Onaysız hiçbir ücretli iş çalışmaz."""
    need = [j for j in jobs if j.paid and not budget.is_approved(j)]
    if not need:
        return True
    total = _cost_table(need, title)
    con.print("[dim]Tutarlar catalog.yaml'daki birim fiyatlardan hesaplanan TAHMİNDİR; "
              "kesin tutarı sağlayıcı faturalandırır.[/dim]")
    try:
        ans = typer.prompt(f"Bu {len(need)} ücretli iş (~${total:.2f}) için onay veriyor musunuz? [evet/hayır]",
                           default="hayır")
    except (typer.Abort, EOFError):
        ans = "hayır"
    if ans.strip().lower() not in ("evet", "e"):
        con.print("[yellow]Onay verilmedi; ücretli hiçbir istek gönderilmedi.[/yellow]")
        return False
    budget.approve(need)
    return True


def _gather(fn):
    try:
        return fn()
    except (PlanError, FileNotFoundError, KeyError) as ex:
        _fail(str(ex).strip("'\""))


# --------------------------------------------------------------------------- sistem

@app.command()
def doctor(offline: bool = typer.Option(False, "--offline", help="Ağ erişim testini atla")):
    """Bilgisayarı ve bağımlılıkları kontrol et."""
    from .doctor import check
    icon = {"ok": "[green]✓[/green]", "warn": "[yellow]![/yellow]", "fail": "[red]✗[/red]"}
    rows = check(load_catalog(), network=not offline)
    t = Table(title="Sistem kontrolü")
    t.add_column("")
    t.add_column("Bileşen")
    t.add_column("Durum")
    for s, title, detail in rows:
        t.add_row(icon[s], title, detail)
    con.print(t)
    fails = sum(1 for r in rows if r[0] == "fail")
    con.print("[red]Zorunlu bileşenlerde eksik var.[/red]" if fails else
              "[green]Zorunlu bileşenler hazır.[/green] Sarı satırlar yalnızca ilgili servisi kullanacaksanız gerekir.")
    raise typer.Exit(1 if fails else 0)


@app.command()
def models():
    """Desteklenen video modellerini, yeteneklerini ve tahmini fiyatlarını listele."""
    cat = load_catalog()
    t = Table(title="Video modelleri (catalog.yaml)")
    for c in ("Sağlayıcı / model", "Modlar", "Oranlar", "Süre (sn)", "Çözünürlük", "USD/sn", "Ref. görsel"):
        t.add_column(c, no_wrap=c.startswith("Sağ"))
    names = {"text": "metin", "image": "görsel", "video": "video"}
    for p, pc in cat["video"].items():
        for m, mc in pc["models"].items():
            res = list(mc["resolutions"]) + (["4k↑"] if mc.get("upscale_4k") else [])
            t.add_row(f"{p} / {m}" + (" *" if m == pc["default_model"] else ""),
                      ", ".join(names[x] for x in mc["modes"]), " ".join(mc["aspects"]),
                      ", ".join(map(str, mc["durations"])), ", ".join(res),
                      ", ".join(f"{v:g}" for v in mc["usd_per_sec"].values()), str(mc.get("references", 0)))
    con.print(t)
    con.print("[dim]* varsayılan model · 4k↑ = sağlayıcı yükselticisiyle 4K · fiyatlar tahminidir[/dim]")


@app.command()
def voices(search: str = typer.Option("", help="Ada/etikete göre filtre")):
    """ElevenLabs hesabınızdaki sesleri listele (ücretsiz istek)."""
    from .audio import AudioError, ElevenLabs
    el = ElevenLabs(load_catalog()["audio"]["elevenlabs"])
    if el.missing_keys():
        _fail("ELEVENLABS_API_KEY tanımlı değil (.env dosyasına ekleyin)")
    try:
        vs = el.voices()
    except AudioError as ex:
        _fail(str(ex))
    t = Table(title="ElevenLabs sesleri")
    for c in ("voice_id", "Ad", "Etiketler"):
        t.add_column(c)
    for v in vs:
        labels = ", ".join(f"{k}={x}" for k, x in (v.get("labels") or {}).items())
        if search.lower() in (v.get("name", "") + labels).lower():
            t.add_row(v["voice_id"], v.get("name", ""), labels)
    con.print(t)


# --------------------------------------------------------------------------- senaryo

@app.command()
def new(idea: str = typer.Argument(..., help="Film fikri / brif"),
        name: Optional[str] = typer.Option(None, help="Proje klasör adı"),
        aspect: str = typer.Option("16:9", help="16:9 | 9:16 | 1:1"),
        res: str = typer.Option("1080p", help="720p | 1080p | 4k"),
        duration: float = typer.Option(30, help="Hedef toplam süre (sn)"),
        provider: str = typer.Option("veo", help="veo | runway | kling | mock"),
        model: Optional[str] = typer.Option(None, help="Sağlayıcı modeli (boşsa varsayılan)"),
        fps: int = typer.Option(24),
        offline: bool = typer.Option(False, "--offline", help="LLM kullanma; elle doldurulacak iskelet üret")):
    """Fikirden senaryo + storyboard oluştur (project.yaml)."""
    from . import script
    from .preview import storyboard_markdown
    cat = load_catalog()
    if provider not in cat["video"]:
        _fail(f"Bilinmeyen sağlayıcı: {provider}")
    pc = cat["video"][provider]
    mname = model or pc["default_model"]
    if mname not in pc["models"]:
        _fail(f"Bilinmeyen model: {mname}")
    ws = Workspace(home() / (name or slugify(idea)))
    if ws.exists():
        _fail(f"Bu adla proje zaten var: {ws.root}")
    base = dict(aspect=aspect, resolution=res, fps=fps, provider=provider, model=model)
    allowed = pc["models"][mname]["durations"]
    try:
        if offline:
            project = script.write_offline(idea, duration, allowed, **base)
        else:
            usd = cat["llm"]["usd_estimate_per_storyboard"]
            job = Job(f"llm:{ws.root.name}", "llm", "-", f"Senaryo + storyboard yazımı ({cat['llm']['model']})", usd)
            if not _confirm([job], Budget(ws), "Senaryo yazım maliyeti"):
                con.print("Ücretsiz iskelet için:  studio new \"...\" --offline")
                raise typer.Exit(1)
            with con.status("Senaryo ve storyboard yazılıyor…"):
                project = script.write_with_llm(idea, duration, allowed, model=cat["llm"]["model"], **base)
            Budget(ws).consume(job)
    except typer.Exit:
        raise
    except Exception as ex:
        _fail(f"Senaryo yazılamadı: {ex}\nAPI anahtarı olmadan denemek için --offline kullanın.")
    ws.save_project(project)
    (ws.root / "storyboard.md").write_text(storyboard_markdown(project), encoding="utf-8")
    con.print(f"[green]✓[/green] Proje oluşturuldu: {ws.root}")
    _storyboard_table(project)
    con.print(f"Düzenlemek için: {ws.project_file}\nSonraki adım:    studio estimate {ws.root.name}")


def _storyboard_table(project: Project) -> None:
    t = Table(title=f"{project.title} — storyboard", show_lines=True)
    for c in ("#", "Sahne", "sn", "Kamera / lens", "Işık · atmosfer", "Seslendirme"):
        t.add_column(c, overflow="fold")
    for i, s in enumerate(project.scenes, 1):
        t.add_row(str(i), f"[bold]{s.title}[/bold]\n{s.action}", f"{s.duration:g}",
                  f"{s.camera.shot_size}, {s.camera.angle}\n{s.camera.movement}\n{s.camera.lens}",
                  f"{s.lighting}\n{s.atmosphere}", s.narration or "—")
    con.print(t)


@app.command()
def storyboard(project: str = P):
    """Storyboard'u göster ve storyboard.md olarak kaydet."""
    from .preview import storyboard_markdown
    ws, pr = _open(project)
    _storyboard_table(pr)
    (ws.root / "storyboard.md").write_text(storyboard_markdown(pr), encoding="utf-8")
    con.print(f"Kaydedildi: {ws.root / 'storyboard.md'}")


# --------------------------------------------------------------------------- maliyet

def _pending(ws: Workspace, pr: Project, scene: Optional[str], mock: bool, what: str):
    cat, state = load_catalog(), ws.load_state()
    scenes = [pr.scene(scene)] if scene else None
    vj = video_jobs(pr, state, cat, scenes, "mock" if mock else None) if what in ("all", "video") else []
    aj = audio_jobs(pr, state, cat, scenes, mock) if what in ("all", "audio") else []
    return cat, state, vj, aj


@app.command()
def estimate(project: str = P, scene: Optional[str] = typer.Option(None, help="Yalnızca bu sahne")):
    """Bekleyen işlerin tahmini API maliyetini göster (hiçbir istek gönderilmez)."""
    ws, pr = _open(project)
    _, _, vj, aj = _gather(lambda: _pending(ws, pr, scene, False, "all"))
    jobs = [j for j, _ in vj] + aj
    if not jobs:
        con.print("Bekleyen iş yok.")
        return
    _cost_table(jobs, "Üretim öncesi maliyet tahmini")
    con.print(f"Şimdiye kadarki harcama (tahmini): ${Budget(ws).spent():.2f}\n"
              f"Onaylamak için:  studio approve {ws.root.name}")


@app.command()
def approve(project: str = P, scene: Optional[str] = typer.Option(None, help="Yalnızca bu sahne")):
    """Bekleyen ücretli işleri gösterip onayınızı al."""
    ws, pr = _open(project)
    _, _, vj, aj = _gather(lambda: _pending(ws, pr, scene, False, "all"))
    jobs = [j for j, _ in vj] + aj
    if _confirm(jobs, Budget(ws), "Onayınıza sunulan işler"):
        con.print(f"[green]✓[/green] Onaylandı. Üretim:  studio generate {ws.root.name}  ·  studio audio {ws.root.name}")


# --------------------------------------------------------------------------- üretim

def _run_videos(ws, pr, state, cat, pairs, budget, note=""):
    from .pipeline import run_video
    from .providers import ProviderError
    ok = True
    for job, plan in pairs:
        scene = pr.scene(job.scene_id)
        try:
            with con.status(f"{job.label}") as status:
                take = run_video(ws, pr, state, cat, scene, job, plan, budget, note,
                                 tick=lambda m, j=job: status.update(f"{j.label} — {m}"))
            con.print(f"[green]✓[/green] {scene.id} çekim {take.n}: {ws.abs(take.file)}")
        except (ProviderError, PlanError, ApprovalRequired, FileNotFoundError, post.FFmpegError) as ex:
            ok = False
            con.print(f"[red]✗[/red] {scene.id}: {ex}")
    return ok


def _refresh_preview(ws, pr):
    from .preview import build_preview
    out = build_preview(ws, pr, ws.load_state())
    con.print(f"Önizleme: {out.resolve()}")
    return out


@app.command()
def generate(project: str = P, scene: Optional[str] = typer.Option(None, help="Yalnızca bu sahne"),
             mock: bool = typer.Option(False, "--mock", help="Ücretsiz sahte kliplerle dene")):
    """Henüz çekimi olmayan sahnelerin videolarını üret."""
    ws, pr = _open(project)
    cat, state, vj, _ = _gather(lambda: _pending(ws, pr, scene, mock, "video"))
    if not vj:
        con.print("Tüm sahnelerin çekimi var. Yeniden üretmek için:  studio regen")
        return
    budget = Budget(ws)
    if not _confirm([j for j, _ in vj], budget, "Video üretim maliyeti"):
        raise typer.Exit(1)
    ok = _run_videos(ws, pr, state, cat, vj, budget)
    _refresh_preview(ws, pr)
    raise typer.Exit(0 if ok else 1)


@app.command()
def regen(project: str = P, scene: str = typer.Argument(..., help="Sahne no veya id (ör. 3 ya da s03)"),
          note: str = typer.Option("", help="Yönetmen notu: bu çekimde ne değişsin (İngilizce önerilir)"),
          provider: Optional[str] = typer.Option(None, help="Bu çekim için farklı sağlayıcı"),
          model: Optional[str] = typer.Option(None, help="Bu çekim için farklı model"),
          mock: bool = typer.Option(False, "--mock")):
    """Beğenmediğiniz sahneyi yeniden üret (yeni çekim eklenir, eskiler silinmez)."""
    ws, pr = _open(project)
    cat, state = load_catalog(), ws.load_state()
    sc = _gather(lambda: pr.scene(scene))
    if note:
        sc.notes = note
        ws.save_project(pr)
    pair = _gather(lambda: video_job(pr, state, cat, sc, "mock" if mock else provider, model))
    budget = Budget(ws)
    if not _confirm([pair[0]], budget, f"{sc.id} yeniden üretim maliyeti"):
        raise typer.Exit(1)
    ok = _run_videos(ws, pr, state, cat, [pair], budget, note)
    _refresh_preview(ws, pr)
    raise typer.Exit(0 if ok else 1)


@app.command()
def select(project: str = P, scene: str = typer.Argument(...), take: int = typer.Argument(...)):
    """Kurguda kullanılacak çekimi seç."""
    ws, pr = _open(project)
    state = ws.load_state()
    st = state.of(_gather(lambda: pr.scene(scene)).id)
    if take not in [t.n for t in st.takes]:
        _fail(f"Çekim {take} yok (mevcut: {[t.n for t in st.takes]})")
    st.selected = take
    ws.save_state(state)
    con.print(f"[green]✓[/green] {scene}: çekim {take} seçildi")
    _refresh_preview(ws, pr)


@app.command()
def audio(project: str = P, scene: Optional[str] = typer.Option(None),
          mock: bool = typer.Option(False, "--mock", help="Ücretsiz sahte seslerle dene")):
    """ElevenLabs ile Türkçe seslendirme ve ortam seslerini üret."""
    from .audio import AudioError
    from .pipeline import run_audio
    from .providers import ProviderError
    ws, pr = _open(project)
    cat, state, _, aj = _gather(lambda: _pending(ws, pr, scene, mock, "audio"))
    if not aj:
        con.print("Üretilecek ses yok (metinler değişmedi).")
        return
    budget = Budget(ws)
    if not _confirm(aj, budget, "Ses üretim maliyeti"):
        raise typer.Exit(1)
    ok = True
    for job in aj:
        try:
            with con.status(job.label):
                out = run_audio(ws, pr, state, cat, job, budget, mock)
            con.print(f"[green]✓[/green] {job.label}: {out}")
        except (ProviderError, AudioError, ApprovalRequired, PlanError, post.FFmpegError) as ex:
            ok = False
            con.print(f"[red]✗[/red] {job.label}: {ex}")
    for s in pr.scenes:
        st = state.of(s.id)
        if st.vo and st.vo_duration > s.duration:
            con.print(f"[yellow]![/yellow] {s.id}: seslendirme {st.vo_duration:.1f} sn, sahne {s.duration:g} sn — "
                      "kurguda sahne son karede uzatılacak (metni kısaltmak daha iyi sonuç verir)")
    _refresh_preview(ws, pr)
    raise typer.Exit(0 if ok else 1)


# --------------------------------------------------------------------------- önizleme / kurgu

@app.command()
def preview(project: str = P, open_: bool = typer.Option(False, "--open", help="Tarayıcıda aç")):
    """Sahne sahne önizleme sayfasını oluştur."""
    ws, pr = _open(project)
    out = _refresh_preview(ws, pr)
    if open_:
        webbrowser.open(out.resolve().as_uri())


@app.command()
def status(project: str = P):
    """Projenin üretim durumunu göster."""
    ws, pr = _open(project)
    state = ws.load_state()
    t = Table(title=f"{pr.title} — {pr.aspect} · {pr.resolution}")
    for c in ("Sahne", "Başlık", "Çekimler", "Seçili", "Seslendirme", "Ortam"):
        t.add_column(c)
    for s in pr.scenes:
        st = state.of(s.id)
        t.add_row(s.id, s.title, str(len(st.takes)) + (" (+yarım)" if st.pending else ""),
                  str(st.selected or "—"), f"{st.vo_duration:.1f} sn" if st.vo else "—", "✓" if st.amb else "—")
    con.print(t)
    con.print(f"Tahmini toplam harcama: ${Budget(ws).spent():.2f}")


@app.command()
def render(project: str = P,
           aspect: Optional[list[str]] = typer.Option(None, help="Çıktı oranı; birden çok kez verilebilir"),
           res: Optional[str] = typer.Option(None, help="720p | 1080p | 4k"),
           all_formats: bool = typer.Option(False, "--all-formats", help="16:9, 9:16 ve 1:1 birlikte")):
    """Sahneleri birleştir: renk, geçişler, ses miksajı → final MP4 (ücretsiz, yerel)."""
    ws, pr = _open(project)
    state = ws.load_state()
    targets = ["16:9", "9:16", "1:1"] if all_formats else (aspect or [pr.aspect])
    for a in targets:
        if (a, res or pr.resolution) not in DIMENSIONS:
            _fail(f"Geçersiz format: {a} {res or pr.resolution}")
        try:
            with con.status(f"Kurgu yapılıyor: {a} {res or pr.resolution}…"):
                out = post.render(ws, pr, state, a, res)
        except (post.FFmpegError, FileNotFoundError) as ex:
            _fail(str(ex))
        info = post.probe(out)
        con.print(f"[green]✓[/green] {out.resolve()}  ({info['width']}x{info['height']}, {info['duration']:.1f} sn)")


if __name__ == "__main__":
    app()
