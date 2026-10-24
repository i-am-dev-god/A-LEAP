"""Optional: upload straight to YouTube.

Clicking "upload" is the only step most faceless pipelines leave to you, which
is exactly why they never become a channel: the friction is at the end. This
module talks to the YouTube Data API with a refresh token you obtain once
(`leap auth`), uploads the file, and sets the thumbnail.
"""
from __future__ import annotations

import http.server
import json
import secrets
import threading
import urllib.parse
import urllib.request
import webbrowser
from dataclasses import dataclass
from pathlib import Path

from .providers.base import ProviderError, env

SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"


@dataclass
class YoutubeTarget:
    client_id: str
    client_secret: str
    refresh_token: str

    @classmethod
    def from_env(cls) -> "YoutubeTarget":
        client_id = env("YT_CLIENT_ID")
        client_secret = env("YT_CLIENT_SECRET")
        refresh = env("YT_REFRESH_TOKEN")
        if not all((client_id, client_secret, refresh)):
            raise ProviderError(
                "YouTube upload needs YT_CLIENT_ID, YT_CLIENT_SECRET and YT_REFRESH_TOKEN. "
                "Run `leap auth` once to get them (or upload manually - `leap render` "
                "always writes a ready-to-paste description next to the mp4)."
            )
        return cls(client_id, client_secret, refresh)

    def access_token(self) -> str:
        data = urllib.parse.urlencode({
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": self.refresh_token,
            "grant_type": "refresh_token",
        }).encode()
        req = urllib.request.Request(TOKEN_URL, data=data, method="POST",
                                     headers={"Content-Type": "application/x-www-form-urlencoded"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                payload = json.loads(resp.read())
        except Exception as exc:  # noqa: BLE001
            raise ProviderError(f"Google token refresh failed: {exc}") from exc
        token = payload.get("access_token")
        if not token:
            raise ProviderError(f"Google token refresh returned no access_token: {payload}")
        return token


# --------------------------------------------------------------------------
# one-time authorisation (installed app, loopback redirect, PKCE)
# --------------------------------------------------------------------------


def interactive_auth(port: int = 8089) -> dict[str, str]:
    client_id = env("YT_CLIENT_ID")
    client_secret = env("YT_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise ProviderError("set YT_CLIENT_ID and YT_CLIENT_SECRET first (Google Cloud -> "
                            "OAuth client -> Desktop app)")
    verifier = secrets.token_urlsafe(64)
    import hashlib, base64

    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    redirect = f"http://127.0.0.1:{port}/"
    params = {
        "client_id": client_id,
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    url = f"{AUTH_URL}?{urllib.parse.urlencode(params)}"
    holder: dict[str, str] = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            holder.update({k: v[0] for k, v in query.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h2>LEAP is authorised. Close this tab.</h2>")

        def log_message(self, *args):  # silence
            return

    server = http.server.HTTPServer(("127.0.0.1", port), Handler)
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()
    print("Opening the Google consent screen...\n" + url)
    webbrowser.open(url)
    thread.join(timeout=300)
    server.server_close()
    if "code" not in holder:
        raise ProviderError("no authorisation code received")
    data = urllib.parse.urlencode({
        "client_id": client_id, "client_secret": client_secret,
        "code": holder["code"], "code_verifier": verifier,
        "grant_type": "authorization_code", "redirect_uri": redirect,
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=data, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read())
    refresh = payload.get("refresh_token", "")
    print("\nAdd these to your .env:")
    print(f"YT_REFRESH_TOKEN={refresh}")
    return {"YT_REFRESH_TOKEN": refresh}


# --------------------------------------------------------------------------
# upload
# --------------------------------------------------------------------------


def upload(video: Path, *, title: str, description: str, tags: list[str],
           privacy: str = "unlisted", thumbnail: Path | None = None,
           synthetic: bool = True, made_for_kids: bool = False,
           category_id: str = "27", target: YoutubeTarget | None = None) -> str:
    target = target or YoutubeTarget.from_env()
    token = target.access_token()
    metadata = {
        "snippet": {
            "title": title[:100],
            "description": description[:4900],
            "tags": [t[:30] for t in tags][:30],
            "categoryId": category_id,
        },
        "status": {
            "privacyStatus": privacy,
            "selfDeclaredMadeForKids": made_for_kids,
        },
    }
    if synthetic:
        # YouTube's altered-content disclosure, set programmatically
        metadata["status"]["containsSyntheticMedia"] = True

    init_url = ("https://www.googleapis.com/upload/youtube/v3/videos"
                "?uploadType=resumable&part=snippet,status")
    body = json.dumps(metadata).encode()
    size = video.stat().st_size
    req = urllib.request.Request(init_url, data=body, method="POST", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": str(size),
        "X-Upload-Content-Type": "video/mp4",
    })
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            session = resp.headers.get("Location", "")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:800]
        raise ProviderError(f"upload init failed (HTTP {exc.code}): {detail}") from exc
    if not session:
        raise ProviderError("YouTube did not return an upload session URL")

    with open(video, "rb") as fh:
        data = fh.read()
    put = urllib.request.Request(session, data=data, method="PUT", headers={
        "Content-Type": "video/mp4", "Content-Length": str(size),
    })
    try:
        with urllib.request.urlopen(put, timeout=1800) as resp:
            result = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:800]
        raise ProviderError(f"upload failed (HTTP {exc.code}): {detail}") from exc

    video_id = result.get("id", "")
    if thumbnail and thumbnail.exists() and video_id:
        try:
            _set_thumbnail(video_id, thumbnail, token)
        except ProviderError as exc:
            print(f"  (thumbnail not set: {exc})")
    return video_id


def _set_thumbnail(video_id: str, thumbnail: Path, token: str) -> None:
    data = thumbnail.read_bytes()
    req = urllib.request.Request(
        f"https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={video_id}",
        data=data, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "image/png"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120):
            return
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        raise ProviderError(f"HTTP {exc.code}: {detail}") from exc
