"""Video sağlayıcıları için ortak arayüz. Yeni bir sağlayıcı eklemek için
VideoProvider'dan türetip submit/poll yazın ve providers/__init__.py'de kaydedin."""
from __future__ import annotations

import base64
import mimetypes
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import httpx


class ProviderError(Exception):
    pass


@dataclass
class GenRequest:
    prompt: str
    negative: str
    mode: str                       # text | image | video
    aspect: str                     # modelin üreteceği oran
    resolution: str
    duration: int
    image: Optional[Path] = None
    last_image: Optional[Path] = None
    video: Optional[Path] = None
    references: list[Path] = field(default_factory=list)
    seed: Optional[int] = None
    upscale_4k: bool = False
    label: str = ""


@dataclass
class PollResult:
    state: str                      # running | done | failed
    url: Optional[str] = None
    error: Optional[str] = None


def b64(path: Path) -> str:
    return base64.b64encode(Path(path).read_bytes()).decode()


def mime(path: Path) -> str:
    return mimetypes.guess_type(str(path))[0] or "application/octet-stream"


def data_uri(path: Path) -> str:
    return f"data:{mime(path)};base64,{b64(path)}"


class VideoProvider:
    name = ""
    local = False                   # True: ağ isteği yapmayan yerel üretici (render() kullanır)

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.http = httpx.Client(timeout=httpx.Timeout(120, connect=20), follow_redirects=True)

    # --- kimlik ---
    def missing_keys(self) -> list[str]:
        return [e for e in self.cfg.get("env", []) if not os.getenv(e)]

    # --- alt sınıfların yazacağı kısım ---
    def submit(self, req: GenRequest, model_cfg: dict) -> str:
        raise NotImplementedError

    def poll(self, task_id: str) -> PollResult:
        raise NotImplementedError

    def download_headers(self) -> dict:
        return {}

    def upscale(self, url: str) -> str:
        raise ProviderError(f"{self.name}: 4K yükseltme desteklenmiyor")

    # --- ortak akış ---
    def _json(self, method: str, url: str, **kw) -> dict:
        for attempt in range(4):
            try:
                r = self.http.request(method, url, **kw)
            except httpx.TransportError as e:
                if attempt == 3 or method != "GET":   # POST'u körlemesine tekrarlama: çift ücret riski
                    raise ProviderError(f"{self.name}: ağ hatası: {e}") from e
                time.sleep(2 ** attempt)
                continue
            if r.status_code in (429, 500, 502, 503, 504) and method == "GET" and attempt < 3:
                time.sleep(2 ** attempt * 2)
                continue
            if r.status_code >= 400:
                raise ProviderError(f"{self.name}: HTTP {r.status_code}: {r.text[:500]}")
            return r.json()
        raise ProviderError(f"{self.name}: yanıt alınamadı")

    def wait(self, task_id: str, timeout: int = 1800,
             tick: Callable[[float], None] | None = None) -> str:
        start, delay = time.time(), 5.0
        while True:
            res = self.poll(task_id)
            if res.state == "done" and res.url:
                return res.url
            if res.state == "failed":
                raise ProviderError(f"{self.name}: üretim başarısız: {res.error}")
            if time.time() - start > timeout:
                raise ProviderError(f"{self.name}: zaman aşımı (görev {task_id} hâlâ sürüyor; "
                                    "aynı komutu tekrar çalıştırırsanız kaldığı yerden devam eder)")
            if tick:
                tick(time.time() - start)
            time.sleep(delay)
            delay = min(delay * 1.2, 15)

    def download(self, url: str, out: Path) -> Path:
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_suffix(".part")
        with self.http.stream("GET", url, headers=self.download_headers()) as r:
            if r.status_code >= 400:
                r.read()
                raise ProviderError(f"{self.name}: indirme hatası HTTP {r.status_code}")
            with tmp.open("wb") as f:
                for chunk in r.iter_bytes(1 << 16):
                    f.write(chunk)
        tmp.replace(out)
        return out
