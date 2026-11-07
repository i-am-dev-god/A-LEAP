"""FastAPI application: API, byte-range media serving, and the offline web client."""
from __future__ import annotations

import hmac
import logging
import os
import re
import subprocess
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from . import __version__
from .db import SCAN_SECONDS, Database
from .engine import Engine, channel_url, playlist_url

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("SHORTS_DATA_DIR", ROOT / "data")).resolve()
FRONTEND = Path(os.environ.get("SHORTS_FRONTEND_DIR", ROOT / "frontend")).resolve()
DEMO = os.environ.get("SHORTS_DEMO", "0") == "1"
TOKEN = os.environ.get("SHORTS_TOKEN", "")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


class SettingsInput(BaseModel):
    playlist_url: str = ""
    channels: list[str] = Field(default_factory=list, max_length=10)
    topics: list[str] = Field(default_factory=list, max_length=10)
    auto_download: bool = True
    max_storage_mb: int = Field(default=2048, ge=100, le=100000)
    max_duration: int = Field(default=180, ge=15, le=180)
    per_scan_limit: int = Field(default=10, ge=1, le=30)
    device_cache_mb: int = Field(default=1024, ge=100, le=20000)

    @field_validator("playlist_url")
    @classmethod
    def validate_playlist(cls, v):
        return playlist_url(v)

    @field_validator("channels")
    @classmethod
    def validate_channels(cls, v):
        return [channel_url(x) for x in v if x.strip()]

    @field_validator("topics")
    @classmethod
    def validate_topics(cls, v):
        return list(dict.fromkeys(x.strip()[:80] for x in v if x.strip()))


class DiscoveryInput(BaseModel):
    topic: str = Field(default="", max_length=80)
    count: int = Field(default=5, ge=1, le=10)

    @field_validator("topic")
    @classmethod
    def validate_topic(cls, v):
        v = v.strip()
        if any(ord(c) < 32 or ord(c) == 127 for c in v):
            raise ValueError("Use a plain topic without control characters.")
        return v


class FeedbackInput(BaseModel):
    event: Literal["progress", "skip", "replay", "complete"]
    position: float = Field(default=0, ge=0, le=86400)
    duration: float = Field(default=0, ge=0, le=86400)


class WatchedInput(BaseModel):
    position: float = Field(default=0, ge=0, le=86400)


def create_app(data_dir: Path = DATA, frontend_dir: Path = FRONTEND, *, demo: bool = DEMO,
               start_engine: bool = True) -> FastAPI:
    db = Database(data_dir / "shorts.sqlite3")
    engine = Engine(db, data_dir)

    @asynccontextmanager
    async def lifespan(app):
        if start_engine:
            await engine.start()
        yield
        await engine.stop()

    app = FastAPI(title="Predictive Offline Shorts Manager", version=__version__, lifespan=lifespan)
    app.state.db, app.state.engine = db, engine

    @app.middleware("http")
    async def security(request: Request, call_next):
        # Optional shared secret for a remotely exposed backend. Media URLs stay clean;
        # the service worker / Android proxy forward the configured request header.
        protected = request.url.path.startswith(("/api/", "/media/")) and not request.url.path.endswith("/health")
        if TOKEN and protected:
            supplied = request.headers.get("x-shorts-token", "")
            if not hmac.compare_digest(supplied, TOKEN):
                return JSONResponse({"detail": "Invalid or missing access token. Set it in Settings → Connection."}, status_code=401)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return {"ok": True, "app": "Predictive Offline Shorts Manager", "version": __version__,
                "scan_seconds": SCAN_SECONDS, "demo": demo}

    @app.get("/api/settings")
    def get_settings():
        return db.settings()

    @app.put("/api/settings")
    def put_settings(value: SettingsInput):
        result = db.save_settings(value.model_dump())
        engine.request_scan()
        return result

    @app.get("/api/feed")
    def feed():
        return {"videos": db.videos(("ready",)), "generated_at": time.time()}

    @app.get("/api/status")
    def status():
        return engine.status()

    @app.get("/api/queue")
    def queue():
        return {"videos": db.videos(("queued", "downloading", "error", "candidate"), 100)}

    @app.post("/api/scan", status_code=202)
    def scan():
        settings = db.settings()
        if not (settings["playlist_url"] or settings["channels"] or settings["topics"]):
            raise HTTPException(400, "Add a playlist, channel, or topic in Settings first.")
        engine.request_scan()
        return {"ok": True, "message": "Scan requested. New Shorts will appear when downloaded."}

    @app.post("/api/discover", status_code=202)
    async def discover(body: DiscoveryInput):
        try:
            return engine.request_discovery(body.topic, body.count)
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/videos/{video_id}/watched")
    def watched(video_id: str, body: WatchedInput | None = None):
        return engine.mark_watched(video_id, body.position if body else 0)

    @app.delete("/api/videos/{video_id}")
    def delete(video_id: str):
        return engine.delete(video_id)

    @app.post("/api/videos/{video_id}/feedback")
    def feedback(video_id: str, body: FeedbackInput):
        return engine.feedback(video_id, body.event, body.position, body.duration)

    @app.get("/api/history")
    def history():
        return {"events": db.history(), "watched": db.videos(("watched",))}

    @app.post("/api/preferences/reset")
    def reset_preferences():
        with db.connect() as c:
            c.execute("DELETE FROM preferences")
        return {"ok": True, "message": "Learning reset. Watch history and blocked IDs were kept."}

    @app.get("/api/avatars/{name}")
    def avatar(name: str):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}\.jpg", name):
            raise HTTPException(404)
        path = engine.avatar_dir / name
        if not path.is_file():
            raise HTTPException(404)
        return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})

    @app.get("/media/{video_id}.mp4")
    def media(video_id: str, request: Request):
        video = db.video(video_id)
        if not video or video["status"] != "ready" or not video["file_path"]:
            raise HTTPException(404, "This video is no longer cached.")
        path = engine.media_dir / Path(video["file_path"]).name
        if not path.is_file():
            raise HTTPException(404, "The cached file is missing.")
        size = path.stat().st_size
        start, end = 0, size - 1
        partial = False
        range_header = request.headers.get("range")
        if range_header:
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
            if not match or not any(match.groups()):
                return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
            a, b = match.groups()
            if a:
                start = int(a)
                end = min(int(b), size - 1) if b else size - 1
            else:
                start = max(0, size - int(b))
            if start >= size or start > end:
                return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
            partial = True

        def stream():
            with path.open("rb") as f:
                f.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    chunk = f.read(min(256 * 1024, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        headers = {"Accept-Ranges": "bytes", "Content-Length": str(end - start + 1),
                   "Cache-Control": "private, max-age=31536000, immutable",
                   "X-Video-Id": video_id}
        if partial:
            headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        return StreamingResponse(stream(), status_code=206 if partial else 200,
                                 media_type="video/mp4", headers=headers)

    @app.post("/api/demo", status_code=201)
    def create_demo():
        if not demo:
            raise HTTPException(404, "Demo mode is disabled.")
        import imageio_ffmpeg
        samples = [
            ("demo-ocean-01", "A little closer to the quiet.", "Ocean Studies", "ocean", "#071e2c", "#2f91a3"),
            ("demo-dune-02", "Take the long way home.", "Field Notes", "dune", "#302015", "#c78d50"),
            ("demo-forest-03", "Notice the small things.", "Slow Places", "forest", "#10251c", "#6b9465"),
        ]
        created = []
        for vid, title, creator, label, dark, light in samples:
            if db.blocked(vid):
                continue
            path = engine.media_dir / (vid + ".mp4")
            if not path.exists():
                ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
                # Original synthetic color-field clips, not downloaded YouTube content.
                vf = (f"gradients=s=540x960:d=10:r=24:c0={dark}:c1={light}:c2={dark}:speed=0.025:type=spiral,"
                      "format=yuv420p")
                subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-f", "lavfi", "-i", vf,
                                "-t", "10", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "27",
                                "-movflags", "+faststart", str(path)], check=True, timeout=90)
            db.add_candidate({"id": vid, "title": title, "channel_name": creator, "channel_id": label,
                              "channel_url": "", "channel_avatar": "", "view_count": None,
                              "upload_date": time.strftime("%Y%m%d"), "duration": 10,
                              "webpage_url": "", "source": "demo", "score": 60,
                              "reasons": ["Original synthetic demo — not a YouTube download"]})
            db.update_video(vid, status="ready", file_path=path.name, bytes=path.stat().st_size, downloaded_at=time.time())
            created.append(vid)
        return {"ok": True, "created": created, "notice": "Synthetic demo clips only. Add real sources in Settings."}

    # The SPA is bundled locally. No CDN, font service, or analytics is needed to boot offline.
    @app.get("/sw.js")
    def service_worker():
        return FileResponse(frontend_dir / "sw.js", media_type="application/javascript",
                            headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"})

    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
    return app


app = create_app()
