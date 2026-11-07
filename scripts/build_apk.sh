#!/usr/bin/env bash
# Build a signed, sideloadable Android companion APK.
# Requirements: JDK 17+, Android SDK platform 35 and build-tools 35+.
# Override ANDROID_HOME, JAVA_HOME, KEYSTORE, KEY_ALIAS, STORE_PASSWORD.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BUILD="$ROOT/build/apk"
OUT="$ROOT/releases"
mkdir -p "$BUILD/classes" "$BUILD/dex" "$BUILD/assets/www" "$OUT"

if [[ -n "${ANDROID_HOME:-}" ]]; then SDK="$ANDROID_HOME"; elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then SDK="$ANDROID_SDK_ROOT"; else SDK="${HOME}/Android/Sdk"; fi
BT="$(find "$SDK/build-tools" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -1)"
JAR="$SDK/platforms/android-35/android.jar"
[[ -f "$JAR" ]] || { echo "Missing $JAR. Install Android SDK platform 35." >&2; exit 1; }
[[ -x "$BT/aapt2" ]] || { echo "Missing Android build-tools in $SDK." >&2; exit 1; }
JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}java"
JAVAC_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
KEYTOOL_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}keytool"

"$BT/aapt2" compile --dir android/res -o "$BUILD/resources.zip"
"$BT/aapt2" link -o "$BUILD/unsigned.apk" -I "$JAR" \
  --manifest android/AndroidManifest.xml --min-sdk-version 26 --target-sdk-version 35 \
  --version-code 2 --version-name 1.1.0 "$BUILD/resources.zip"

find android/src -name '*.java' > "$BUILD/sources.txt"
"$JAVAC_BIN" -source 8 -target 8 -bootclasspath "$JAR" -d "$BUILD/classes" @"$BUILD/sources.txt"
CLASS_FILES=()
while IFS= read -r f; do CLASS_FILES+=("$f"); done < <(find "$BUILD/classes" -name '*.class')
"$BT/d8" --release --min-api 26 --lib "$JAR" --output "$BUILD/dex" "${CLASS_FILES[@]}"

cp frontend/*.html frontend/*.js frontend/*.css frontend/*.svg frontend/*.png frontend/*.webmanifest "$BUILD/assets/www/"
python3 - "$BUILD" <<'PY'
import pathlib, sys, zipfile
build = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(build / 'unsigned.apk', 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(build / 'dex/classes.dex', 'classes.dex')
    for path in sorted((build / 'assets/www').rglob('*')):
        if path.is_file():
            z.write(path, 'assets/www/' + path.relative_to(build / 'assets/www').as_posix())
PY

"$BT/zipalign" -f -p 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"
KEYSTORE="${KEYSTORE:-$ROOT/build/offline-shorts.keystore}"
ALIAS="${KEY_ALIAS:-offline-shorts}"
STORE_PASSWORD="${STORE_PASSWORD:-android}"
if [[ ! -f "$KEYSTORE" ]]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  "$KEYTOOL_BIN" -genkeypair -keystore "$KEYSTORE" -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$STORE_PASSWORD" -keypass "$STORE_PASSWORD" \
    -dname "CN=Offline Shorts, OU=Personal, O=Offline Shorts, L=Local, C=US"
  echo "Created local signing key: $KEYSTORE. Back it up privately; future updates must use the same key."
fi
"$JAVA_BIN" -jar "$BT/lib/apksigner.jar" sign --ks "$KEYSTORE" --ks-key-alias "$ALIAS" \
  --ks-pass "pass:$STORE_PASSWORD" --key-pass "pass:$STORE_PASSWORD" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false \
  --out "$OUT/Predictive-Offline-Shorts-Manager-1.1.0.apk" "$BUILD/aligned.apk"
"$JAVA_BIN" -jar "$BT/lib/apksigner.jar" verify --verbose --print-certs \
  "$OUT/Predictive-Offline-Shorts-Manager-1.1.0.apk"
"$BT/zipalign" -c -p 4 "$OUT/Predictive-Offline-Shorts-Manager-1.1.0.apk"
echo "APK ready: $OUT/Predictive-Offline-Shorts-Manager-1.1.0.apk"
