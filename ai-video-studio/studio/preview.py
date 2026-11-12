"""Sahne sahne önizleme sayfası (tek HTML dosyası; tarayıcıda açılır) ve storyboard dökümü."""
from __future__ import annotations

from html import escape as e
from pathlib import Path

from .budget import Budget
from .models import Project, State
from .store import Workspace

CSS = """
:root{color-scheme:dark;--bg:#0f1115;--card:#181b22;--line:#2a2f3a;--fg:#e8eaf0;--mut:#9aa3b2;--acc:#6ea8fe;--ok:#3ecf8e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,sans-serif}
header{padding:24px 16px;border-bottom:1px solid var(--line)}h1{margin:0 0 4px;font-size:22px}
.mut{color:var(--mut)}main{max-width:1200px;margin:0 auto;padding:16px;display:grid;gap:16px}
.scene{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.scene h2{margin:0 0 8px;font-size:17px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.take{border:1px solid var(--line);border-radius:8px;padding:8px}.take.sel{border-color:var(--ok)}
video{width:100%;border-radius:6px;background:#000;max-height:420px}
.tag{display:inline-block;font-size:12px;padding:1px 8px;border-radius:99px;border:1px solid var(--line);color:var(--mut);margin-right:4px}
.sel .tag.s{color:var(--ok);border-color:var(--ok)}dl{display:grid;grid-template-columns:110px 1fr;gap:2px 12px;margin:8px 0;font-size:13px}
dt{color:var(--mut)}dd{margin:0}code{background:#0b0d11;border:1px solid var(--line);border-radius:6px;padding:2px 6px;font-size:12.5px;user-select:all;word-break:break-all}
audio{width:100%;height:32px;margin-top:4px}details{margin-top:8px;font-size:13px}
"""


def build_preview(ws: Workspace, project: Project, state: State) -> Path:
    name = ws.root.name
    body = [f"<header><h1>{e(project.title)}</h1><div class=mut>{e(project.logline)}</div>"
            f"<div class=mut>{project.aspect} · {project.resolution} · {project.fps} fps · "
            f"şimdiye kadarki tahmini harcama: ${Budget(ws).spent():.2f}</div></header><main>"]
    for i, s in enumerate(project.scenes, 1):
        st = state.of(s.id)
        loc = project.location_of(s)
        body.append(f"<section class=scene><h2>{i}. {e(s.title)} <span class=mut>· {s.id} · {s.duration:g} sn</span></h2>")
        body.append("<dl>"
                    f"<dt>Aksiyon</dt><dd>{e(s.action)}</dd>"
                    f"<dt>Kamera</dt><dd>{e(s.camera.shot_size)} · {e(s.camera.angle)} · {e(s.camera.movement)}</dd>"
                    f"<dt>Lens</dt><dd>{e(s.camera.lens)}</dd>"
                    f"<dt>Işık</dt><dd>{e(s.lighting)}</dd>"
                    f"<dt>Atmosfer</dt><dd>{e(s.atmosphere)}</dd>"
                    f"<dt>Hareket</dt><dd>{e(s.motion)}</dd>"
                    f"<dt>Mekân</dt><dd>{e(loc.name) if loc else '—'}</dd>"
                    f"<dt>Karakterler</dt><dd>{e(', '.join(s.characters)) or '—'}</dd>"
                    f"<dt>Seslendirme</dt><dd>{e(s.narration) or '—'}</dd>"
                    f"<dt>Geçiş</dt><dd>{e(s.transition.type)}</dd></dl>")
        if st.vo:
            body.append(f"<div class=mut>Seslendirme ({st.vo_duration:.1f} sn)</div><audio controls src='../{e(st.vo)}'></audio>")
        if st.amb:
            body.append(f"<div class=mut>Ortam sesi</div><audio controls src='../{e(st.amb)}'></audio>")
        if st.takes:
            body.append("<div class=grid style='margin-top:12px'>")
            for t in st.takes:
                sel = t.n == st.selected
                body.append(
                    f"<div class='take{' sel' if sel else ''}'><video controls preload=metadata src='../{e(t.file)}'></video>"
                    f"<div><span class='tag s'>{'✓ seçili' if sel else f'çekim {t.n}'}</span>"
                    f"<span class=tag>{e(t.provider)}/{e(t.model)}</span><span class=tag>{t.resolution}</span>"
                    f"<span class=tag>${t.usd:.2f}</span></div>"
                    + (f"<div class=mut>Not: {e(t.note)}</div>" if t.note else "")
                    + ("" if sel else f"<div>Bunu seç: <code>studio select {name} {s.id} {t.n}</code></div>")
                    + f"<details><summary>İstem</summary>{e(t.prompt)}</details></div>")
            body.append("</div>")
        else:
            body.append("<div class=mut>Henüz çekim yok.</div>")
        body.append(f"<div style='margin-top:10px'>Beğenmediniz mi? "
                    f"<code>studio regen {name} {s.id} --note \"ne değişsin\"</code></div></section>")
    body.append("</main>")
    out = ws.dir("preview") / "index.html"
    out.write_text(f"<!doctype html><html lang=tr><meta charset=utf-8>"
                   f"<meta name=viewport content='width=device-width,initial-scale=1'>"
                   f"<title>{e(project.title)} — önizleme</title><style>{CSS}</style>{''.join(body)}</html>",
                   encoding="utf-8")
    return out


def storyboard_markdown(project: Project) -> str:
    md = [f"# {project.title}", "", project.logline, "",
          f"**Format:** {project.aspect} · {project.resolution} · {project.fps} fps  ",
          f"**Görsel stil:** {project.style.look}", "", "## Karakterler"]
    for c in project.characters:
        md.append(f"- **{c.name}** (`{c.id}`): {c.appearance} — *{c.wardrobe}*")
    md += ["", "## Mekânlar"]
    for l in project.locations:
        md.append(f"- **{l.name}** (`{l.id}`): {l.description}")
    md += ["", "## Sahneler"]
    for i, s in enumerate(project.scenes, 1):
        md += [f"### {i}. {s.title} ({s.duration:g} sn)",
               f"- **Aksiyon:** {s.action}",
               f"- **Kamera:** {s.camera.shot_size}, {s.camera.angle}, {s.camera.movement}",
               f"- **Lens:** {s.camera.lens}",
               f"- **Işık:** {s.lighting}",
               f"- **Atmosfer:** {s.atmosphere}",
               f"- **Hareket:** {s.motion}",
               f"- **Efekt:** {s.vfx or '—'}",
               f"- **Seslendirme:** {s.narration or '—'}",
               f"- **Ortam sesi:** {s.ambience or '—'}",
               f"- **Geçiş:** {s.transition.type}", ""]
    return "\n".join(md)
