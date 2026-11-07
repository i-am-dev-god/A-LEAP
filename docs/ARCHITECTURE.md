# Architecture notes

## Processes

One Uvicorn process hosts the API, static SPA, byte-range media endpoint, scheduler task, and download worker. SQLite WAL mode allows short concurrent reads/writes. Blocking yt-dlp calls run in threads so the UI/API event loop stays responsive.

The scheduler scans configured public sources every 1800 seconds. The worker publishes a staged MP4 only after checking tombstones and video status under the same lock used by deletion. This closes the delete-versus-finishing-download race. Interrupted downloads return to the queue on restart; completed files missing from disk are requeued unless watched/deleted.

## Data

`videos` holds candidates/queue/ready/watched metadata. `tombstones` stores watched/deleted IDs so scans do not resurrect them. `events` stores watch/skip/delete history. `preferences` stores bounded creator/topic affinities. `channels` caches avatar URLs/files. Deleting a video removes its `videos` row and MP4 immediately but intentionally retains a tombstone, history event, and aggregate preference signal.

## Web offline path

The service worker precaches the local shell and caches complete MP4 responses. Range requests are sliced from the cached blob, so seeking does not require the network. Feed/settings snapshots and pending mutations are also kept in localStorage by the client. Terminal actions are idempotent; queued actions replay on reconnect.

## Android offline path

The APK bundles the same SPA under `assets/www` and serves it from a virtual HTTPS origin through `WebViewClient.shouldInterceptRequest`. API calls use a narrow JavaScript bridge backed by `HttpURLConnection`; completed media and metadata snapshots live in app-private storage. Media responses support byte ranges from local files. Local deletion sets a cancellation flag and unlinks the file/part file without waiting for an in-progress transfer.

The Python/yt-dlp engine is remote. Android does not execute Python, and background discovery continues on the server while the APK is closed. New device caching happens when the companion is open and connected.

## Security boundaries

Only YouTube playlist/channel URL shapes are accepted. Media paths are derived from validated IDs and database filenames. Avatar downloads are restricted to YouTube avatar CDN hosts. The optional shared secret protects API/media routes. The Android WebView blocks external navigation and exposes its bridge only to the bundled virtual origin. Use HTTPS and a strong token for remote deployment; LAN HTTP is supported for personal setup convenience.

## Known limitations

- YouTube may rate-limit or block datacenter IPs; yt-dlp extractors require updates over time.
- Channel avatars are best-effort from channel metadata; a creator initial is shown when unavailable.
- Highest-quality MP4 can use codecs not supported by older devices; Android 8+ is the minimum, but actual codec support varies by device.
- Browser/PWA storage is quota-managed and can be evicted; Android app-private storage is more durable but is removed on uninstall/clear-data.
- The APK is sideload-signed and was signature/alignment verified, not physically device-tested or Play Store reviewed.
