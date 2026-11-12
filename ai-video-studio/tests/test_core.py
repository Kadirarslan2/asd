import base64
import copy
import hashlib
import hmac
import json
import shutil

import pytest

from studio import post
from studio.budget import ApprovalRequired, Budget
from studio.models import Character, Location, Project, Scene, Transition
from studio.pipeline import run_audio, run_video
from studio.plan import PlanError, audio_jobs, plan_video, video_job, video_jobs
from studio.prompting import build_prompt
from studio.providers import REGISTRY, PollResult
from studio.providers.kling import make_jwt
from studio.providers.mock import MockProvider
from studio.store import Workspace, load_catalog

CAT = load_catalog()


def project(**kw) -> Project:
    base = dict(
        title="Test", provider="veo",
        characters=[Character(id="a", name="Ayşe", appearance="oval face, brown eyes", wardrobe="red coat")],
        locations=[Location(id="l", name="Sokak", description="narrow cobblestone street")],
        scenes=[
            Scene(id="s01", title="Bir", duration=2, location="l", characters=["a"], action="she walks",
                  narration="Merhaba dünya.", ambience="street", transition=Transition(type="fade", duration=0.5)),
            Scene(id="s02", title="İki", duration=2, location="l", characters=["a"], action="she stops"),
        ])
    base.update(kw)
    return Project(**base)


# ---- planlama -------------------------------------------------------------

def test_veo_1080p_forces_8s_and_prices_it():
    p = project(model="veo-3.1")
    plan = plan_video(p, p.scenes[0], CAT)
    assert (plan.duration, plan.resolution) == (8, "1080p")
    assert plan.usd == pytest.approx(8 * 0.40)


def test_veo_square_falls_back_to_crop():
    p = project(aspect="1:1")
    plan = plan_video(p, p.scenes[0], CAT)
    assert plan.aspect == "16:9" and any("kırpılacak" in n for n in plan.notes)


def test_runway_4k_adds_upscale_cost():
    p = project(provider="runway", resolution="4k")
    plan = plan_video(p, p.scenes[0], CAT)
    assert plan.upscale and plan.resolution == "720p"
    assert plan.usd == pytest.approx(5 * (0.12 + 0.02))


def test_veo_4k_is_native():
    p = project(resolution="4k")
    plan = plan_video(p, p.scenes[0], CAT)
    assert plan.resolution == "4k" and not plan.upscale


def test_video_mode_switches_to_capable_model_or_fails():
    p = project(provider="runway")
    p.scenes[0].mode = "video"
    assert plan_video(p, p.scenes[0], CAT).model == "gen4_aleph"
    p.provider = "veo"
    with pytest.raises(PlanError, match="runway/gen4_aleph"):
        plan_video(p, p.scenes[0], CAT)


def test_too_long_scene_is_rejected():
    p = project()
    p.scenes[0].duration = 30
    with pytest.raises(PlanError, match="bölün"):
        plan_video(p, p.scenes[0], CAT)


# ---- tutarlılık -----------------------------------------------------------

def test_character_and_location_blocks_are_verbatim_in_every_scene():
    p = project()
    prompts = [build_prompt(p, s) for s in p.scenes]
    for block in ("Ayşe: oval face, brown eyes, wearing red coat.", "Location — Sokak: narrow cobblestone street."):
        assert all(block in pr for pr in prompts)


def test_prompt_respects_provider_limit_and_keeps_essentials():
    p = project()
    pr = build_prompt(p, p.scenes[0], max_chars=220)
    assert len(pr) <= 220 and "she walks" in pr and "Ayşe" in pr


# ---- maliyet kapısı -------------------------------------------------------

class FakePaid(MockProvider):
    name = "fake"
    local = False
    submits = 0

    def missing_keys(self):
        return []

    def submit(self, req, m):
        FakePaid.submits += 1
        self._req = req
        return "task-1"

    def poll(self, task_id):
        return PollResult("done", url="memory://clip")

    def download(self, url, out):
        return self.render(self._req, out)


@pytest.fixture
def paid(tmp_path):
    cat = copy.deepcopy(CAT)
    cat["video"]["fake"] = copy.deepcopy(cat["video"]["mock"])
    cat["video"]["fake"]["models"]["mock"]["usd_per_sec"] = {"720p": 0.5, "1080p": 0.5}
    REGISTRY["fake"] = FakePaid
    FakePaid.submits = 0
    ws = Workspace(tmp_path / "p")
    p = project(provider="fake", resolution="720p")
    ws.save_project(p)
    yield ws, p, cat
    REGISTRY.pop("fake")


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg yok")
def test_paid_job_is_blocked_without_approval_and_approval_is_single_use(paid):
    ws, p, cat = paid
    state, budget = ws.load_state(), Budget(ws)
    job, plan = video_job(p, state, cat, p.scenes[0])
    assert job.usd == pytest.approx(1.0)

    with pytest.raises(ApprovalRequired):
        run_video(ws, p, state, cat, p.scenes[0], job, plan, budget)
    assert FakePaid.submits == 0 and budget.spent() == 0

    budget.approve([job])
    run_video(ws, p, state, cat, p.scenes[0], job, plan, budget)
    assert FakePaid.submits == 1 and budget.spent() == pytest.approx(1.0)

    # yeniden üretim yeni bir iştir: eski onay onu kapsamaz
    job2, plan2 = video_job(p, state, cat, p.scenes[0])
    assert job2.key != job.key
    with pytest.raises(ApprovalRequired):
        run_video(ws, p, state, cat, p.scenes[0], job2, plan2, budget)
    assert FakePaid.submits == 1


def test_approval_does_not_cover_a_higher_price(paid):
    ws, p, cat = paid
    budget = Budget(ws)
    job, _ = video_job(p, ws.load_state(), cat, p.scenes[0])
    budget.approve([job])
    job.usd *= 2
    with pytest.raises(ApprovalRequired):
        budget.require(job)


def test_interrupted_task_resumes_without_second_charge(paid):
    ws, p, cat = paid
    state = ws.load_state()
    state.of("s01").pending = {"key": "k", "task": "task-1", "stage": "gen", "usd": 1.0}
    job, _ = video_job(p, state, cat, p.scenes[0])
    assert job.usd == 0 and not job.paid


# ---- kurgu ----------------------------------------------------------------

def test_timeline_overlaps_crossfades_only():
    tl = post.timeline([6, 6, 4], [("dissolve", 0.8), ("cut", 0.5), ("fade", 1.0)])
    assert tl == [(0.0, 0.8), (5.2, 0.0), (11.2, 0.0)]


def test_kling_jwt_is_valid_hs256():
    tok = make_jwt("ak", "sk")
    head, body, sig = tok.split(".")
    want = base64.urlsafe_b64encode(hmac.new(b"sk", f"{head}.{body}".encode(), hashlib.sha256).digest()).rstrip(b"=")
    assert sig.encode() == want
    assert json.loads(base64.urlsafe_b64decode(body + "=="))["iss"] == "ak"


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg yok")
def test_end_to_end_mock_render(tmp_path):
    ws = Workspace(tmp_path / "e2e")
    p = project(provider="mock", resolution="720p", aspect="9:16")
    ws.save_project(p)
    state, budget = ws.load_state(), Budget(ws)
    for job, plan in video_jobs(p, state, CAT):
        run_video(ws, p, state, CAT, p.scene(job.scene_id), job, plan, budget)
    for job in audio_jobs(p, state, CAT, mock=True):
        run_audio(ws, p, state, CAT, job, budget, mock=True)
    assert audio_jobs(p, state, CAT, mock=True) == []          # değişmeyen ses yeniden üretilmez
    out = post.render(ws, p, state)
    info = post.probe(out)
    assert (info["width"], info["height"]) == (720, 1280) and info["has_audio"]
    assert info["duration"] == pytest.approx(2 + 2 - 0.5, abs=0.15)
    assert "Merhaba dünya." in out.with_suffix(".srt").read_text(encoding="utf-8")
    assert budget.spent() == 0
