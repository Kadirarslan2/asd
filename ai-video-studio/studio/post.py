"""FFmpeg post prodüksiyon: sahneleri ortak formata getirme, renk düzenleme, efektler,
geçişler, ses miksajı (seslendirme + ortam + müzik + ducking + loudnorm) ve dışa aktarım."""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .models import DIMENSIONS, Project, State, Style
from .store import Workspace


class FFmpegError(Exception):
    pass


GRADES = {
    "neutral": "",
    "cinematic": "eq=contrast=1.08:saturation=1.06:gamma=0.97,"
                 "colorbalance=rs=-0.05:bs=0.06:rh=0.05:bh=-0.05,curves=preset=medium_contrast",
    "warm": "eq=contrast=1.04:saturation=1.12,colorbalance=rm=0.06:bm=-0.06:rh=0.04:bh=-0.04",
    "cold_noir": "eq=contrast=1.2:saturation=0.5:brightness=-0.02,colorbalance=bs=0.08:bm=0.04",
    "vibrant": "eq=contrast=1.06:saturation=1.3",
}


def run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode != 0:
        raise FFmpegError(f"ffmpeg hatası:\n{p.stderr[-1500:]}")


def probe(path: Path) -> dict:
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "format=duration:stream=codec_type,width,height", "-of", "json", str(path)],
                       capture_output=True, text=True)
    if p.returncode != 0:
        raise FFmpegError(f"ffprobe okuyamadı: {path}: {p.stderr[-300:]}")
    d = json.loads(p.stdout)
    v = next((s for s in d["streams"] if s["codec_type"] == "video"), {})
    return {
        "duration": float(d["format"].get("duration", 0)),
        "has_audio": any(s["codec_type"] == "audio" for s in d["streams"]),
        "width": v.get("width"), "height": v.get("height"),
    }


def last_frame(video: Path, out: Path) -> Path:
    """Sahne zincirleme için klibin son karesi."""
    out.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-y", "-v", "error", "-sseof", "-0.2", "-i", str(video),
         "-frames:v", "1", "-update", "1", "-q:v", "2", str(out)])
    return out


def _esc(path: Path) -> str:
    return path.resolve().as_posix().replace(":", r"\:").replace("'", r"\'")


def look_filters(style: Style, ws: Workspace | None = None) -> list[str]:
    if style.grade not in GRADES:
        raise FFmpegError(f"Bilinmeyen renk profili: {style.grade} (mevcut: {', '.join(GRADES)})")
    f = [GRADES[style.grade]] if GRADES[style.grade] else []
    if style.lut:
        lut = ws.resolve_asset(style.lut) if ws else Path(style.lut)
        f.append(f"lut3d=file='{_esc(lut)}'")
    if style.sharpen:
        f.append("unsharp=5:5:0.6:5:5:0.0")
    if style.grain:
        f.append(f"noise=alls={int(style.grain)}:allf=t+u")
    if style.vignette:
        f.append("vignette=PI/5")
    return f


def normalize(src: Path, out: Path, w: int, h: int, fps: int, duration: float,
              looks: list[str]) -> Path:
    """Klibi hedef çerçeveye doldur-kırp, fps'i eşitle, renk/efekt uygula, süreyi kesinleştir
    (kısa kalırsa son kare dondurulur)."""
    vf = [f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos", f"crop={w}:{h}",
          f"fps={fps}", *looks, "tpad=stop_mode=clone:stop_duration=60",
          f"trim=duration={duration:.3f}", "setpts=PTS-STARTPTS", "setsar=1", "format=yuv420p"]
    out.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-vf", ",".join(vf), "-an",
         "-c:v", "libx264", "-preset", "fast", "-crf", "12", str(out)])
    return out


@dataclass
class Slot:
    scene_id: str
    clip: Path
    start: float
    duration: float
    transition: str          # bir sonraki sahneye
    xdur: float


def timeline(durations: list[float], transitions: list[tuple[str, float]]) -> list[tuple[float, float]]:
    """Her sahnenin başlangıcı ve (bir sonrakine) geçiş süresi. Çapraz geçişler üst üste biner."""
    starts, out = 0.0, []
    for i, d in enumerate(durations):
        ttype, xd = transitions[i]
        if i == len(durations) - 1 or ttype == "cut":
            xd = 0.0
        else:
            xd = max(0.1, min(xd, d / 2, durations[i + 1] / 2))
        out.append((round(starts, 3), round(xd, 3)))
        starts += d - xd
    return out


def _ts(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def render(ws: Workspace, project: Project, state: State, aspect: str | None = None,
           resolution: str | None = None, out: Path | None = None) -> Path:
    aspect = aspect or project.aspect
    resolution = resolution or project.resolution
    w, h = DIMENSIONS[(aspect, resolution)]
    fps, au = project.fps, project.audio
    looks = look_filters(project.style, ws)
    work = ws.dir("work", f"{aspect.replace(':', 'x')}_{resolution}")

    # 1) sahneleri normalize et
    durations, srcs = [], []
    for s in project.scenes:
        st = state.of(s.id)
        take = st.selected_take()
        if not take:
            raise FFmpegError(f"{s.id} için seçili çekim yok. Önce:  studio generate")
        d = s.duration
        if au.fit_to_voice and st.vo and st.vo_duration + 0.4 > d:
            d = st.vo_duration + 0.4
        durations.append(round(d, 3))
        srcs.append(ws.abs(take.file))
    tl = timeline(durations, [(s.transition.type, s.transition.duration) for s in project.scenes])
    slots: list[Slot] = []
    for s, src, d, (start, xd) in zip(project.scenes, srcs, durations, tl):
        clip = normalize(src, work / f"{s.id}.mp4", w, h, fps, d, looks)
        slots.append(Slot(s.id, clip, start, d, s.transition.type, xd))
    total = slots[-1].start + slots[-1].duration

    # 2) filtre grafiği: video geçişleri
    cmd = ["ffmpeg", "-y", "-v", "error"]
    for sl in slots:
        cmd += ["-i", str(sl.clip)]
    fc: list[str] = []
    cur = "0:v"
    for i in range(1, len(slots)):
        prev = slots[i - 1]
        if prev.xdur > 0:
            fc.append(f"[{cur}][{i}:v]xfade=transition={prev.transition}:duration={prev.xdur}:"
                      f"offset={slots[i].start}[v{i}]")
        else:
            fc.append(f"[{cur}][{i}:v]concat=n=2:v=1:a=0[v{i}]")
        cur = f"v{i}"
    fc.append(f"[{cur}]format=yuv420p[vout]")

    # 3) ses kanalları
    n_in = len(slots)
    fmt = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo"
    vo_lbl, bed_lbl = [], []

    def add_input(args: list[str]) -> int:
        nonlocal n_in
        cmd.extend(args)
        n_in += 1
        return n_in - 1

    for s, sl, src in zip(project.scenes, slots, srcs):
        st = state.of(s.id)
        ms = int(sl.start * 1000)
        if st.vo:
            i = add_input(["-i", str(ws.abs(st.vo))])
            fc.append(f"[{i}:a]{fmt},volume={au.narration_volume},adelay={ms}:all=1[vo{i}]")
            vo_lbl.append(f"[vo{i}]")
        if st.amb and au.ambience_volume > 0:
            i = add_input(["-stream_loop", "-1", "-i", str(ws.abs(st.amb))])
            fo = max(sl.duration - 0.4, 0)
            fc.append(f"[{i}:a]{fmt},atrim=duration={sl.duration},afade=t=in:d=0.3,"
                      f"afade=t=out:st={fo:.3f}:d=0.4,volume={au.ambience_volume},adelay={ms}:all=1[am{i}]")
            bed_lbl.append(f"[am{i}]")
        if au.clip_audio_volume > 0 and probe(src)["has_audio"]:
            i = add_input(["-i", str(src)])
            fo = max(sl.duration - 0.25, 0)
            fc.append(f"[{i}:a]{fmt},atrim=duration={sl.duration},afade=t=in:d=0.15,"
                      f"afade=t=out:st={fo:.3f}:d=0.25,volume={au.clip_audio_volume},adelay={ms}:all=1[ca{i}]")
            bed_lbl.append(f"[ca{i}]")

    buses: list[str] = []
    if vo_lbl:
        fc.append(f"{''.join(vo_lbl)}amix=inputs={len(vo_lbl)}:normalize=0:duration=longest[vobus]")
    if au.music:
        i = add_input(["-stream_loop", "-1", "-i", str(ws.resolve_asset(au.music))])
        fo = max(total - 1.5, 0)
        fc.append(f"[{i}:a]{fmt},atrim=duration={total:.3f},volume={au.music_volume},"
                  f"afade=t=in:d=0.8,afade=t=out:st={fo:.3f}:d=1.5[mus]")
        if vo_lbl and au.ducking:
            fc.append("[vobus]asplit=2[vomix][vokey]")
            fc.append("[mus][vokey]sidechaincompress=threshold=0.03:ratio=8:attack=30:release=500[musd]")
            buses += ["[vomix]", "[musd]"]
        else:
            buses += (["[vobus]"] if vo_lbl else []) + ["[mus]"]
    elif vo_lbl:
        buses.append("[vobus]")
    buses += bed_lbl
    if buses:
        fc.append(f"{''.join(buses)}amix=inputs={len(buses)}:normalize=0:duration=longest,"
                  f"apad,atrim=duration={total:.3f},loudnorm=I={au.lufs}:TP=-1.5:LRA=11,"
                  f"aresample=48000[aout]")
    else:
        fc.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={total:.3f}[aout]")

    out = out or ws.dir("output") / f"{ws.root.name}_{aspect.replace(':', 'x')}_{resolution}.mp4"
    cmd += ["-filter_complex", ";".join(fc), "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "medium" if resolution == "4k" else "slow", "-crf", "17",
            "-pix_fmt", "yuv420p", "-r", str(fps), "-c:a", "aac", "-b:a", "256k",
            "-movflags", "+faststart", "-t", f"{total:.3f}", str(out)]
    run(cmd)

    # 4) altyazı (SRT) — seslendirme metinlerinden
    lines, n = [], 0
    for s, sl in zip(project.scenes, slots):
        st = state.of(s.id)
        if s.narration.strip():
            n += 1
            end = sl.start + min(sl.duration, st.vo_duration or sl.duration)
            lines.append(f"{n}\n{_ts(sl.start)} --> {_ts(end)}\n{s.narration.strip()}\n")
    if lines:
        out.with_suffix(".srt").write_text("\n".join(lines), encoding="utf-8")
    return out
