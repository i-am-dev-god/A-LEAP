"""Persistent 30-minute discovery loop and cancellable, one-at-a-time MP4 worker."""
from __future__ import annotations

import asyncio
import logging
import math
import os
import random
import re
import shutil
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

import yt_dlp

from .db import SCAN_SECONDS, Database

log = logging.getLogger("shorts.engine")
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{6,80}$")
STOP_WORDS = set("the a an and or of to in for with on is my your our this that shorts short video youtube".split())
SHUFFLE_TOPICS = (
    "amazing science", "satisfying art", "funny animals", "quick recipes", "football skills",
    "space discoveries", "travel moments", "music performances", "gaming highlights", "DIY crafts",
    "nature landscapes", "basketball skills", "photography tips", "everyday experiments", "dance",
)
SHUFFLE_POOL = 40


def shuffle_search(topic: str = "") -> str:
    term = topic.strip() or random.choice(SHUFFLE_TOPICS)
    if not re.search(r"#shorts\b", term, re.IGNORECASE):
        term += " #shorts"
    return f"ytsearch{SHUFFLE_POOL}:{term}"


def tokens(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9]{3,}", (text or "").lower()) if w not in STOP_WORDS][:12]


def playlist_url(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    p = urllib.parse.urlparse(value)
    query = urllib.parse.parse_qs(p.query)
    ids = query.get("list", [])
    if p.scheme not in ("http", "https") or p.hostname not in (
            "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com") or not ids:
        raise ValueError("Use a public YouTube playlist URL containing ?list=PL…")
    list_id = ids[0]
    if not re.fullmatch(r"[A-Za-z0-9_-]{2,100}", list_id) or list_id in ("WL", "LL"):
        raise ValueError("Watch Later and private library playlists are not supported.")
    return "https://www.youtube.com/playlist?list=" + list_id


def channel_url(value: str) -> str:
    value = value.strip()
    if value.startswith("@") and re.fullmatch(r"@[A-Za-z0-9_.-]{2,60}", value):
        return "https://www.youtube.com/" + value + "/shorts"
    p = urllib.parse.urlparse(value if "://" in value else "https://" + value)
    if p.hostname not in ("youtube.com", "www.youtube.com", "m.youtube.com"):
        raise ValueError("Channels must be YouTube @handles or youtube.com/channel/… URLs.")
    path = p.path.rstrip("/")
    if not re.fullmatch(r"/(?:@[\w.-]+|channel/UC[\w-]+|user/[\w.-]+)(?:/shorts)?", path):
        raise ValueError("Use a channel URL or @handle, not a video or search URL.")
    if not path.endswith("/shorts"):
        path += "/shorts"
    return "https://www.youtube.com" + path


def score(info: dict, source: str, weights: dict, settings: dict) -> tuple[float, list[str]]:
    if source == "shuffle":
        # Random mode deliberately ignores learned affinities and configured interests.
        return 50.0, ["Random public Short", "Shuffled from YouTube search"]
    value = 50.0
    reasons = ["New public Short"]
    channel = (info.get("channel_id") or info.get("channel") or info.get("uploader") or "").lower()
    affinity = weights.get(("channel", channel), 0)
    if abs(affinity) > 0.1:
        value += affinity
        reasons.append(f"Creator affinity {affinity:+.1f}")
    topic_affinity = sum(weights.get(("topic", t), 0) for t in set(tokens(info.get("title", ""))))
    topic_affinity = max(-20, min(20, topic_affinity))
    if abs(topic_affinity) > 0.1:
        value += topic_affinity
        reasons.append(f"Topic affinity {topic_affinity:+.1f}")
    text = (info.get("title", "") + " " + (info.get("channel") or "")).lower()
    if any(t.lower() in text for t in settings.get("topics", []) if t.strip()):
        value += 8
        reasons.append("Matches your starting topics +8")
    if source == "playlist":
        value += 10
        reasons.append("From your playlist +10")
    views = info.get("view_count")
    if isinstance(views, (int, float)) and views > 0:
        bonus = min(6, math.log10(views + 1))
        value += bonus
        reasons.append(f"Public popularity +{bonus:.1f}")
    upload = str(info.get("upload_date") or "")
    if re.fullmatch(r"\d{8}", upload):
        try:
            age = max(0, (time.time() - time.mktime(time.strptime(upload, "%Y%m%d"))) / 86400)
            bonus = max(0, 6 - age / 30)
            value += bonus
            reasons.append(f"Recent upload +{bonus:.1f}")
        except ValueError:
            pass
    return round(max(0, min(100, value)), 2), reasons


class Engine:
    def __init__(self, db: Database, data_dir: Path):
        self.db = db
        self.data_dir = data_dir
        self.media_dir = data_dir / "media"
        self.stage_dir = data_dir / "staging"
        self.avatar_dir = data_dir / "avatars"
        for d in (self.media_dir, self.stage_dir, self.avatar_dir):
            d.mkdir(parents=True, exist_ok=True)
        self.wake = asyncio.Event()
        self.tasks: list[asyncio.Task] = []
        self.scan_lock = asyncio.Lock()
        self.active: dict | None = None
        self.cancel_flags: dict[str, threading.Event] = {}
        self.flags_lock = threading.Lock()
        self.commit_lock = threading.RLock()
        self.last_scan = db.meta("last_scan")
        self.next_scan = time.time() + SCAN_SECONDS
        self.scanning = False
        self.discovery_task: asyncio.Task | None = None
        self.last_discovery = db.meta("last_discovery")
        if self.last_discovery and self.last_discovery.get("state") == "running":
            self.last_discovery.update(state="error", errors=["The server restarted before this shuffle finished."])
            db.set_meta("last_discovery", self.last_discovery)
        self.stopping = False
        self.recover()

    def recover(self):
        for video in self.db.videos(("downloading",)):
            self.db.update_video(video["id"], status="queued")
        for video in self.db.videos(("ready",)):
            path = self.media_dir / Path(video["file_path"] or "").name
            if not path.is_file():
                self.db.update_video(video["id"], status="queued", file_path=None, bytes=0)
        for p in self.stage_dir.iterdir():
            if p.is_file():
                p.unlink()
            elif p.is_dir():
                shutil.rmtree(p, ignore_errors=True)

    async def start(self):
        self.tasks = [asyncio.create_task(self.scheduler()), asyncio.create_task(self.downloader())]

    async def stop(self):
        self.stopping = True
        self.wake.set()
        with self.flags_lock:
            for flag in self.cancel_flags.values():
                flag.set()
        tasks = [*self.tasks]
        if self.discovery_task and not self.discovery_task.done():
            tasks.append(self.discovery_task)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def scheduler(self):
        while not self.stopping:
            settings = self.db.settings()
            if not self.busy and settings["auto_download"] and (
                    settings["playlist_url"] or settings["channels"] or settings["topics"]):
                try:
                    await self.scan()
                except Exception:
                    log.exception("Scheduled scan failed")
            self.next_scan = time.time() + SCAN_SECONDS
            try:
                await asyncio.wait_for(self.wake.wait(), timeout=SCAN_SECONDS)
                self.wake.clear()
            except asyncio.TimeoutError:
                pass

    def request_scan(self):
        self.wake.set()

    @property
    def busy(self) -> bool:
        return self.scanning or self.scan_lock.locked() or bool(
            self.discovery_task and not self.discovery_task.done())

    def request_discovery(self, topic: str = "", count: int = 5) -> dict:
        if self.stopping:
            raise RuntimeError("The engine is stopping. Try again after it restarts.")
        if self.busy:
            raise RuntimeError("A scan is already running. Your next shuffle can start when it finishes.")
        if self.storage()["free_bytes"] < 10 * 1024 * 1024:
            raise RuntimeError("Server storage is nearly full. Watch or delete a few videos, then shuffle again.")
        self.discovery_task = asyncio.create_task(self.scan(shuffle_topic=topic, count=count))
        self.discovery_task.add_done_callback(self._discovery_done)
        return {"ok": True, "message": f"Finding up to {count} public Shorts. They will play here when downloaded."}

    def _discovery_done(self, task: asyncio.Task):
        if not task.cancelled() and task.exception():
            log.error("Shuffle failed", exc_info=task.exception())

    @staticmethod
    def base_opts() -> dict:
        opts = {"quiet": True, "no_warnings": True, "noplaylist": True,
                "socket_timeout": 25, "retries": 2, "extractor_retries": 2,
                "cachedir": False, "skip_download": True}
        try:
            import imageio_ffmpeg
            opts["ffmpeg_location"] = imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError:
            if shutil.which("ffmpeg"):
                opts["ffmpeg_location"] = shutil.which("ffmpeg")
        return opts

    def sources(self, settings: dict) -> list[tuple[str, str]]:
        result = []
        if settings["playlist_url"]:
            result.append(("playlist", settings["playlist_url"]))
        result.extend(("channel", channel_url(c)) for c in settings["channels"])
        result.extend(("search", f"ytsearchdate20:{t} #shorts") for t in settings["topics"] if t.strip())
        return result

    async def scan(self, *, shuffle_topic: str | None = None, count: int = 5):
        if self.scan_lock.locked():
            return
        async with self.scan_lock:
            self.scanning = True
            is_shuffle = shuffle_topic is not None
            errors = []
            found = new = rejected = 0
            try:
                settings = self.db.settings()
                if is_shuffle:
                    search = shuffle_search(shuffle_topic or "")
                    sources = [("shuffle", search)]
                    self.last_discovery = {
                        "state": "running", "topic": (shuffle_topic or "").strip(),
                        "search": search.removeprefix(f"ytsearch{SHUFFLE_POOL}:"),
                        "requested": count, "found": 0, "queued": 0, "errors": [],
                        "at": time.time(), "finished_at": None,
                    }
                    self.db.set_meta("last_discovery", self.last_discovery)
                else:
                    sources = self.sources(settings)
                for source, url in sources:
                    try:
                        opts = {**self.base_opts(), "extract_flat": "in_playlist", "playlistend": SHUFFLE_POOL}
                        listing = await asyncio.to_thread(self._extract, url, opts)
                        entries = [e for e in (listing.get("entries") or []) if e]
                        found += len(entries)
                        if is_shuffle:
                            random.shuffle(entries)
                        weights = {} if is_shuffle else self.db.weights()
                        examined = 0
                        for entry in entries:
                            if self.stopping or (is_shuffle and new >= count):
                                break
                            if not is_shuffle and examined >= settings["per_scan_limit"]:
                                break
                            if is_shuffle and examined >= min(SHUFFLE_POOL, count * 5):
                                break
                            vid = entry.get("id")
                            if not vid or not VIDEO_ID.fullmatch(vid) or self.db.blocked(vid):
                                continue
                            if is_shuffle and self.db.video(vid):
                                continue
                            examined += 1
                            try:
                                info = await asyncio.to_thread(
                                    self._extract, f"https://www.youtube.com/watch?v={vid}", self.base_opts())
                                duration = float(info.get("duration") or 0)
                                if not 0 < duration <= min(settings["max_duration"], 180):
                                    rejected += 1
                                    continue
                                # Search can return landscape/ordinary videos. Accept only confirmed portrait media.
                                if source in ("search", "shuffle") and not self._is_vertical(info):
                                    rejected += 1
                                    continue
                                value, reasons = score(info, source, weights, settings)
                                channel_id = info.get("channel_id") or info.get("uploader_id") or ""
                                avatar = await asyncio.to_thread(self._avatar, channel_id,
                                                                  info.get("channel_url") or info.get("uploader_url") or "")
                                item = {
                                    "id": vid, "title": info.get("title") or entry.get("title") or "Untitled Short",
                                    "channel_name": info.get("channel") or info.get("uploader") or "Unknown creator",
                                    "channel_id": channel_id,
                                    "channel_url": info.get("channel_url") or info.get("uploader_url") or "",
                                    "channel_avatar": avatar, "view_count": info.get("view_count"),
                                    "upload_date": info.get("upload_date"), "duration": duration,
                                    "webpage_url": f"https://www.youtube.com/shorts/{vid}",
                                    "source": source, "score": value, "reasons": reasons,
                                }
                                if is_shuffle or settings["auto_download"]:
                                    if self.db.add_candidate(item):
                                        new += 1
                            except Exception as exc:
                                errors.append(f"{vid}: {str(exc)[:180]}")
                    except Exception as exc:
                        errors.append(f"{source}: {str(exc)[:220]}")
                if is_shuffle:
                    state = "complete" if new else ("error" if errors else "empty")
                    self.last_discovery.update(state=state, found=found, queued=new, rejected=rejected,
                                               errors=errors[:8], finished_at=time.time())
                    self.db.set_meta("last_discovery", self.last_discovery)
                else:
                    self.last_scan = {"at": time.time(), "found": found, "new": new, "errors": errors[:8]}
                    self.db.set_meta("last_scan", self.last_scan)
            except asyncio.CancelledError:
                if is_shuffle and self.last_discovery:
                    self.last_discovery.update(state="error", errors=["Shuffle cancelled."], finished_at=time.time())
                    self.db.set_meta("last_discovery", self.last_discovery)
                raise
            finally:
                self.scanning = False
                self.next_scan = time.time() + SCAN_SECONDS

    @staticmethod
    def _is_vertical(info: dict) -> bool:
        try:
            width, height = float(info.get("width") or 0), float(info.get("height") or 0)
            if width > 0 and height > 0:
                return height > width
            ratio = float(info.get("aspect_ratio") or 0)
            return 0 < ratio < 1
        except (TypeError, ValueError):
            return False

    @staticmethod
    def _extract(url: str, opts: dict) -> dict:
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False) or {}

    def _avatar(self, channel_id: str, url: str) -> str:
        if not channel_id or not VIDEO_ID.fullmatch(channel_id) or not url.startswith("https://www.youtube.com/"):
            return ""
        with self.db.connect() as c:
            cached = c.execute("SELECT * FROM channels WHERE id=?", (channel_id,)).fetchone()
        if cached and cached["avatar_path"] and (self.avatar_dir / cached["avatar_path"]).is_file():
            return f"/api/avatars/{channel_id}.jpg"
        try:
            info = self._extract(url, {**self.base_opts(), "extract_flat": True, "playlist_items": "0"})
            thumbs = info.get("thumbnails") or []
            avatar = next((t["url"] for t in thumbs if "avatar" in str(t.get("id", ""))), "")
            if not avatar:
                return ""
            if urllib.parse.urlparse(avatar).hostname not in ("yt3.ggpht.com", "yt3.googleusercontent.com"):
                return ""
            name = channel_id + ".jpg"
            req = urllib.request.Request(avatar, headers={"User-Agent": "OfflineShortsManager/1.0"})
            with urllib.request.urlopen(req, timeout=15) as response:
                data = response.read(2_000_001)
            if len(data) > 2_000_000:
                return ""
            (self.avatar_dir / name).write_bytes(data)
            with self.db.connect() as c:
                c.execute("INSERT OR REPLACE INTO channels VALUES(?,?,?,?,?)",
                          (channel_id, avatar, name, time.time()))
            return f"/api/avatars/{channel_id}.jpg"
        except Exception:
            return ""  # A missing avatar must never prevent a valid video download.

    def storage(self) -> dict:
        videos = self.db.videos(("ready",))
        used = sum(v["bytes"] for v in videos)
        limit = self.db.settings()["max_storage_mb"] * 1024 * 1024
        return {"used_bytes": used, "limit_bytes": limit, "ready_count": len(videos),
                "free_bytes": max(0, limit - used)}

    async def downloader(self):
        while not self.stopping:
            settings = self.db.settings()
            queue = self.db.videos(("queued", "candidate"), limit=100)
            if not settings["auto_download"]:
                # The toggle pauses scheduled sources, not an explicit "Surprise me" request.
                queue = [v for v in queue if v["source"] == "shuffle"]
            if not queue or self.storage()["free_bytes"] < 10 * 1024 * 1024:
                await asyncio.sleep(2)
                continue
            video = queue[0]
            vid = video["id"]
            if self.db.blocked(vid) and self.db.video(vid)["status"] != "queued":
                continue
            flag = threading.Event()
            with self.flags_lock:
                self.cancel_flags[vid] = flag
            self.db.update_video(vid, status="downloading", attempts=video["attempts"] + 1, error="")
            self.active = {"id": vid, "title": video["title"], "percent": 0, "speed": "", "started": time.time()}
            try:
                path = await asyncio.to_thread(self._download, video, flag)
                if flag.is_set() or self.stopping:
                    path.unlink(missing_ok=True)
                    continue
                size = path.stat().st_size
                # Publication and deletion share a lock: a deleted video can never reappear.
                with self.commit_lock, self.db.connect() as c:
                    blocked = c.execute("SELECT 1 FROM tombstones WHERE id=?", (vid,)).fetchone()
                    row = c.execute("SELECT status FROM videos WHERE id=?", (vid,)).fetchone()
                    if blocked or not row or row["status"] != "downloading" or flag.is_set():
                        path.unlink(missing_ok=True)
                        continue
                    if self.storage()["used_bytes"] + size > self.storage()["limit_bytes"]:
                        path.unlink(missing_ok=True)
                        c.execute("UPDATE videos SET status='candidate',error='Storage limit reached' WHERE id=?", (vid,))
                        continue
                    final = self.media_dir / (vid + ".mp4")
                    os.replace(path, final)
                    c.execute("UPDATE videos SET status='ready',file_path=?,bytes=?,downloaded_at=? WHERE id=?",
                              (final.name, size, time.time(), vid))
            except Exception as exc:
                if not flag.is_set() and self.db.video(vid):
                    attempts = self.db.video(vid)["attempts"]
                    self.db.update_video(vid, status="error" if attempts >= 3 else "queued", error=str(exc)[:500])
                for p in self.stage_dir.glob(vid + "*"):
                    if p.is_file():
                        p.unlink(missing_ok=True)
            finally:
                self.active = None
                with self.flags_lock:
                    self.cancel_flags.pop(vid, None)

    def _download(self, video: dict, flag: threading.Event) -> Path:
        vid = video["id"]
        work = self.stage_dir / vid
        work.mkdir(exist_ok=True)

        def hook(d):
            if flag.is_set():
                raise yt_dlp.utils.DownloadCancelled("Video removed by user")
            if d["status"] == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes", 0)
                self.active = {"id": vid, "title": video["title"],
                               "percent": round(100 * downloaded / total, 1) if total else 0,
                               "speed": d.get("_speed_str", "").strip(), "started": self.active.get("started", time.time()) if self.active else time.time()}
            elif d["status"] == "finished":
                if self.active:
                    self.active["percent"] = 100

        opts = {**self.base_opts(), "skip_download": False,
                "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "merge_output_format": "mp4", "outtmpl": str(work / "%(id)s.%(ext)s"),
                "progress_hooks": [hook], "overwrites": True, "max_filesize": self.storage()["limit_bytes"],
                "postprocessor_hooks": [hook]}
        url = video["webpage_url"] or f"https://www.youtube.com/shorts/{vid}"
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
        files = list(work.glob("*.mp4"))
        if len(files) != 1:
            raise RuntimeError("yt-dlp did not produce exactly one MP4 file")
        return files[0]

    def _remove_file(self, video: dict | None):
        if not video:
            return 0
        name = Path(video.get("file_path") or (video["id"] + ".mp4")).name
        path = self.media_dir / name
        try:
            size = path.stat().st_size
            os.remove(path)  # Immediate physical deletion; no restart or deferred cleanup.
            return size
        except FileNotFoundError:
            return 0
        finally:
            shutil.rmtree(self.stage_dir / video["id"], ignore_errors=True)

    def _feedback(self, video: dict, delta: float):
        self.db.learn("channel", video.get("channel_id") or video.get("channel_name", ""), delta)
        for topic in set(tokens(video.get("title", ""))):
            self.db.learn("topic", topic, delta / 3)

    def mark_watched(self, vid: str, position: float = 0) -> dict:
        video = self.db.video(vid)
        if not video:
            return {"ok": True, "already_removed": True, "freed_bytes": 0}
        with self.flags_lock:
            if vid in self.cancel_flags:
                self.cancel_flags[vid].set()
        with self.commit_lock:
            with self.db.connect() as c:
                c.execute("INSERT OR REPLACE INTO tombstones VALUES(?,?,?)", (vid, "watched", time.time()))
            freed = self._remove_file(video)
            self.db.update_video(vid, status="watched", file_path=None, bytes=0, watched_at=time.time(), last_position=position)
        self.db.event(video, "watched", position, video["duration"])
        self._feedback(video, 4)
        return {"ok": True, "freed_bytes": freed, "status": "watched"}

    def delete(self, vid: str) -> dict:
        if not VIDEO_ID.fullmatch(vid):
            raise ValueError("Invalid video ID")
        video = self.db.video(vid)
        # Tombstone first closes the scanner/downloader race before touching the filesystem.
        with self.commit_lock:
            with self.db.connect() as c:
                c.execute("INSERT OR REPLACE INTO tombstones VALUES(?,?,?)", (vid, "deleted", time.time()))
            with self.flags_lock:
                if vid in self.cancel_flags:
                    self.cancel_flags[vid].set()
            freed = self._remove_file(video)
            if video:
                self.db.event(video, "deleted")
                self._feedback(video, -6)
                with self.db.connect() as c:
                    c.execute("DELETE FROM videos WHERE id=?", (vid,))
        return {"ok": True, "freed_bytes": freed, "deleted": True}

    def feedback(self, vid: str, event: str, position: float, duration: float):
        video = self.db.video(vid)
        if not video:
            return {"ok": True, "queued_only": False}
        position = max(0, min(position, duration or video["duration"] or 180))
        self.db.update_video(vid, last_position=position)
        # Progress is saved, but affinity is awarded only for a completed watch or explicit skip.
        if event in ("skip", "replay", "complete"):
            self.db.event(video, event, position, duration or video["duration"])
            self._feedback(video, {"skip": -2, "replay": 2, "complete": 3}[event])
        return {"ok": True}

    def status(self) -> dict:
        with self.db.connect() as c:
            counts = {r["status"]: r["n"] for r in c.execute("SELECT status,COUNT(*) n FROM videos GROUP BY status")}
            blocked = c.execute("SELECT COUNT(*) FROM tombstones").fetchone()[0]
            prefs = [dict(r) for r in c.execute("SELECT * FROM preferences ORDER BY ABS(weight) DESC LIMIT 12")]
        return {"scanning": self.busy, "next_scan": self.next_scan, "scan_seconds": SCAN_SECONDS,
                "last_scan": self.last_scan, "last_discovery": self.last_discovery,
                "active": self.active, "counts": counts,
                "storage": self.storage(), "blocked_count": blocked, "preferences": prefs}
