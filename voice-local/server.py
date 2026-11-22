"""
LegalSetu — local voice server (used when "Ollama mode" is ON)
------------------------------------------------------------------
Speech-to-text (and optionally text-to-speech) on THIS computer, so voice
mode needs no Sarvam / Groq API key at all.

    python voice-local/server.py            # Next.js also starts it on demand

Endpoints (127.0.0.1 only):
    GET  /health                     -> {"ok": true, "stt": {...}, "tts": [...]}
    POST /stt?hint=hi                -> {"text", "language", "duration", "ms"}
         body = raw audio bytes (webm/opus, ogg, wav, mp4 — anything PyAV decodes)
    POST /tts  {"text", "lang"}      -> audio/wav   (only if piper-tts + a voice exist)

Why a long-lived process: loading Whisper takes several seconds; a fresh
`python` per utterance would add that to every sentence the user speaks.

Env:
    LOCAL_VOICE_PORT      default 8765
    LOCAL_STT_MODEL       default "small"  (base = faster, worse Hindi;
                                            medium = better, ~3x slower)
    LOCAL_STT_THREADS     default = physical cores (cpu_count // 2, max 8)
    LOCAL_TTS_VOICES_DIR  default voice-local/voices  (piper *.onnx files,
                          named like hi_IN-pratham-medium.onnx)
"""

from __future__ import annotations

import io
import json
import os
import re
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
from faster_whisper import WhisperModel
import subprocess

import av

HERE = Path(__file__).resolve().parent
PORT = int(os.environ.get("LOCAL_VOICE_PORT", "8765"))
MODEL_NAME = os.environ.get("LOCAL_STT_MODEL", "small").strip() or "small"
# Physical cores, not logical: SMT siblings slow int8 matrix work down.
THREADS = int(os.environ.get("LOCAL_STT_THREADS", "0")) or max(2, min(8, (os.cpu_count() or 4) // 2))
VOICES_DIR = Path(os.environ.get("LOCAL_TTS_VOICES_DIR", str(HERE / "voices")))
SAMPLE_RATE = 16_000

# Languages the app supports that Whisper knows. Auto-detection is limited to
# these (plus English): on short clips a small Whisper model happily "hears"
# Hindi as Urdu, Nepali or even Welsh, which would answer in the wrong script.
APP_LANGS = {"en", "hi", "bn", "mr", "te", "ta", "gu", "ur", "kn", "ml", "pa", "as", "or"}
# App language -> the Whisper language to transcribe it as.
HINT_TO_WHISPER = {"mai": "hi", "bho": "hi", "sat": "hi", "or": "hi"}

# Whisper's well-known phantom outputs on silence / noise.
PHANTOMS = re.compile(
    r"^\s*(thank you\.?|thanks for watching!?|you|bye\.?|\.+|subtitles by.*|"
    r"धन्यवाद\.?|शुक्रिया\.?)\s*$",
    re.IGNORECASE,
)


# Hindi transcripts in the log must not crash a cp1252 Windows console.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass


def log(*parts: object) -> None:
    print("[local-voice]", *parts, flush=True)


def decode_audio(data: bytes) -> np.ndarray:
    """Any container the browser records (webm/opus, ogg, mp4, wav) -> 16 kHz mono float32.

    faster_whisper.audio.decode_audio is not used: it passes an argument that
    PyAV 14+ removed. PyAV in-process first (fast); the ffmpeg CLI if PyAV
    cannot parse the clip (e.g. a webm whose header chunk is missing).
    """
    try:
        resampler = av.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
        parts: list[np.ndarray] = []
        with av.open(io.BytesIO(data), mode="r") as container:
            for frame in container.decode(audio=0):
                for out in resampler.resample(frame):
                    parts.append(out.to_ndarray().reshape(-1))
        for out in resampler.resample(None):
            parts.append(out.to_ndarray().reshape(-1))
        if parts:
            return np.concatenate(parts).astype(np.float32) / 32768.0
    except Exception as err:  # noqa: BLE001
        log(f"PyAV could not decode clip ({err!r}); trying ffmpeg")
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", "pipe:0",
         "-f", "s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "pipe:1"],
        input=data, capture_output=True, timeout=30, check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"could not decode audio: {proc.stderr.decode(errors='replace')[:160]}")
    return np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0


# ---------------------------------------------------------------- STT ----
log(f"loading Whisper '{MODEL_NAME}' on CPU ({THREADS} threads)...")
_t0 = time.time()
MODEL = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8", cpu_threads=THREADS)
STT_LOCK = threading.Lock()
# Warm the kernels once so the first real utterance is not the slow one.
MODEL.transcribe(np.zeros(SAMPLE_RATE, dtype=np.float32), language="en", beam_size=1)
log(f"Whisper ready in {time.time() - _t0:.1f}s")


def _run(audio: np.ndarray, language: str | None):
    seconds = len(audio) / SAMPLE_RATE
    segments, info = MODEL.transcribe(
        audio,
        language=language,
        beam_size=1,
        # Greedy first; if the output is a repetition loop (compression ratio
        # too high) or very unlikely, Whisper retries a little warmer. With a
        # single temperature it had no way out of "बद्रादी बद्रादी बद्रादी…".
        temperature=[0.0, 0.2, 0.4],
        compression_ratio_threshold=2.2,
        # A loop also burns time decoding up to 448 tokens. Speech is at most
        # ~5 tokens a second even in Devanagari; cap well above that.
        max_new_tokens=int(min(440, 40 + seconds * 14)),
        condition_on_previous_text=False,
        without_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
    )
    return list(segments), info


def acceptable(language: str, hint: str | None) -> bool:
    return language in APP_LANGS and not (language == "ur" and hint != "ur")


def pick_from(probs, hint: str | None) -> str:
    """Most likely language among the ones the app supports (+ the UI hint)."""
    candidates = set(APP_LANGS)
    if hint:
        candidates.add(HINT_TO_WHISPER.get(hint, hint))
    ranked = [(code, p) for code, p in (probs or []) if code in candidates]
    best = max(ranked, key=lambda x: x[1])[0] if ranked else "en"
    # Spoken Hindi and Urdu sound the same; Whisper picks Urdu (Arabic
    # script) far too often. Keep Urdu only when the user chose it.
    return "hi" if best == "ur" and hint != "ur" else best


def collapse_repeats(text: str) -> str:
    """Last line of defence against a repetition loop: a word (or short
    phrase) said more than 3 times in a row is kept once. Nobody asks a
    legal question by saying the same word four times running."""
    words = text.split()
    for n in (1, 2, 3):
        out: list[str] = []
        i = 0
        while i < len(words):
            gram = words[i:i + n]
            run = 1
            while words[i + run * n:i + (run + 1) * n] == gram:
                run += 1
            if run > 3:
                out.extend(gram)
                i += run * n
            else:
                out.append(words[i])
                i += 1
        words = out
    return " ".join(words)


def transcribe(data: bytes, hint: str | None) -> dict:
    started = time.time()
    audio = decode_audio(data)
    duration = len(audio) / SAMPLE_RATE
    if duration < 0.3 or float(np.abs(audio).max(initial=0.0)) < 1e-3:
        return {"text": "", "language": None, "duration": duration, "ms": 0}

    with STT_LOCK:
        # One pass: Whisper detects the language from the same encoder output
        # it then decodes, so detection is nearly free. Only when it lands on
        # a language the app does not speak (or Urdu for Hindi) is the clip
        # decoded a second time with the closest supported language forced.
        segments, info = _run(audio, None)
        language = info.language
        if not acceptable(language, hint):
            language = pick_from(info.all_language_probs, hint)
            segments, _ = _run(audio, language)

    speech = [s for s in segments if not (s.no_speech_prob > 0.6 and s.avg_logprob < -0.7)]
    text = collapse_repeats(" ".join(s.text.strip() for s in speech).strip())
    if PHANTOMS.match(text):
        text = ""
    return {
        "text": text,
        "language": language if text else None,
        "duration": round(duration, 2),
        "ms": int((time.time() - started) * 1000),
    }


# ---------------------------------------------------------------- TTS ----
# Optional: only when `pip install piper-tts` has been done AND at least one
# voice (.onnx + .onnx.json) is in VOICES_DIR. Without it the browser speaks.
TTS_VOICES: dict[str, object] = {}
TTS_LOCK = threading.Lock()
try:
    from piper import PiperVoice  # type: ignore

    for onnx in sorted(VOICES_DIR.glob("*.onnx")):
        lang = onnx.name.split("_")[0].lower()  # hi_IN-pratham-medium.onnx -> hi
        if lang in TTS_VOICES:
            continue
        try:
            TTS_VOICES[lang] = PiperVoice.load(str(onnx))
            log(f"TTS voice for '{lang}': {onnx.name}")
        except Exception as err:  # noqa: BLE001
            log(f"could not load {onnx.name}: {err}")
except ImportError:
    pass
if not TTS_VOICES:
    log("no local TTS voices (optional) - the browser will speak replies")


def speak(text: str, lang: str) -> bytes | None:
    voice = TTS_VOICES.get(lang) or TTS_VOICES.get(HINT_TO_WHISPER.get(lang, ""))
    if voice is None:
        return None
    buf = io.BytesIO()
    with TTS_LOCK, wave.open(buf, "wb") as wav:
        voice.synthesize_wav(text, wav)  # type: ignore[attr-defined]
    return buf.getvalue()


# --------------------------------------------------------------- HTTP ----
MAX_BODY = 8 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "LegalSetuLocalVoice/1.0"

    def log_message(self, *_args) -> None:  # quiet: one line per request below
        pass

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> bytes | None:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return None
        return self.rfile.read(length)

    def do_GET(self) -> None:  # noqa: N802
        if urlparse(self.path).path == "/health":
            self._json(200, {
                "ok": True,
                "stt": {"model": MODEL_NAME, "threads": THREADS},
                "tts": sorted(TTS_VOICES.keys()),
            })
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        try:
            if url.path == "/stt":
                data = self._body()
                if data is None:
                    return self._json(413, {"error": "empty or too large"})
                hint = (parse_qs(url.query).get("hint") or [None])[0]
                result = transcribe(data, hint)
                log(f"stt {result['duration']}s -> {result['language']} in {result['ms']}ms: {result['text'][:60]!r}")
                return self._json(200, result)

            if url.path == "/tts":
                data = self._body()
                req = json.loads(data or b"{}")
                text = str(req.get("text", "")).strip()[:600]
                lang = str(req.get("lang", "en")).split("-")[0].lower()
                if not text:
                    return self._json(422, {"error": "no text"})
                audio = speak(text, lang)
                if audio is None:
                    return self._json(422, {"error": f"no local voice for '{lang}'"})
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(audio)))
                self.end_headers()
                self.wfile.write(audio)
                return

            self._json(404, {"error": "not found"})
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            # The caller gave up (timeout, page closed). Nothing to send.
            log(f"client disconnected during {url.path}")
        except Exception as err:  # noqa: BLE001 — never kill the server on one bad clip
            log(f"error on {url.path}: {err!r}")
            try:
                self._json(500, {"error": str(err)[:200]})
            except OSError:
                pass


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    log(f"listening on http://127.0.0.1:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    sys.exit(main())
