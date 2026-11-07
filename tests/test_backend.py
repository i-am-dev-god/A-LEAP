"""Backend contract tests. No YouTube network access is required."""
from __future__ import annotations

import asyncio
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.db import SCAN_SECONDS, Database
from backend.engine import Engine, channel_url, playlist_url, score


@pytest.fixture()
def client(tmp_path):
    app = create_app(tmp_path / "data", Path(__file__).resolve().parent.parent / "frontend",
                     demo=False, start_engine=False)
    with TestClient(app) as c:
        c.app = app
        yield c


def add_video(app, vid="testvideo01", status="ready", size=2048):
    db, engine = app.state.db, app.state.engine
    db.add_candidate({"id": vid, "title": "A test Short", "channel_name": "Test Creator",
                      "channel_id": "UC_test", "duration": 12, "score": 70,
                      "webpage_url": f"https://www.youtube.com/shorts/{vid}"})
    path = engine.media_dir / f"{vid}.mp4"
    path.write_bytes(b"0123456789abcdef" * (size // 16))
    db.update_video(vid, status=status, file_path=path.name, bytes=path.stat().st_size, downloaded_at=time.time())
    return path


def test_health_and_static(client):
    assert client.get("/api/health").json()["ok"] is True
    assert client.get("/api/health").json()["scan_seconds"] == 1800
    assert "Predictive Offline Shorts Manager" in client.get("/").text
    assert client.get("/sw.js").status_code == 200
    assert client.get("/manifest.webmanifest").json()["display"] == "standalone"


def test_settings_validation_and_persistence(client):
    bad = client.put("/api/settings", json={"playlist_url": "https://evil.example/playlist?list=PL123"})
    assert bad.status_code == 422
    good = client.put("/api/settings", json={
        "playlist_url": "https://www.youtube.com/playlist?list=PLabc123",
        "channels": ["@example"], "topics": ["cooking", " cooking ", "astronomy"],
        "max_storage_mb": 500, "device_cache_mb": 250})
    assert good.status_code == 200
    data = good.json()
    assert data["playlist_url"] == "https://www.youtube.com/playlist?list=PLabc123"
    assert data["channels"] == ["https://www.youtube.com/@example/shorts"]
    assert data["topics"] == ["cooking", "astronomy"]
    assert client.get("/api/settings").json()["max_storage_mb"] == 500
    assert client.put("/api/settings", json={"playlist_url": "https://youtube.com/playlist?list=WL"}).status_code == 422
    assert client.put("/api/settings", json={"max_duration": 999}).status_code == 422


def test_url_helpers():
    assert playlist_url("") == ""
    assert channel_url("@creator") == "https://www.youtube.com/@creator/shorts"
    with pytest.raises(ValueError):
        channel_url("https://example.com/@creator")
    with pytest.raises(ValueError):
        playlist_url("https://youtube.com/watch?v=abc")


def test_feed_and_range_requests(client):
    path = add_video(client.app)
    feed = client.get("/api/feed").json()["videos"]
    assert len(feed) == 1 and feed[0]["has_file"] is True
    full = client.get(f"/media/{path.stem}.mp4")
    assert full.status_code == 200 and len(full.content) == path.stat().st_size
    part = client.get(f"/media/{path.stem}.mp4", headers={"Range": "bytes=3-12"})
    assert part.status_code == 206 and part.content == path.read_bytes()[3:13]
    assert part.headers["Content-Range"].startswith("bytes 3-12/")
    suffix = client.get(f"/media/{path.stem}.mp4", headers={"Range": "bytes=-10"})
    assert suffix.status_code == 206 and len(suffix.content) == 10
    assert client.get(f"/media/{path.stem}.mp4", headers={"Range": "bytes=99999-"}).status_code == 416
    assert client.get("/media/missing000.mp4").status_code == 404


def test_delete_removes_file_row_and_blocks_redownload(client):
    path = add_video(client.app)
    response = client.delete("/api/videos/testvideo01")
    assert response.status_code == 200 and response.json()["freed_bytes"] == 2048
    assert not path.exists()
    assert client.app.state.db.video("testvideo01") is None
    assert client.get("/api/feed").json()["videos"] == []
    assert client.app.state.db.blocked("testvideo01")
    assert client.delete("/api/videos/testvideo01").json()["ok"] is True
    weights = client.app.state.db.weights()
    assert weights[("channel", "uc_test")] < 0


def test_watched_frees_file_but_keeps_history(client):
    path = add_video(client.app)
    r = client.post("/api/videos/testvideo01/watched", json={"position": 12})
    assert r.status_code == 200 and not path.exists()
    video = client.app.state.db.video("testvideo01")
    assert video["status"] == "watched" and video["bytes"] == 0 and video["file_path"] is None
    history = client.get("/api/history").json()
    assert history["watched"][0]["id"] == "testvideo01"
    assert history["events"][0]["event"] == "watched"
    assert client.get("/api/feed").json()["videos"] == []


def test_feedback_and_reset(client):
    add_video(client.app)
    assert client.post("/api/videos/testvideo01/feedback", json={"event": "complete", "position": 12, "duration": 12}).status_code == 200
    assert client.app.state.db.weights()[("channel", "uc_test")] > 0
    client.post("/api/videos/testvideo01/feedback", json={"event": "skip", "position": 1, "duration": 12})
    assert client.post("/api/preferences/reset", json={}).status_code == 200
    assert client.app.state.db.weights() == {}
    assert client.app.state.db.video("testvideo01") is not None


def test_scoring_is_explainable_and_feedback_driven():
    info = {"title": "Easy pasta cooking", "channel_id": "UCchef", "view_count": 10000, "upload_date": time.strftime("%Y%m%d")}
    settings = {"topics": ["cooking"]}
    base, reasons = score(info, "search", {}, settings)
    liked, liked_reasons = score(info, "search", {("channel", "ucchef"): 15, ("topic", "pasta"): 5}, settings)
    disliked, _ = score(info, "search", {("channel", "ucchef"): -20}, settings)
    assert liked > base > disliked
    assert any("Creator affinity" in r for r in liked_reasons)
    assert 0 <= disliked <= 100


def test_scan_requires_source(client):
    assert client.post("/api/scan").status_code == 400
    client.put("/api/settings", json={"topics": ["cooking"]})
    assert client.post("/api/scan").status_code == 202


def test_demo_disabled_by_default(client):
    assert client.post("/api/demo").status_code == 404


def test_restart_recovery_keeps_queue_and_tombstones(tmp_path):
    db = Database(tmp_path / "db.sqlite3")
    engine = Engine(db, tmp_path)
    db.add_candidate({"id": "queued0001", "title": "Queued", "channel_name": "C", "duration": 10})
    db.update_video("queued0001", status="downloading")
    engine.delete("deleted001")
    restarted = Engine(Database(tmp_path / "db.sqlite3"), tmp_path)
    assert restarted.db.video("queued0001")["status"] == "queued"
    assert restarted.db.blocked("deleted001")
    assert SCAN_SECONDS == 1800


def test_delete_during_download_never_publishes(tmp_path):
    async def run():
        db = Database(tmp_path / "db.sqlite3")
        engine = Engine(db, tmp_path)
        db.add_candidate({"id": "racevideo1", "title": "Race", "channel_name": "C", "duration": 10})
        started, release = threading.Event(), threading.Event()

        def fake_download(video, flag):
            work = engine.stage_dir / video["id"]
            work.mkdir(exist_ok=True)
            path = work / "video.mp4"
            path.write_bytes(b"video")
            started.set()
            release.wait(5)
            return path

        engine._download = fake_download
        task = asyncio.create_task(engine.downloader())
        await asyncio.to_thread(started.wait, 5)
        deleted = await asyncio.to_thread(engine.delete, "racevideo1")
        release.set()
        await asyncio.sleep(0.15)
        engine.stopping = True
        await asyncio.wait_for(task, 2)
        assert deleted["deleted"] is True
        assert db.video("racevideo1") is None
        assert not (engine.media_dir / "racevideo1.mp4").exists()
        assert db.blocked("racevideo1")
    asyncio.run(run())


def test_shuffle_search_is_public_and_optional():
    from backend.engine import SHUFFLE_TOPICS, shuffle_search

    assert shuffle_search("gaming") == "ytsearch40:gaming #shorts"
    assert shuffle_search("funny #Shorts") == "ytsearch40:funny #Shorts"
    blank = shuffle_search("")
    assert blank.startswith("ytsearch40:") and blank.endswith(" #shorts")
    assert blank.removeprefix("ytsearch40:").removesuffix(" #shorts") in SHUFFLE_TOPICS


def test_shuffle_filters_and_queues_without_sources(tmp_path, monkeypatch):
    async def run():
        db = Database(tmp_path / "db.sqlite3")
        engine = Engine(db, tmp_path)
        engine.delete("blocked0001")
        db.learn("channel", "ucgood", -30)
        calls = []
        entries = [{"id": v} for v in ("blocked0001", "landscape01", "toolong0001", "portrait001", "portrait002")]

        def extract(url, opts):
            calls.append(url)
            if url.startswith("ytsearch"):
                return {"entries": entries}
            vid = url.split("v=")[1]
            return {"id": vid, "title": f"Short {vid}", "channel": "Public creator", "channel_id": "UCgood",
                    "duration": 200 if vid == "toolong0001" else 20,
                    "width": 1920 if vid == "landscape01" else 1080,
                    "height": 1080 if vid == "landscape01" else 1920,
                    "view_count": 100, "upload_date": "20261101"}

        monkeypatch.setattr(engine, "_extract", extract)
        monkeypatch.setattr(engine, "_avatar", lambda *args: "")
        await engine.scan(shuffle_topic="gaming", count=5)
        assert calls[0] == "ytsearch40:gaming #shorts"
        assert not any("blocked0001" in url for url in calls[1:])
        queued = db.videos(("queued",))
        assert {v["id"] for v in queued} == {"portrait001", "portrait002"}
        assert all(v["source"] == "shuffle" and v["score"] == 50 for v in queued)
        assert all(v["webpage_url"].startswith("https://www.youtube.com/shorts/") for v in queued)
        assert engine.last_discovery["state"] == "complete"
        assert engine.last_discovery["queued"] == 2
        assert engine.last_discovery["rejected"] == 2
        assert db.meta("last_discovery")["queued"] == 2
        assert db.settings()["channels"] == [] and db.settings()["topics"] == []
        await engine.stop()
    asyncio.run(run())


def test_shuffle_network_failure_is_not_a_demo(tmp_path, monkeypatch):
    async def run():
        engine = Engine(Database(tmp_path / "db.sqlite3"), tmp_path)

        def unavailable(*args):
            raise OSError("TLS/SSL connection has been closed (EOF)")

        monkeypatch.setattr(engine, "_extract", unavailable)
        await engine.scan(shuffle_topic="", count=5)
        assert engine.last_discovery["state"] == "error"
        assert "TLS/SSL" in engine.last_discovery["errors"][0]
        assert engine.last_discovery["queued"] == 0
        assert engine.db.videos(("queued", "ready")) == []
        assert engine.status()["last_discovery"]["state"] == "error"
        await engine.stop()
    asyncio.run(run())


def test_discovery_api_validation_and_busy(client, monkeypatch):
    calls = []

    def start(topic="", count=5):
        calls.append((topic, count))
        if len(calls) > 2:
            raise RuntimeError("A scan is already running.")
        return {"ok": True, "message": "Finding public Shorts."}

    monkeypatch.setattr(client.app.state.engine, "request_discovery", start)
    assert client.post("/api/discover", json={}).status_code == 202
    assert calls == [("", 5)]
    assert client.post("/api/discover", json={"topic": "  gaming  ", "count": 3}).status_code == 202
    assert calls[-1] == ("gaming", 3)
    assert client.post("/api/discover", json={}).status_code == 409
    assert client.post("/api/discover", json={"count": 11}).status_code == 422
    assert client.post("/api/discover", json={"topic": "x" * 81}).status_code == 422
    assert client.post("/api/discover", json={"topic": "bad\nsearch"}).status_code == 422
    assert client.put("/api/settings", json={"channels": [], "topics": [], "playlist_url": ""}).status_code == 200


def test_manual_shuffle_downloads_when_automatic_is_off(tmp_path):
    async def run():
        db = Database(tmp_path / "db.sqlite3")
        engine = Engine(db, tmp_path)
        db.save_settings({"auto_download": False})
        db.add_candidate({"id": "scheduled01", "title": "Scheduled", "channel_name": "C", "duration": 10})
        db.add_candidate({"id": "manual00001", "title": "Manual", "channel_name": "C", "duration": 10,
                          "source": "shuffle", "score": 50})
        finished = threading.Event()

        def fake_download(video, flag):
            assert video["id"] == "manual00001"
            work = engine.stage_dir / video["id"]
            work.mkdir(exist_ok=True)
            path = work / "video.mp4"
            path.write_bytes(b"manual-video")
            finished.set()
            return path

        engine._download = fake_download
        task = asyncio.create_task(engine.downloader())
        await asyncio.to_thread(finished.wait, 5)
        for _ in range(100):
            if db.video("manual00001")["status"] == "ready":
                break
            await asyncio.sleep(0.01)
        engine.stopping = True
        await asyncio.wait_for(task, 2)
        assert db.video("manual00001")["status"] == "ready"
        assert db.video("scheduled01")["status"] == "queued"
        assert (engine.media_dir / "manual00001.mp4").read_bytes() == b"manual-video"
    asyncio.run(run())


def test_shuffle_stops_at_requested_count(tmp_path, monkeypatch):
    async def run():
        engine = Engine(Database(tmp_path / "db.sqlite3"), tmp_path)
        calls = []

        def extract(url, opts):
            calls.append(url)
            if url.startswith("ytsearch"):
                return {"entries": [{"id": f"portrait{i:03d}"} for i in range(10)]}
            return {"title": "Short", "channel": "C", "duration": 20, "width": 1080, "height": 1920}

        monkeypatch.setattr(engine, "_extract", extract)
        monkeypatch.setattr(engine, "_avatar", lambda *args: "")
        await engine.scan(shuffle_topic="", count=5)
        assert len(engine.db.videos(("queued",))) == 5
        assert len(calls) == 6  # one search plus five metadata lookups
        assert engine.last_discovery["queued"] == 5
        await engine.stop()
    asyncio.run(run())
