"""Build bakeoff/index.html: a blind A/B/C… listening page for the rendered samples."""
import base64
import html
import json
import random
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent


def embedded(name: str) -> str:
    """Encode a sample to AAC and inline it, so the page works as a single file (Mac, iPhone, anywhere)."""
    wav, m4a = HERE / "samples" / f"{name}.wav", HERE / "samples" / f"{name}.m4a"
    if not m4a.exists() or m4a.stat().st_mtime < wav.stat().st_mtime:
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", str(wav), str(m4a)], check=True)
    return "data:audio/mp4;base64," + base64.b64encode(m4a.read_bytes()).decode()

metas = [json.loads(p.read_text()) for p in sorted((HERE / "samples").glob("*.json"))]
random.Random(7).shuffle(metas)

cards = []
for i, m in enumerate(metas):
    letter = chr(65 + i)
    rt = f"{m['speed_x']}× tempo real" if m["speed_x"] >= 1 else f"{1 / m['speed_x']:.1f}× mais lento que tempo real"
    book_h = 10 / m["speed_x"]
    cards.append(f"""
    <article class="card">
      <header><span class="letter">Voz {letter}</span>
        <span class="reveal">{html.escape(m['label'])}<small>{rt} · livro inteiro ≈ {book_h:.1f} h de geração · amostra {m['audio_s']:.0f} s</small></span>
      </header>
      <audio controls preload="metadata" src="{embedded(m['name'])}"></audio>
      <div class="rate" role="group" aria-label="Nota para a Voz {letter}">
        {''.join(f'<button data-v="{m["name"]}" data-s="{s}">{s}</button>' for s in range(1, 6))}
      </div>
    </article>""")

page = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Teste de vozes</title>
<style>
:root {{ --bg:#faf7f2; --fg:#1d1b18; --muted:#6b645a; --card:#fff; --line:#e7e0d5; --accent:#c2410c; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#16140f; --fg:#efe9df; --muted:#a39a8c; --card:#211e18; --line:#363027; --accent:#fb923c; }} }}
* {{ box-sizing:border-box }} body {{ margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 -apple-system,system-ui,sans-serif; }}
main {{ max-width:760px; margin:0 auto; padding:32px 16px 64px; }}
h1 {{ font-size:28px; margin:0 0 4px }} p.lead {{ color:var(--muted); margin:0 0 24px }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; margin:12px 0; }}
.card header {{ display:flex; gap:12px; align-items:baseline; flex-wrap:wrap; margin-bottom:10px }}
.letter {{ font-weight:700; font-size:18px }}
.reveal {{ color:var(--muted); display:none }} .reveal small {{ display:block; font-size:13px }}
body.revealed .reveal {{ display:inline }}
audio {{ width:100% }}
.rate {{ display:flex; gap:6px; margin-top:10px }}
.rate button {{ width:40px; height:36px; border-radius:8px; border:1px solid var(--line); background:transparent; color:var(--fg); font-size:15px; cursor:pointer }}
.rate button.on {{ background:var(--accent); border-color:var(--accent); color:#fff }}
.bar {{ display:flex; gap:12px; align-items:center; margin:8px 0 20px; flex-wrap:wrap }}
.bar button {{ padding:8px 14px; border-radius:8px; border:1px solid var(--line); background:var(--card); color:var(--fg); cursor:pointer }}
details {{ color:var(--muted); margin-top:28px }} details p {{ white-space:pre-wrap }}
</style></head><body><main>
<h1>Teste de vozes</h1>
<p class="lead">Mesmo trecho (abertura do capítulo 1, um trecho com números e uma conversa) em cada modelo local. Ouça, dê uma nota de 1 a 5 e só depois revele os nomes.</p>
<div class="bar"><button id="rv">Revelar modelos</button><span id="best"></span></div>
{''.join(cards)}
<details><summary>Texto lido (após normalização)</summary><p>{html.escape(json.loads((HERE / 'passage.json').read_text())['text'])}</p></details>
</main>
<script>
const KEY='bakeoff-ratings'; let r={{}}; try {{ r=JSON.parse(localStorage.getItem(KEY))||{{}} }} catch(e) {{}}
const paint=()=>{{ document.querySelectorAll('.rate button').forEach(b=>b.classList.toggle('on', r[b.dataset.v]==b.dataset.s));
  const top=Object.entries(r).sort((a,b)=>b[1]-a[1])[0]; document.getElementById('best').textContent = top && document.body.classList.contains('revealed') ? 'Sua favorita até agora: '+top[0] : ''; }};
document.querySelectorAll('.rate button').forEach(b=>b.onclick=()=>{{ r[b.dataset.v]=+b.dataset.s; try {{ localStorage.setItem(KEY, JSON.stringify(r)) }} catch(e) {{}} paint(); }});
document.getElementById('rv').onclick=()=>{{ document.body.classList.toggle('revealed'); paint(); }};
document.querySelectorAll('audio').forEach(a=>a.addEventListener('play',()=>document.querySelectorAll('audio').forEach(o=>o!==a&&o.pause())));
paint();
</script></body></html>"""
(HERE / "index.html").write_text(page)
print(f"wrote index.html with {len(metas)} samples")
