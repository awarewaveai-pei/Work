"""Real-chain test: stream a 16 kHz WAV to a running meeting-service's /api/live/ws at real-time
pace and print caption timings, each final line with its start..end in the recording (= seconds into
the WAV, comparable with where the speech really is). A stereo WAV is sent as two channels (proto 2):
left = 我 (recognised by me=, default local), right = 對方 (recognised by the second argument).
usage: python tools/feed.py <wav> <gemini|local> [port] [save] [listen=<code>] [target=<code>|none] [me=<gemini|local>]
(default port 8431, listen en-US, target zh-TW: lib/live/langs.py codes; never point it at 8420 while in use)
`save` keeps the session (recording, transcript.md, session.json) in the server's OWNVOICE_SESSIONS_DIR:
only against a server started with that pointed at a temp folder."""
import asyncio
import json
import sys
import time
import wave

import numpy as np
from websockets.asyncio.client import connect

RATE = 16000


async def main(wav_path: str, stt: str, port: str, save: bool, listen: str, target: str, me: str) -> None:
    with wave.open(wav_path, "rb") as w:
        assert (w.getframerate(), w.getsampwidth()) == (RATE, 2) and w.getnchannels() in (1, 2), w.getparams()
        frames = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, w.getnchannels())
    two = frames.shape[1] == 2
    pcm = np.abs(frames).max(axis=1)
    voiced = np.where(np.abs(pcm) > 500)[0]
    speech_start, speech_end = voiced[0] / RATE, voiced[-1] / RATE
    print(f"audio {len(pcm) / RATE:.1f}s, speech {speech_start:.2f}..{speech_end:.2f}s")
    async with connect(f"ws://127.0.0.1:{port}/api/live/ws", origin=f"http://127.0.0.1:{port}") as ws:
        t0 = None
        marks = {"finals": [], "tr": {}}

        async def reader():
            async for raw in ws:
                ev = json.loads(raw)
                rel = time.monotonic() - t0 if t0 else 0
                if ev["type"] == "caption":
                    if not ev["final"] and ev["text"] != "…":
                        marks.setdefault("first_interim", rel)
                    if ev["final"] and not ev["tr"]:
                        marks["finals"].append((rel, ev["id"], ev["start"], ev["end"]))
                    if ev["tr"] and not ev["final"]:
                        marks.setdefault("first_early_tr", rel)
                    if ev["final"] and ev["tr"]:
                        marks["tr"][ev["id"]] = rel
                    print(f"{rel:6.2f} cap#{ev['id']} {ev['who']} final={ev['final']} [{ev['start']:.2f}..{ev['end']:.2f}] "
                          f"text={ev['text'][:70]!r} tr={ev['tr'][:40]!r}")
                elif ev["type"] in ("status", "listening"):
                    print(f"{rel:6.2f} {ev}")
                elif ev["type"] == "usage":
                    marks["usage"] = ev

        r = asyncio.ensure_future(reader())
        start = {"type": "start", "stt": stt, "listen": listen, "target": target, "save": save}
        await ws.send(json.dumps({**start, "proto": 2, "stt_me": me} if two else start))
        await asyncio.sleep(3.0 if stt == "gemini" else 1.0)
        t0 = time.monotonic()
        data = np.concatenate([frames, np.zeros((RATE * 8, frames.shape[1]), dtype=np.int16)])
        for i in range(0, len(data), 1600):
            if two:
                for source in (0, 1):
                    await ws.send(bytes([source]) + data[i:i + 1600, source].tobytes())
            else:
                await ws.send(data[i:i + 1600, 0].tobytes())
            await asyncio.sleep(max(0, t0 + (i + 1600) / RATE - time.monotonic()))
        await ws.send(json.dumps({"type": "stop"}))
        await asyncio.sleep(3)
        r.cancel()
    print("---")
    if "first_interim" in marks:
        print(f"first gray text: {marks['first_interim'] - speech_start:.2f}s after speech start")
    if "first_early_tr" in marks:
        print(f"first early translation at {marks['first_early_tr']:.2f}s")
    for rel, id, start, end in marks["finals"]:
        tr = marks["tr"].get(id)
        print(f"final #{id} [{start:.2f}..{end:.2f}] at {rel:.2f}s; " + (f"translation +{tr - rel:.2f}s" if tr else "no translation"))
    if marks["finals"]:
        rel, id = marks["finals"][-1][:2]
        tr = marks["tr"].get(id)
        print(f"last sentence: speech end -> final {rel - speech_end:.2f}s" + (f", -> translation {tr - speech_end:.2f}s" if tr else ""))
    u = marks.get("usage")
    if u:
        print("usage NT$", u["total_twd"], [(m["id"], round(m["audio_secs"], 1), m["requests"], m["twd"]) for m in u["models"]])


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[2] not in ("gemini", "local"):
        sys.exit(__doc__)
    extra = sys.argv[4:]
    opts = dict(a.split("=", 1) for a in extra if "=" in a)
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "8431", "save" in extra,
                     opts.get("listen", "en-US"), opts.get("target", "zh-TW"), opts.get("me", "local")))
