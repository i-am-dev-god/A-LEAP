# Predictive Offline Shorts Manager

A personal, offline-first Shorts feed. Tap **Surprise me** for a shuffled batch of public YouTube Shorts, or let a Python engine watch public playlists, channels, and topics; downloads new vertical Shorts as high-quality MP4; learns from your in-app feedback; and serves a dark, mobile-responsive player. The Android APK caches completed videos on the phone so they still play with zero internet.

> **Important architecture:** the APK is a companion client, not a Python runtime. Run the backend on a computer, home server, VPS, or Docker host that stays online. The phone needs a connection to that backend to discover/download new videos; already-cached videos play offline. This app does **not** read YouTube's private recommendation algorithm.

## What's included

- **FastAPI + yt-dlp backend** with an asynchronous 30-minute monitoring loop and a persistent, one-at-a-time download queue.
- **SQLite** metadata, settings, queue state, watch history, learned preferences, and deletion tombstones.
- **One-tap random player:** Surprise me searches public YouTube Shorts, shuffles up to five results, downloads them, and adds them to the vertical player. Optional topic; blank uses a rotating general-topic pool. No login or source setup required.
- **Public playlist monitoring**, channel Shorts tabs, and topic search seeds for the scheduled feed.
- **Explainable feedback ranking:** watches/replays raise creator/topic affinity; skips and deletes lower it. Each candidate shows score reasons.
- **Highest-resolution MP4 video + M4A audio** selection, merged/remuxed to MP4 with FFmpeg.
- Metadata: title, creator name/channel ID/URL, channel avatar when available, view count, upload date, duration, source, and score.
- **Vertical snap-scroll player** with creator/title overlay, sound, skip, seek, watched, and prominent delete controls.
- **Mark as watched:** immediately removes the server MP4, keeps metadata/history, and blocks re-download.
- **Delete:** animates out immediately, removes the device copy, calls immediate `os.remove` on the server, deletes the video cache row, and keeps a small tombstone so the same ID is not fetched again.
- **Offline playback:** service-worker media cache in the web app; app-private MP4/metadata cache in Android. Byte-range serving supports seeking.
- **Offline action queue:** watched/delete/feedback actions sync when the backend is reachable again.
- Storage limits, download activity, manual scan, learning reset, and device-cache clearing.
- Signed Android APK, Docker/compose/systemd deployment files, backend tests, and CI.

## Quick start: backend

Requires Python 3.10+ (3.11 recommended).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Open **http://127.0.0.1:8000** and tap **Surprise me**. Leave the topic blank for a mixed shuffle, or enter something like `gaming` or `cooking`. The backend queues up to five public vertical Shorts and the player shows each MP4 when it finishes downloading. This is random public search, not YouTube's private recommendation feed.

For a scheduled feed, go to **Settings**, add a public playlist URL, `@channel`, or topic, and save. The engine scans configured sources immediately and then every 30 minutes while the server process is running. Scheduled sources are optional; Surprise me works without them and still downloads when the automatic-download toggle is off.

For a phone on the same LAN:

```bash
HOST=0.0.0.0 PORT=8000 python main.py
```

Use `http://<computer-LAN-IP>:8000` in the Android app—not `localhost`, which would mean the phone itself. Prefer HTTPS for remote access.

### Docker

```bash
SHORTS_TOKEN='choose-a-long-random-secret' docker compose up --build -d
```

The SQLite database and MP4s persist in the `shorts-data` volume. Put the service behind an HTTPS reverse proxy for remote use. `SHORTS_TOKEN` is optional but strongly recommended whenever the backend is exposed beyond a trusted machine/LAN.

### Always-on Linux service

See [`docs/offline-shorts.service`](docs/offline-shorts.service). Install the project under `/opt/A-LEAP`, create a `shorts` user, create `/var/lib/offline-shorts`, install the unit, then:

```bash
sudo systemctl enable --now offline-shorts
```

The in-process scheduler is intentionally simple: run **one** server worker. Multiple workers would each start a scheduler. Use systemd/Docker restart policy for crash recovery. Queued/downloading state is recovered on startup.

## Install the Android APK

Prebuilt file:

[`releases/Predictive-Offline-Shorts-Manager-1.1.0.apk`](releases/Predictive-Offline-Shorts-Manager-1.1.0.apk)

- Android **8.0+** (API 26), target SDK 35.
- Sideload the APK and allow installation from the browser/file manager you used. Android may show its standard unknown-app warning.
- Open **Settings → Connect your engine**, enter the backend URL and optional access token, then **Test & save connection**.
- Add sources and save preferences. Completed server downloads are cached to app-private storage automatically, within the device cache limit.
- The APK is self-signed for personal sideloading, not a Play Store listing. Signature and alignment were verified at build time. It has not been tested on a physical device in this environment.

Build it yourself with JDK 17 and Android SDK platform/build-tools 35:

```bash
bash scripts/build_apk.sh
```

The script creates `build/offline-shorts.keystore` if needed. **Back up that keystore privately and do not commit it.** Future updates must use the same signing key. Override `KEYSTORE`, `KEY_ALIAS`, and `STORE_PASSWORD` for your own key.

## How selection works

**Shuffle mode:** `POST /api/discover` accepts an optional topic and count (1–10; the player requests five). Blank topics choose from a fixed general-interest pool. The engine searches public YouTube results with `#shorts`, shuffles the result list, checks duration and portrait dimensions, skips known/watched/deleted IDs, and queues new videos without applying learned affinities. It cannot sample every Short uniformly or access your logged-in recommendations. Discovery runs in the background; progress and failures appear in the feed banner and Activity.

**Scheduled mode:** starting sources are explicit:

1. A public playlist URL (`?list=…`; not Watch Later/private library playlists).
2. Up to 10 channel handles/URLs, using their Shorts tabs.
3. Up to 10 topics, using public YouTube search restricted to vertical, short-duration results.

Every 30 minutes the engine lists sources, skips known/blocklisted IDs, extracts metadata for new candidates, scores them, and queues them highest-score-first. The score combines:

- base score and playlist priority;
- creator affinity learned from watches/replays/skips/deletes;
- title-topic affinity and your starting interests;
- modest public-view-count and recency bonuses.

Reasons are stored and shown in the player. This is a transparent local heuristic, not a claim to reproduce YouTube's private feed. YouTube extraction can fail because of region limits, age gates, anti-bot checks, or extractor changes; errors appear in Download activity. Keep `yt-dlp` updated. No YouTube login/cookies are requested.

## Offline and deletion semantics

- **Server cache** and **device cache** are separate. A video must finish downloading on the server and then finish caching on the device before it is available with zero internet.
- **Watched** frees the server file and removes the device copy; metadata/history remain.
- **Delete** removes the device copy immediately. If online, the server file and video row are removed immediately. If offline, the server action is queued and synced on reconnect. A tombstone and negative preference remain to prevent repetition.
- Browser storage can be evicted by the OS/browser under pressure. The app requests persistent storage where supported; Android uses app-private files. Uninstalling the APK or clearing app storage removes its cache.
- No automatic eviction of unwatched server videos is performed. When the server limit is reached, free space by watching/deleting items.

Use only content you have permission to save, and follow YouTube's terms and creator rights. This project is for personal offline access, not redistribution.

## Configuration

| Environment variable | Default | Purpose |
|---|---|---|
| `HOST` | `127.0.0.1` | Bind address (`0.0.0.0` for LAN/container) |
| `PORT` | `8000` | HTTP port |
| `SHORTS_DATA_DIR` | `./data` | SQLite, media, avatars, staging |
| `SHORTS_TOKEN` | empty | Optional shared secret sent as `X-Shorts-Token` |
| `SHORTS_DEMO` | `0` | Set `1` to expose original synthetic demo clips via `/api/demo` |
| `SHORTS_FRONTEND_DIR` | `./frontend` | Bundled web client location |

Settings UI controls playlist/channels/topics, auto-download, server/device cache limits, per-source scan cap, and maximum duration (15–180 seconds).

## API overview

- `GET /api/health`, `GET/PUT /api/settings`
- `GET /api/feed`, `GET /api/status`, `GET /api/queue`, `GET /api/history`
- `POST /api/scan` (configured sources)
- `POST /api/discover` with `{ "topic": "", "count": 5 }` (public shuffle; no source setup)
- `GET /media/{id}.mp4` with byte ranges
- `POST /api/videos/{id}/watched`, `DELETE /api/videos/{id}`
- `POST /api/videos/{id}/feedback` (`progress`, `skip`, `replay`, `complete`)
- `POST /api/preferences/reset`
- `GET /api/avatars/{channel_id}.jpg`

Interactive OpenAPI docs: `/docs` while the server is running.

## Tests

```bash
pip install -r requirements-dev.txt
pytest tests -q
ruff check backend tests
node --check frontend/app.js
node --check frontend/sw.js
```

The backend suite covers settings validation, range serving, immediate file/row deletion, watched history, feedback scoring, restart recovery, a delete/download publication race, and shuffle validation/filtering/count limits/error reporting/manual-download behavior. The web client was also exercised in headless Chromium for cached playback, offline reload, offline delete, reconnect sync, and mobile layout. Live YouTube extraction depends on network/YouTube availability and is not mocked as a real download in tests.

## Troubleshooting: no real Shorts appear

If the feed only shows demo clips or stays empty after tapping Surprise me or adding a channel/playlist:

1. Open **Download activity** or look at the banner on the feed — a failed scan now shows the actual error (for example `Unable to download API page: TLS/SSL connection …`).
2. That error means the **backend machine cannot reach youtube.com**. Confirm from the same machine:
   ```bash
   curl -I https://www.youtube.com
   ```
   If this fails, the network is blocking YouTube (common in restricted/sandboxed cloud environments, corporate proxies, or some VPS regions). Run the backend on a computer or server with normal, unrestricted YouTube access.
3. Make sure the source is **public** (unlisted/private playlists and age-restricted videos may need cookies — see `SHORTS_COOKIES_FILE`).
4. Keep yt-dlp current: `pip install -U yt-dlp`, then restart the backend and press **Retry**.

The Android app and the preview cannot download videos themselves — the Python backend does the downloading, so it must run somewhere YouTube is reachable.

## Project layout

```text
backend/       FastAPI app, SQLite layer, scheduler/downloader/scoring
frontend/      Dependency-free dark SPA, service worker, PWA assets
android/       Java WebView companion with native offline media cache
tests/         Backend contract and race tests
scripts/       Server launch and signed APK build
docs/          systemd unit and architecture notes
releases/      Sideloadable APK
```

The previous Reddit-short application was removed as requested. The repository's MIT license and Git history are preserved.
