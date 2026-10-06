"""Fetch candidate TTS models file-by-file (avoids the rate-limited tree API)."""
import json, time, urllib.request, sys
from huggingface_hub import hf_hub_download

REPOS = {
    "mlx-community/Kokoro-82M-bf16": lambda f: not f.startswith("voices/") or f.split("/")[-1][:2] in ("pf", "pm"),
    "mlx-community/OmniVoice-8bit": None,
    "mlx-community/Voxtral-4B-TTS-2603-mlx-6bit": None,
    "mlx-community/chatterbox-multilingual-v3": None,
    "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit": None,
}

def retry(fn, tries=8):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:
            wait = min(300, 15 * 2 ** i)
            print(f"   retry {i+1} in {wait}s: {str(e)[:120]}", flush=True)
            time.sleep(wait)
    raise RuntimeError("giving up")

for repo, keep in REPOS.items():
    t = time.time()
    info = retry(lambda: json.load(urllib.request.urlopen(f"https://huggingface.co/api/models/{repo}")))
    files = [s["rfilename"] for s in info["siblings"] if not keep or keep(s["rfilename"])]
    for f in files:
        retry(lambda: hf_hub_download(repo, f, revision=info["sha"]))
    print(f"OK {repo} ({len(files)} files) {time.time()-t:.0f}s", flush=True)
print("ALL DONE", flush=True)
