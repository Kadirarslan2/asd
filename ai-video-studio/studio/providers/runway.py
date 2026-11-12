"""Runway API (dev.runwayml.com) — metinden, görselden ve videodan video; 4K yükseltme."""
from __future__ import annotations

import os

from .base import GenRequest, PollResult, ProviderError, VideoProvider, data_uri


class RunwayProvider(VideoProvider):
    name = "runway"

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {os.environ['RUNWAYML_API_SECRET']}",
            "X-Runway-Version": str(self.cfg.get("api_version", "2024-11-06")),
            "Content-Type": "application/json",
        }

    def _post(self, path: str, body: dict) -> str:
        return self._json("POST", self.cfg["base_url"] + path, headers=self._headers(), json=body)["id"]

    def submit(self, req: GenRequest, m: dict) -> str:
        ratio = m.get("ratio_map", {}).get(req.aspect)
        if not ratio:
            raise ProviderError(f"runway: {req.aspect} oranı bu modelde tanımlı değil")
        body: dict = {"model": m["api_model"], "promptText": req.prompt, "ratio": ratio}
        if req.seed is not None:
            body["seed"] = req.seed
        if req.mode == "video":
            body["videoUri"] = data_uri(req.video)
            if req.references:
                body["references"] = [{"type": "image", "uri": data_uri(req.references[0])}]
            return self._post("/v1/video_to_video", body)
        body["duration"] = req.duration
        if req.mode == "image":
            if req.last_image:
                body["promptImage"] = [
                    {"uri": data_uri(req.image), "position": "first"},
                    {"uri": data_uri(req.last_image), "position": "last"},
                ]
            else:
                body["promptImage"] = data_uri(req.image)
            return self._post("/v1/image_to_video", body)
        return self._post("/v1/text_to_video", body)

    def poll(self, task_id: str) -> PollResult:
        d = self._json("GET", f"{self.cfg['base_url']}/v1/tasks/{task_id}", headers=self._headers())
        st = d.get("status")
        if st == "SUCCEEDED":
            return PollResult("done", url=d["output"][0])
        if st in ("FAILED", "CANCELLED"):
            return PollResult("failed", error=d.get("failure") or d.get("failureCode") or st)
        return PollResult("running")

    def upscale(self, url: str) -> str:
        up = self.cfg["upscale"]
        return self._post("/v1/video_upscale", {"model": up["api_model"], "videoUri": url})
