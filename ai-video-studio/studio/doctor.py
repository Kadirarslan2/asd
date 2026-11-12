"""Sistem ve bağımlılık kontrolü: `studio doctor`."""
from __future__ import annotations

import importlib.util
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

NEED_FILTERS = ["xfade", "amix", "loudnorm", "sidechaincompress", "eq", "colorbalance", "curves",
                "lut3d", "noise", "vignette", "unsharp", "tpad", "adelay"]
NEED_PKGS = ["httpx", "pydantic", "yaml", "typer", "rich", "dotenv"]
HOSTS = {"Runway": "api.dev.runwayml.com", "Kling": "api-singapore.klingai.com",
         "Veo (Gemini)": "generativelanguage.googleapis.com", "ElevenLabs": "api.elevenlabs.io",
         "Anthropic": "api.anthropic.com"}


def _out(cmd: list[str]) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=20).stdout
    except Exception:
        return ""


def _ram_gb() -> float | None:
    try:
        if hasattr(os, "sysconf") and "SC_PHYS_PAGES" in os.sysconf_names:
            return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 2**30
        import ctypes

        class M(ctypes.Structure):
            _fields_ = [("l", ctypes.c_ulong), ("m", ctypes.c_ulong)] + \
                       [(n, ctypes.c_ulonglong) for n in "abcdefg"]
        m = M()
        m.l = ctypes.sizeof(M)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
        return m.a / 2**30
    except Exception:
        return None


def check(catalog: dict, network: bool = True) -> list[tuple[str, str, str]]:
    """(durum, başlık, ayrıntı) satırları. durum: ok | warn | fail"""
    rows: list[tuple[str, str, str]] = []
    add = lambda s, t, d: rows.append((s, t, d))  # noqa: E731

    add("ok", "İşletim sistemi", f"{platform.system()} {platform.release()} ({platform.machine()})")
    v = sys.version_info
    add("ok" if v >= (3, 10) else "fail", "Python", f"{v.major}.{v.minor}.{v.micro}" + ("" if v >= (3, 10) else " — 3.10+ gerekli"))
    add("ok", "CPU çekirdeği", str(os.cpu_count()))
    ram = _ram_gb()
    if ram:
        add("ok" if ram >= 8 else "warn", "RAM", f"{ram:.0f} GB" + ("" if ram >= 8 else " — 4K kurgu için 8 GB+ önerilir"))
    free = shutil.disk_usage(Path.cwd()).free / 2**30
    add("ok" if free >= 10 else "warn", "Boş disk", f"{free:.0f} GB" + ("" if free >= 10 else " — 10 GB+ önerilir"))

    for pkg in NEED_PKGS:
        ok = importlib.util.find_spec(pkg) is not None
        add("ok" if ok else "fail", f"Python paketi: {pkg}", "kurulu" if ok else "eksik —  pip install -e .")
    ok = importlib.util.find_spec("anthropic") is not None
    add("ok" if ok else "warn", "Python paketi: anthropic", "kurulu" if ok else "yok — yalnızca otomatik senaryo yazımı için gerekli")

    hint = {"Windows": "winget install Gyan.FFmpeg", "Darwin": "brew install ffmpeg"}.get(
        platform.system(), "sudo apt install ffmpeg")
    for tool in ("ffmpeg", "ffprobe"):
        path = shutil.which(tool)
        ver = (_out([tool, "-version"]).splitlines() or [""])[0].replace(" Copyright", "")[:60] if path else ""
        add("ok" if path else "fail", tool, ver if path else f"bulunamadı —  {hint}")
    if shutil.which("ffmpeg"):
        filters = _out(["ffmpeg", "-hide_banner", "-filters"])
        have = {l.split()[1] for l in filters.splitlines() if len(l.split()) > 2}
        miss = [f for f in NEED_FILTERS if f not in have]
        add("ok" if not miss else "fail", "FFmpeg filtreleri", "tamam" if not miss else "eksik: " + ", ".join(miss))
        enc = _out(["ffmpeg", "-hide_banner", "-encoders"])
        add("ok" if "libx264" in enc else "fail", "H.264 kodlayıcı (libx264)", "var" if "libx264" in enc else "yok — tam (full) FFmpeg sürümü kurun")
        hw = [h for h in ("h264_nvenc", "h264_videotoolbox", "h264_qsv", "h264_amf") if h in enc]
        add("ok", "Donanım kodlayıcı", ", ".join(hw) or "yok (gerekli değil)")
        dt = "drawtext" in have
        add("ok" if dt else "warn", "drawtext (mock etiketleri)", "var" if dt else "yok — mock klipler yazısız olur")

    groups = {f"Video: {n}": c.get("env", []) for n, c in catalog["video"].items() if n != "mock"}
    groups["Ses: elevenlabs"] = catalog["audio"]["elevenlabs"]["env"]
    groups["Senaryo: anthropic"] = ["ANTHROPIC_API_KEY"]
    for title, envs in groups.items():
        miss = [x for x in envs if not os.getenv(x)]
        add("ok" if not miss else "warn", f"API anahtarı — {title}",
            "tanımlı" if not miss else f"eksik: {', '.join(miss)}")

    if network:
        import httpx
        for name, host in HOSTS.items():
            try:
                httpx.get(f"https://{host}/", timeout=6)
                add("ok", f"Ağ erişimi — {name}", host)
            except Exception as ex:
                add("warn", f"Ağ erişimi — {name}", f"{host} erişilemiyor ({type(ex).__name__})")
    return rows
