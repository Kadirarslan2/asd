"""Maliyet kapısı: onaylanmamış hiçbir ücretli iş çalışmaz.

Her ücretli iş (video klibi, seslendirme, ortam sesi) benzersiz bir anahtara ve
tahmini bir tutara sahiptir. Kullanıcı `studio approve` ile işleri tek tek görüp
onaylar; onay `approval.json` dosyasına iş anahtarı + tutar olarak yazılır.
Sağlayıcıya istek atılmadan hemen önce `Budget.require()` çağrılır; anahtar onaylı
değilse veya tutar onaylanandan yüksekse `ApprovalRequired` fırlatılır. İstek kabul
edilince `Budget.consume()` onayı tüketir (her onay tek kullanımlıktır).
Yapılan her harcama `ledger.jsonl` dosyasına işlenir.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone

from .store import Workspace, read_json


class ApprovalRequired(Exception):
    pass


@dataclass
class Job:
    key: str
    kind: str            # video | vo | amb
    scene_id: str
    label: str
    usd: float
    detail: dict = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    @property
    def paid(self) -> bool:
        return self.usd > 0


class Budget:
    def __init__(self, ws: Workspace):
        self.ws = ws

    def _approved(self) -> dict[str, float]:
        return read_json(self.ws.approval_file, {})

    def is_approved(self, job: Job) -> bool:
        if not job.paid:
            return True
        a = self._approved()
        return job.key in a and job.usd <= a[job.key] + 1e-9

    def approve(self, jobs: list[Job]) -> None:
        a = self._approved()
        for j in jobs:
            if j.paid:
                a[j.key] = j.usd
        self.ws.root.mkdir(parents=True, exist_ok=True)
        self.ws.approval_file.write_text(json.dumps(a, indent=2, ensure_ascii=False), encoding="utf-8")

    def require(self, job: Job) -> None:
        """Ücretli istekten hemen ÖNCE çağrılır; onay yoksa isteği engeller."""
        if job.paid and not self.is_approved(job):
            raise ApprovalRequired(
                f"Onaysız ücretli iş engellendi: {job.label} (~${job.usd:.2f}). "
                f"Önce maliyeti görüp onaylayın:  studio approve <proje>")

    def consume(self, job: Job) -> None:
        """İstek sağlayıcı tarafından kabul edildikten hemen SONRA çağrılır:
        onayı tüketir (tek kullanımlık) ve harcamayı deftere işler."""
        if not job.paid:
            return
        self.require(job)
        a = self._approved()
        a.pop(job.key, None)
        self.ws.approval_file.write_text(json.dumps(a, indent=2, ensure_ascii=False), encoding="utf-8")
        with self.ws.ledger_file.open("a", encoding="utf-8") as f:
            f.write(json.dumps({
                "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "key": job.key, "kind": job.kind, "scene": job.scene_id,
                "label": job.label, "usd_estimate": round(job.usd, 4),
            }, ensure_ascii=False) + "\n")

    def spent(self) -> float:
        if not self.ws.ledger_file.is_file():
            return 0.0
        return sum(json.loads(l)["usd_estimate"]
                   for l in self.ws.ledger_file.read_text(encoding="utf-8").splitlines() if l.strip())
