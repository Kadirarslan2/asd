"""Google Veo — Gemini API (predictLongRunning). Metinden/görselden video,
referans görseller, 1080p ve 4K doğal çıktı."""
from __future__ import annotations

import os

from .base import GenRequest, PollResult, VideoProvider, b64, mime


def _img(path) -> dict:
    return {"bytesBase64Encoded": b64(path), "mimeType": mime(path)}


class VeoProvider(VideoProvider):
    name = "veo"

    def _headers(self) -> dict:
        return {"x-goog-api-key": os.environ["GEMINI_API_KEY"], "Content-Type": "application/json"}

    def download_headers(self) -> dict:
        return {"x-goog-api-key": os.environ["GEMINI_API_KEY"]}

    def submit(self, req: GenRequest, m: dict) -> str:
        inst: dict = {"prompt": req.prompt}
        if req.mode == "image":
            inst["image"] = _img(req.image)
            if req.last_image:
                inst["lastFrame"] = _img(req.last_image)
        elif req.references:
            inst["referenceImages"] = [{"image": _img(p), "referenceType": "asset"} for p in req.references]
        params: dict = {
            "aspectRatio": req.aspect,
            "resolution": req.resolution,
            "durationSeconds": req.duration,
        }
        if req.negative:
            params["negativePrompt"] = req.negative
        if req.seed is not None:
            params["seed"] = req.seed
        d = self._json("POST", f"{self.cfg['base_url']}/models/{m['api_model']}:predictLongRunning",
                       headers=self._headers(), json={"instances": [inst], "parameters": params})
        return d["name"]

    def poll(self, task_id: str) -> PollResult:
        d = self._json("GET", f"{self.cfg['base_url']}/{task_id}", headers=self._headers())
        if not d.get("done"):
            return PollResult("running")
        if d.get("error"):
            return PollResult("failed", error=str(d["error"].get("message", d["error"])))
        resp = d.get("response", {}).get("generateVideoResponse", {})
        samples = resp.get("generatedSamples") or []
        if not samples:
            reason = resp.get("raiMediaFilteredReasons") or "çıktı yok (içerik filtresi olabilir)"
            return PollResult("failed", error=str(reason))
        return PollResult("done", url=samples[0]["video"]["uri"])
