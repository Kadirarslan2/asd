"""Kling AI resmi API — metinden ve görselden video (JWT kimlik doğrulama)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from .base import GenRequest, PollResult, ProviderError, VideoProvider, b64


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def make_jwt(access_key: str, secret_key: str, ttl: int = 1800) -> str:
    now = int(time.time())
    head = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64url(json.dumps({"iss": access_key, "exp": now + ttl, "nbf": now - 5},
                              separators=(",", ":")).encode())
    sig = hmac.new(secret_key.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    return f"{head}.{body}.{_b64url(sig)}"


class KlingProvider(VideoProvider):
    name = "kling"

    def _headers(self) -> dict:
        token = make_jwt(os.environ["KLING_ACCESS_KEY"], os.environ["KLING_SECRET_KEY"])
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def _check(self, d: dict) -> dict:
        if d.get("code", 0) != 0:
            raise ProviderError(f"kling: {d.get('code')}: {d.get('message')}")
        return d["data"]

    def submit(self, req: GenRequest, m: dict) -> str:
        if req.mode == "video":
            raise ProviderError("kling: referans videodan üretim bu entegrasyonda yok; runway/gen4_aleph kullanın")
        body: dict = {
            "model_name": m["api_model"],
            "prompt": req.prompt,
            "negative_prompt": req.negative[:2500],
            "duration": str(req.duration),
        }
        if m.get("api_mode"):
            body["mode"] = m["api_mode"]
        if req.mode == "image":
            kind = "image2video"
            body["image"] = b64(req.image)           # Kling ham base64 ister (data: öneki yok)
            if req.last_image:
                body["image_tail"] = b64(req.last_image)
        else:
            kind = "text2video"
            body["aspect_ratio"] = req.aspect
        d = self._json("POST", f"{self.cfg['base_url']}/v1/videos/{kind}", headers=self._headers(), json=body)
        return f"{kind}:{self._check(d)['task_id']}"

    def poll(self, task_id: str) -> PollResult:
        kind, tid = task_id.split(":", 1)
        d = self._check(self._json("GET", f"{self.cfg['base_url']}/v1/videos/{kind}/{tid}",
                                   headers=self._headers()))
        st = d.get("task_status")
        if st == "succeed":
            return PollResult("done", url=d["task_result"]["videos"][0]["url"])
        if st == "failed":
            return PollResult("failed", error=d.get("task_status_msg") or "failed")
        return PollResult("running")
