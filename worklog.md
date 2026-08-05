# Work Log — Voice Line Project

---
Task ID: 1
Agent: Main
Task: Generate comprehensive PRD document (.docx)

Work Log:
- Loaded docx skill and all reference files (design-system.md, common-rules.md, toc.md, report.md, create.md)
- Selected cover recipe: R4 (Top Color Block) with GO-1 (Graphite Orange) palette
- Authored 17 PRD sections with substantive content (~4000+ words body text)
- Generated docx with: R4 cover, 3-section page numbering (cover hidden, TOC Roman, body Arabic), TOC with placeholders, 3 data tables (metrics, dependencies, phases)
- Ran add_toc_placeholders.py — 46 headings indexed
- Ran postcheck.py — 0 errors, 2 minor warnings (expected)

Stage Summary:
- Deliverable: /home/z/my-project/download/Voice_Line_PRD.docx
- All 17 user-required PRD sections present with substantive content
- Professional formatting with TOC, cover, tables, headers/footers
- Ready for review before proceeding to Phase 2 (voice pipeline implementation)

---
Task ID: 2
Agent: Main
Task: Build voice-line Python system (ears, brain, mouth, ptt, ducking, signals, main)

Work Log:
- Created project at /home/z/my-project/voice-line/ with pyproject.toml (uv, Python 3.12)
- Wrote signals.py: file-based signal bus (.voice_state, .voice_waveform, .voice_loading_pid)
- Wrote ears.py: sounddevice capture, Whisper STT via httpx, level metering, webrtcvad support
- Wrote brain.py: Z.ai streaming via httpx, sentence chunking, quit phrases, warmup query, write-for-ear system prompt
- Wrote mouth.py: Kokoro TTS + ElevenLabs with ffmpeg decode/resample, sentence queue, interrupt, signal bus waveform feed
- Wrote ptt.py: PTT controller (pynput, key-repeat filter, tap threshold, interrupt), OpenMicController (webrtcvad endpointing)
- Wrote ducking.py: Spotify volume ducking (macOS AppleScript, Linux D-Bus/MPRIS, Windows stub)
- Wrote main.py: VoiceLine coordinator, service health checks, asyncio event loop, typed input, graceful shutdown
- Wrote run-voice-line.sh: dependency checker + launcher script

Stage Summary:
- 8 Python modules + 1 shell launcher in /home/z/my-project/voice-line/
- Half-duplex architecture, sentence-chunked streaming, dual TTS paths
- All major features from spec implemented

---
Task ID: 3
Agent: Main
Task: Build voice-visualizer (index.html + server.py + launcher)

Work Log:
- Created 1021-line self-contained HTML file with neon city equalizer scene
- Scene: cyberpunk skyline, neon signs, rain, data rain, equalizer bars, wet road reflections, CRT lines
- 5 reactive states: idle (breathing), listening (scan line), thinking (data rain), speaking (full energy), alert (red pulse)
- Wrote server.py: stdlib-only HTTP server, reads bus files, /state JSON endpoint, --mock mode on port 8778
- Wrote launch.sh: auto-start server, Chrome kiosk with throwaway profile, fallback for other browsers
- DPR capping, offscreen baking, 10Hz polling, staleness detection, FPS meter, boot intro

Stage Summary:
- 3 files in /home/z/my-project/voice-visualizer/
- Zero external dependencies, works offline, no build step
- Mock harness for testing without voice line

---
Task ID: 4
Agent: Main
Task: Add cinematic presentation camera to visualizer

Work Log:
- Added 6-shot pool: skyline-glide, neon-closeup, rooftop-descent, diagonal-cross, street-level, rain-closeup
- Implemented dealer rules: no repeat of previous shot, finale always skyline-glide pull-back
- Camera grammar: constant-speed drift, cuts mid-motion, perspective tilt, finale decelerates
- Integrated into render loop via ctx.save/restore with canvas transform
- Space bar toggles flythrough, second press bails out
- Cinematic HUD: letterbox bars, shot counter, progress bar
- Freeze support via ?shot= parameter for screenshot testing

Stage Summary:
- Cinematic camera integrated into existing index.html
- Space bar is the show-off button
- 6 unique shot types with random selection per run

---
Task ID: 5
Agent: Main
Task: Integration verification and cheat sheet

Work Log:
- Generated controls cheat sheet as .docx: /home/z/my-project/download/Voice_Line_Cheat_Sheet.docx
- Covers voice controls, flags, visualizer controls, URLs, states, launch commands, architecture

Stage Summary:
- Cheat sheet: /home/z/my-project/download/Voice_Line_Cheat_Sheet.docx
