#!/usr/bin/env python3
"""Build PRINT_ME.html — a one-page card with the QR code and instructions.

    python3 tools/make_poster.py [url]

The QR is embedded as a data URI so the card is a single self-contained file
you can print, email or drop in a chat.
"""
import base64
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

URL = sys.argv[1] if len(sys.argv) > 1 else "https://leosaiyanx.github.io/rocket_league_for_R3/"
QR = os.path.join(ROOT, "qr", "qr-play.png")

qr_uri = ""
if os.path.exists(QR):
    qr_uri = "data:image/png;base64," + base64.b64encode(open(QR, "rb").read()).decode()

icon = os.path.join(ROOT, "icons", "icon-192.png")
icon_uri = ""
if os.path.exists(icon):
    icon_uri = "data:image/png;base64," + base64.b64encode(open(icon, "rb").read()).decode()

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Rocket Rumble — how to play</title>
<style>
  @page {{ size: letter; margin: 12mm; }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 24px;
    font-family: "Segoe UI", Roboto, "Helvetica Neue", system-ui, sans-serif;
    color: #0e1424; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }}
  .card {{
    max-width: 760px; margin: 0 auto;
    border: 3px solid #0e1424; border-radius: 20px; overflow: hidden;
  }}
  .hero {{
    background: linear-gradient(135deg, #0b1224, #1b2a52 60%, #3a1c48);
    color: #fff; padding: 26px 30px; display: flex; align-items: center; gap: 20px;
  }}
  .hero img {{ width: 74px; height: 74px; border-radius: 17px; flex: none; }}
  .t1 {{ font-size: 15px; letter-spacing: .34em; color: #8fc4ff; font-weight: 700; }}
  .t2 {{ font-size: 40px; font-weight: 900; line-height: 1;
        background: linear-gradient(180deg,#ffd24a,#ff6b3d);
        -webkit-background-clip: text; background-clip: text; color: transparent; }}
  .t3 {{ font-size: 14px; color: #c3d3ee; margin-top: 5px; letter-spacing: .1em; }}
  .body {{ display: flex; gap: 26px; padding: 26px 30px; align-items: flex-start; }}
  .qr {{ text-align: center; flex: none; }}
  .qr img {{ width: 208px; height: 208px; display: block; border: 2px solid #0e1424; border-radius: 12px; }}
  .qr .cap {{ font-size: 12px; font-weight: 800; letter-spacing: .18em; margin-top: 9px; color: #37507c; }}
  .steps {{ flex: 1; }}
  .steps h2 {{ margin: 0 0 4px; font-size: 17px; letter-spacing: .04em; }}
  .url {{
    display: inline-block; font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 13.5px; background: #eef3fb; border: 1.5px solid #c8d8ef;
    border-radius: 8px; padding: 7px 11px; margin: 6px 0 16px; word-break: break-all;
  }}
  ol {{ margin: 0 0 14px; padding-left: 20px; }}
  li {{ margin: 7px 0; font-size: 14px; line-height: 1.5; }}
  .note {{
    background: #fff8e6; border-left: 4px solid #ffc93c; padding: 11px 14px;
    font-size: 13px; line-height: 1.55; border-radius: 0 8px 8px 0;
  }}
  .keys {{ padding: 0 30px 26px; }}
  .keys h3 {{ font-size: 13px; letter-spacing: .18em; color: #37507c; margin: 0 0 9px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  td {{ padding: 5px 8px; border-bottom: 1px solid #e6ecf6; }}
  td.k {{ width: 44%; color: #4a5c7d; }}
  kbd {{
    background: #0e1424; color: #fff; border-radius: 5px; padding: 2px 8px;
    font: 700 11.5px ui-monospace, Menlo, monospace; letter-spacing: .04em;
  }}
  .foot {{ text-align: center; font-size: 11.5px; color: #7d8ba6; padding: 0 0 20px; }}
</style>
</head>
<body>
<div class="card">
  <div class="hero">
    {icon}
    <div>
      <div class="t1">ROCKET</div>
      <div class="t2">RUMBLE</div>
      <div class="t3">R3'S TURBO LEAGUE — SOCCER, WITH ROCKET CARS</div>
    </div>
  </div>

  <div class="body">
    <div class="qr">
      {qr}
      <div class="cap">SCAN TO PLAY</div>
    </div>
    <div class="steps">
      <h2>Point your camera at the code</h2>
      <div class="url">{url}</div>
      <ol>
        <li>It opens straight in the browser — <b>nothing to download or install.</b></li>
        <li>Turn the phone <b>sideways</b> and tap <b>PLAY SEASON</b>.</li>
        <li>To make it a real app icon: <b>iPhone</b> — Share → <i>Add to Home Screen</i>.
            <b>Android</b> — ⋮ menu → <i>Install app</i>.</li>
      </ol>
      <div class="note">
        <b>No Wi-Fi where you're going?</b> Once it has loaded on that device it keeps
        working offline. For a copy that never needs the internet at all, use the single
        file <b>RocketRumble-standalone.html</b> — double-click it and it plays.
      </div>
    </div>
  </div>

  <div class="keys">
    <h3>KEYBOARD</h3>
    <table>
      <tr><td class="k">Accelerate / reverse</td><td><kbd>W</kbd> <kbd>S</kbd> or arrows</td></tr>
      <tr><td class="k">Steer</td><td><kbd>A</kbd> <kbd>D</kbd> or arrows</td></tr>
      <tr><td class="k">Jump — tap twice to flip</td><td><kbd>Space</kbd></td></tr>
      <tr><td class="k">Boost (drive up the walls!)</td><td><kbd>Shift</kbd></td></tr>
      <tr><td class="k">Powerslide</td><td><kbd>K</kbd></td></tr>
      <tr><td class="k">Pause</td><td><kbd>Esc</kbd></td></tr>
    </table>
    <p style="font-size:12.5px;color:#4a5c7d;margin:12px 0 0">
      A game controller works too — just plug it in. On a phone the car drives itself;
      steer with the stick and use the BOOST and JUMP buttons. Every key can be changed
      in <b>Controls</b>.
    </p>
  </div>

  <div class="foot">Built for Roland N. Emokpae III 🏆</div>
</div>
</body>
</html>
"""

out = os.path.join(ROOT, "PRINT_ME.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(HTML.format(
        url=URL,
        qr=('<img src="%s" alt="QR code">' % qr_uri) if qr_uri
           else '<div style="padding:40px;border:2px dashed #999">run make_qr.py first</div>',
        icon=('<img src="%s" alt="">' % icon_uri) if icon_uri else "",
    ))
print("wrote", out, "->", URL)
