"""ElevenLabs: Türkçe seslendirme (TTS) ve ortam sesleri (sound effects).
MockAudio aynı arayüzle FFmpeg'den ücretsiz test sesi üretir."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

import httpx


class AudioError(Exception):
    pass


class ElevenLabs:
    name = "elevenlabs"

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.http = httpx.Client(timeout=httpx.Timeout(180, connect=20))

    def missing_keys(self) -> list[str]:
        return [e for e in self.cfg.get("env", []) if not os.getenv(e)]

    def _headers(self) -> dict:
        return {"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"}

    def _save(self, r: httpx.Response, out: Path) -> Path:
        if r.status_code >= 400:
            raise AudioError(f"elevenlabs: HTTP {r.status_code}: {r.text[:400]}")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(r.content)
        return out

    def tts(self, text: str, voice_id: str, model: str, out: Path, language: str = "tr") -> Path:
        body: dict = {
            "text": text,
            "model_id": model,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "style": 0.15,
                               "use_speaker_boost": True},
        }
        if self.cfg.get("tts_models", {}).get(model, {}).get("language_code"):
            body["language_code"] = language
        r = self.http.post(f"{self.cfg['base_url']}/v1/text-to-speech/{voice_id}",
                           params={"output_format": self.cfg.get("output_format", "mp3_44100_128")},
                           headers=self._headers(), json=body)
        return self._save(r, out)

    def sfx(self, prompt: str, seconds: float, out: Path) -> Path:
        r = self.http.post(f"{self.cfg['base_url']}/v1/sound-generation", headers=self._headers(),
                           json={"text": prompt, "duration_seconds": round(seconds, 1),
                                 "prompt_influence": 0.4})
        return self._save(r, out)

    def voices(self) -> list[dict]:
        r = self.http.get(f"{self.cfg['base_url']}/v2/voices", params={"page_size": 100},
                          headers=self._headers())
        if r.status_code >= 400:
            raise AudioError(f"elevenlabs: HTTP {r.status_code}: {r.text[:300]}")
        return r.json().get("voices", [])


class MockAudio:
    name = "mock"

    def __init__(self, cfg: dict | None = None):
        self.cfg = cfg or {}

    def missing_keys(self) -> list[str]:
        return []

    def _run(self, src: str, out: Path) -> Path:
        out.parent.mkdir(parents=True, exist_ok=True)
        p = subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", src,
                            "-c:a", "libmp3lame", "-b:a", "128k", str(out)],
                           capture_output=True, text=True)
        if p.returncode:
            raise AudioError(p.stderr[-300:])
        return out

    def tts(self, text: str, voice_id: str, model: str, out: Path, language: str = "tr") -> Path:
        seconds = max(1.0, len(text.split()) / 2.4)       # ~2.4 kelime/sn konuşma hızı
        return self._run(f"sine=f=330:d={seconds:.2f},tremolo=f=5:d=0.8,volume=0.5", out)

    def sfx(self, prompt: str, seconds: float, out: Path) -> Path:
        return self._run(f"anoisesrc=d={seconds:.2f}:c=pink:a=0.15", out)
