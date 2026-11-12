"""Sağlayıcı kayıt defteri."""
from __future__ import annotations

from .base import GenRequest, PollResult, ProviderError, VideoProvider
from .kling import KlingProvider
from .mock import MockProvider
from .runway import RunwayProvider
from .veo import VeoProvider

REGISTRY: dict[str, type[VideoProvider]] = {
    "runway": RunwayProvider,
    "kling": KlingProvider,
    "veo": VeoProvider,
    "mock": MockProvider,
}


def register(name: str, cls: type[VideoProvider]) -> None:
    """Yeni sağlayıcı ekle (catalog.yaml'da aynı adla bir bölüm de gerekir)."""
    REGISTRY[name] = cls


def get_provider(name: str, catalog: dict) -> VideoProvider:
    if name not in REGISTRY or name not in catalog["video"]:
        raise ProviderError(f"Bilinmeyen sağlayıcı: {name} (mevcut: {', '.join(REGISTRY)})")
    return REGISTRY[name](catalog["video"][name])


__all__ = ["GenRequest", "PollResult", "ProviderError", "VideoProvider", "get_provider", "register", "REGISTRY"]
