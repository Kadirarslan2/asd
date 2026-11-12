"""Ücretsiz çevrimdışı üretici: FFmpeg ile sahte klip üretir. Tüm hattı (önizleme,
yeniden üretim, kurgu, miksaj) API parası harcamadan denemek içindir."""
from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

from ..models import DIMENSIONS
from .base import GenRequest, PollResult, ProviderError, VideoProvider


class MockProvider(VideoProvider):
    name = "mock"
    local = True

    def __init__(self, cfg: dict):
        super().__init__(cfg)
        self._n = 0

    def render(self, req: GenRequest, out: Path) -> Path:
        w, h = DIMENSIONS[(req.aspect, req.resolution)]
        self._n += 1
        hue = int(hashlib.sha1(f"{req.prompt}{self._n}{out}".encode()).hexdigest()[:4], 16) % 360
        out.parent.mkdir(parents=True, exist_ok=True)
        txt = out.with_suffix(".txt")
        txt.write_text(f"{req.label}\n{req.mode} | {req.aspect} | {req.duration}s", encoding="utf-8")
        tf = txt.as_posix().replace(":", r"\:")
        base = (f"testsrc2=s={w}x{h}:r=24:d={req.duration},hue=h={hue}:s=0.6,"
                f"gblur=sigma=8")
        text = (f",drawtext=textfile='{tf}':fontcolor=white:fontsize={max(h, w) // 28}:"
                f"x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=20")
        last = None
        for vf in (base + text, base):          # yazı tipi yoksa yazısız dene
            cmd = ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", vf,
                   "-f", "lavfi", "-i", f"sine=f={200 + hue}:d={req.duration}",
                   "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                   "-c:a", "aac", "-shortest", str(out)]
            last = subprocess.run(cmd, capture_output=True, text=True)
            if last.returncode == 0:
                txt.unlink(missing_ok=True)
                return out
        raise ProviderError(f"mock: ffmpeg hatası: {last.stderr[-400:]}")

    # Mock eşzamanlıdır; pipeline doğrudan render() çağırır.
    def submit(self, req: GenRequest, model_cfg: dict) -> str:
        raise NotImplementedError

    def poll(self, task_id: str) -> PollResult:
        raise NotImplementedError
