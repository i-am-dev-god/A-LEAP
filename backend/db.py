"""SQLite persistence. Connections are short-lived and safe for worker threads."""
from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DEFAULT_SETTINGS = {
    "playlist_url": "",
    "channels": [],
    "topics": [],
    "auto_download": True,
    "max_storage_mb": 2048,
    "max_duration": 180,
    "per_scan_limit": 10,
    "device_cache_mb": 1024,
}
SCAN_SECONDS = 1800


class Database:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as c:
            c.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS settings (
                    id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS videos (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    channel_name TEXT NOT NULL,
                    channel_id TEXT NOT NULL DEFAULT '',
                    channel_url TEXT NOT NULL DEFAULT '',
                    channel_avatar TEXT NOT NULL DEFAULT '',
                    view_count INTEGER,
                    upload_date TEXT,
                    duration REAL NOT NULL DEFAULT 0,
                    webpage_url TEXT NOT NULL DEFAULT '',
                    source TEXT NOT NULL DEFAULT 'playlist',
                    file_path TEXT,
                    bytes INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'candidate',
                    score REAL NOT NULL DEFAULT 50,
                    reasons TEXT NOT NULL DEFAULT '[]',
                    error TEXT NOT NULL DEFAULT '',
                    attempts INTEGER NOT NULL DEFAULT 0,
                    discovered_at REAL NOT NULL,
                    downloaded_at REAL,
                    watched_at REAL,
                    last_position REAL NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS videos_queue ON videos(status, score DESC);
                CREATE TABLE IF NOT EXISTS tombstones (
                    id TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS events (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    video_id TEXT NOT NULL, title TEXT NOT NULL,
                    channel_name TEXT NOT NULL, event TEXT NOT NULL,
                    position REAL NOT NULL DEFAULT 0, duration REAL NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS preferences (
                    kind TEXT NOT NULL, key_name TEXT NOT NULL,
                    weight REAL NOT NULL DEFAULT 0, observations INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(kind, key_name)
                );
                CREATE TABLE IF NOT EXISTS channels (
                    id TEXT PRIMARY KEY, avatar_url TEXT NOT NULL DEFAULT '',
                    avatar_path TEXT NOT NULL DEFAULT '', updated_at REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """)
            c.execute("INSERT OR IGNORE INTO settings VALUES(1,?)", (json.dumps(DEFAULT_SETTINGS),))

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        c = sqlite3.connect(self.path, timeout=30)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("PRAGMA busy_timeout=30000")
        try:
            with c:
                yield c
        finally:
            c.close()

    def settings(self) -> dict:
        with self.connect() as c:
            row = c.execute("SELECT value FROM settings WHERE id=1").fetchone()
        return {**DEFAULT_SETTINGS, **json.loads(row["value"])}

    def save_settings(self, value: dict) -> dict:
        merged = {**self.settings(), **value}
        with self.connect() as c:
            c.execute("UPDATE settings SET value=? WHERE id=1", (json.dumps(merged),))
        return merged

    def meta(self, key: str, default=None):
        with self.connect() as c:
            row = c.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def set_meta(self, key: str, value):
        with self.connect() as c:
            c.execute("INSERT OR REPLACE INTO meta VALUES(?,?)", (key, json.dumps(value)))

    def video(self, video_id: str) -> dict | None:
        with self.connect() as c:
            row = c.execute("SELECT * FROM videos WHERE id=?", (video_id,)).fetchone()
        return self.decode(row) if row else None

    @staticmethod
    def decode(row) -> dict:
        item = dict(row)
        item["reasons"] = json.loads(item.get("reasons", "[]"))
        item["has_file"] = bool(item.get("file_path"))
        return item

    def videos(self, statuses: tuple[str, ...] = ("ready",), limit: int = 500) -> list[dict]:
        marks = ",".join("?" for _ in statuses)
        with self.connect() as c:
            rows = c.execute(
                f"SELECT * FROM videos WHERE status IN ({marks}) "
                "ORDER BY score DESC, COALESCE(downloaded_at, discovered_at) DESC, rowid ASC LIMIT ?",
                (*statuses, limit)).fetchall()
        return [self.decode(r) for r in rows]

    def blocked(self, video_id: str) -> bool:
        with self.connect() as c:
            return bool(c.execute(
                "SELECT 1 FROM tombstones WHERE id=? UNION SELECT 1 FROM videos "
                "WHERE id=? AND status IN ('ready','watched','queued','downloading')",
                (video_id, video_id)).fetchone())

    def add_candidate(self, item: dict):
        item = {**item, "reasons": json.dumps(item.get("reasons", [])),
                "discovered_at": time.time(), "status": "queued"}
        keys = ",".join(item)
        marks = ",".join("?" for _ in item)
        with self.connect() as c:
            cursor = c.execute(f"INSERT OR IGNORE INTO videos({keys}) VALUES({marks})", tuple(item.values()))
        return cursor.rowcount > 0

    def update_video(self, video_id: str, **fields):
        if "reasons" in fields:
            fields["reasons"] = json.dumps(fields["reasons"])
        assignments = ",".join(f"{k}=?" for k in fields)
        with self.connect() as c:
            c.execute(f"UPDATE videos SET {assignments} WHERE id=?", (*fields.values(), video_id))

    def event(self, video: dict, event: str, position: float = 0, duration: float = 0):
        with self.connect() as c:
            c.execute("INSERT INTO events(video_id,title,channel_name,event,position,duration,created_at) "
                      "VALUES(?,?,?,?,?,?,?)", (video["id"], video["title"], video["channel_name"],
                                               event, position, duration, time.time()))

    def learn(self, kind: str, key: str, delta: float):
        key = key.strip().lower()[:120]
        if not key:
            return
        with self.connect() as c:
            c.execute("INSERT OR IGNORE INTO preferences(kind,key_name) VALUES(?,?)", (kind, key))
            c.execute("UPDATE preferences SET weight=MAX(-30,MIN(30,weight*0.95+?)), "
                      "observations=observations+1 WHERE kind=? AND key_name=?", (delta, kind, key))

    def weights(self) -> dict[tuple[str, str], float]:
        with self.connect() as c:
            return {(r["kind"], r["key_name"]): r["weight"] for r in c.execute("SELECT * FROM preferences")}

    def history(self, limit=100) -> list[dict]:
        with self.connect() as c:
            return [dict(r) for r in c.execute("SELECT * FROM events ORDER BY seq DESC LIMIT ?", (limit,))]
