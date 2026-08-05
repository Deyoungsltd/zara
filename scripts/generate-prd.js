const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  AlignmentType, HeadingLevel, PageNumber, PageBreak,
  TableOfContents, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle, SectionType, TableLayoutType,
} = require("docx");

// ── Palette: GO-1 (Graphite Orange) for proposal/PRD ──
const PAL = {
  coverBg: "1A2330", coverTitle: "FFFFFF", coverSub: "B0B8C0",
  coverMeta: "90989F", coverFooter: "687078", accent: "D4875A",
  bodyHead: "1A2330", bodyText: "000000", bodySub: "5A6080",
  tableHeadBg: "D4875A", tableHeadText: "FFFFFF",
  tableInner: "DDD0C8", tableSurface: "F8F0EB",
};
const c = (h) => h.replace("#", "");

// ── Borders ──
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ── Helpers ──
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: c(PAL.bodyHead), font: { ascii: "Times New Roman" } })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28, color: c(PAL.bodyHead), font: { ascii: "Times New Roman" } })],
  });
}
function p(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT, spacing: { line: 312, after: 100 },
    children: [new TextRun({ text, size: 24, color: c(PAL.bodyText), font: { ascii: "Times New Roman" } })],
  });
}
function pBold(label, text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT, spacing: { line: 312, after: 80 },
    children: [
      new TextRun({ text: label, bold: true, size: 24, color: c(PAL.bodyText), font: { ascii: "Times New Roman" } }),
      new TextRun({ text, size: 24, color: c(PAL.bodyText), font: { ascii: "Times New Roman" } }),
    ],
  });
}
function emptyPara() {
  return new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "", size: 2 })] });
}

// ── Table helpers ──
function headerCell(text, widthPct) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: PAL.tableHeadBg },
    borders: { top: NB, bottom: NB, left: NB, right: NB },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text, bold: true, size: 21, color: c(PAL.tableHeadText), font: { ascii: "Times New Roman" } })] })],
  });
}
function dataCell(text, widthPct, idx) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: idx % 2 === 0 ? { type: ShadingType.CLEAR, fill: PAL.tableSurface } : { type: ShadingType.CLEAR, fill: "FFFFFF" },
    borders: { top: NB, bottom: NB, left: NB, right: NB },
    margins: { top: 50, bottom: 50, left: 120, right: 120 },
    children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 280 }, children: [new TextRun({ text, size: 21, color: c(PAL.bodyText), font: { ascii: "Times New Roman" } })] })],
  });
}

// ── calcTitleLayout (from design-system.md) ──
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 11; // English ~11 twips per char at 1pt
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt;
  let lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    const cpl = charsPerLine(minPt);
    lines = splitTitleLines(title, cpl);
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([' ', '-', '/', '(', ')', ':', ';', ',', '.']);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = Math.min(charsPerLine, remaining.length); i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 3) {
    const last = lines.pop(); lines[lines.length - 1] += ' ' + last;
  }
  return lines;
}
function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false, metaLineCount = 0, fixedHeight = 800 } = params;
  const SAFETY = 1200, usableHeight = 16838 - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const safeRemaining = Math.max(usableHeight - contentHeight, 400);
  const FOOTER_MIN = 800;
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(Math.floor(safeRemaining * 0.45) - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ── Cover: R4 (Top Color Block) with GO-1 ──
function buildCoverR4(config) {
  const P = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 26);
  const titleSize = titlePt * 2;
  const titleBlockHeight = titleLines.length * (titlePt * 23 + 200);
  const englishLabelH = config.englishLabel ? (9 * 23 + 500) : 0;
  const subtitleH = config.subtitle ? (12 * 23 + 200) : 0;
  const upperContentH = englishLabelH + titleBlockHeight + subtitleH;
  const UPPER_MIN = 7500;
  const UPPER_H = Math.max(UPPER_MIN, upperContentH + 1500 + 800);
  const DIVIDER_H = 60;
  const contentEstimate = englishLabelH + titleLines.length * (titlePt * 23 + 200) + subtitleH;
  const spacerIntrinsic = 280;
  const topSpacing = Math.max(UPPER_H - contentEstimate - spacerIntrinsic - 800, 400);

  const upperBlock = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: UPPER_H, rule: "exact" },
      children: [new TableCell({
        shading: { fill: P.bg }, borders: noBorders, verticalAlign: "top",
        margins: { left: padL, right: padR },
        children: [
          new Paragraph({ spacing: { before: topSpacing } }),
          config.englishLabel ? new Paragraph({ spacing: { after: 500 }, children: [
            new TextRun({ text: config.englishLabel.split("").join(" "), size: 18, color: c(P.accent), font: { ascii: "Calibri" }, characterSpacing: 60 }),
          ] }) : null,
          ...titleLines.map((line, i) => new Paragraph({
            spacing: { after: i < titleLines.length - 1 ? 100 : 200 },
            children: [new TextRun({ text: line, size: titleSize, bold: true, color: c(P.titleColor), font: { ascii: "Arial" } })],
          })),
          config.subtitle ? new Paragraph({ spacing: { after: 100 }, children: [
            new TextRun({ text: config.subtitle, size: 24, color: c(P.subtitleColor), font: { ascii: "Arial" } }),
          ] }) : null,
        ].filter(Boolean),
      })],
    })],
  });

  const divider = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: allNoBorders,
    rows: [new TableRow({ height: { value: DIVIDER_H, rule: "exact" }, children: [
      new TableCell({ borders: noBorders, shading: { fill: P.accent }, children: [emptyPara()] }),
    ] })],
  });

  const lowerContent = [
    new Paragraph({ spacing: { before: 800 } }),
    ...(config.metaLines || []).map(line => new Paragraph({
      indent: { left: padL }, spacing: { after: 100 },
      children: [new TextRun({ text: line, size: 26, color: c(P.metaColor), font: { ascii: "Arial" } })],
    })),
    new Paragraph({ spacing: { before: 2000 } }),
    new Paragraph({ indent: { left: padL }, children: [
      new TextRun({ text: config.footerLeft || "", size: 22, color: "909090", font: { ascii: "Arial" } }),
      new TextRun({ text: "                    " }),
      new TextRun({ text: config.footerRight || "", size: 22, color: "909090", font: { ascii: "Arial" } }),
    ] }),
  ];

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({ shading: { fill: "FFFFFF" }, borders: noBorders, verticalAlign: "top", children: [upperBlock, divider, ...lowerContent] })],
    })],
  })];
}

// ── BODY CONTENT ──
const bodyContent = [
  // ── 1. Executive Summary ──
  h1("1. Executive Summary"),
  p("Voice Line is a premium, real-time, voice-first AI assistant platform inspired by the Jarvis interface from Iron Man, but designed for practical, real-world productivity. The system captures speech through a hold-to-talk mechanism, transcribes it locally via a Whisper.cpp server, processes it through a Z.ai streaming session, and returns spoken responses through a local Kokoro text-to-speech engine — all within a half-duplex architecture that prevents audio feedback loops and ensures the microphone never hears the speakers."),
  p("The platform is web-first and mobile-compatible, with a separate fullscreen visualizer that reacts to the assistant\'s state through a file-based signal bus. A cinematic presentation camera adds a show-off mode for demonstrating the system. The architecture is designed around local processing for privacy and speed, with PostgreSQL for persistent data and a clean separation between the voice pipeline, the visualizer, and future web interfaces. This PRD defines the problem space, requirements, architecture, and phased delivery plan for the complete system."),

  // ── 2. Problem Statement ──
  h1("2. Problem Statement"),
  p("Current AI assistants fall into two unsatisfying categories: cloud-dependent chatbots that require typing, clicking, and waiting for rendered responses, or native-app voice assistants that are locked to specific platforms, send all audio to remote servers, and cannot be customized or extended. Neither category delivers the experience that power users actually want when they are sitting at their desk, working on tasks, and need to interact with AI without breaking their flow state."),
  p("The core problems are threefold. First, latency: most voice assistants add several seconds of round-trip delay between speaking and hearing a response, destroying the conversational rhythm that makes voice interaction useful. Second, privacy: sending every utterance to a cloud API means every private thought, meeting note, or brainstorm session leaves the local machine. Third, fragmentation: the AI assistant that helps in the terminal is a different system from the one that answers voice questions, which is different from the one embedded in a document editor. The user\'s context, preferences, and working memory do not transfer across these surfaces."),
  p("Voice Line solves these problems by running the entire voice pipeline locally, maintaining a single persistent AI session that is shared with terminal-based workflows, and delivering spoken responses fast enough to feel conversational. The system is designed for a single power user who wants their AI to be as responsive and context-aware as a real personal assistant, without the privacy trade-offs of cloud-only solutions."),

  // ── 3. Target User ──
  h1("3. Target User"),
  p("The primary user is a technically proficient power user who spends extended hours at a desk and wants hands-free interaction with an AI assistant that understands their ongoing work context. This user typically works across multiple projects, uses terminal-based AI tools (such as Claude or Z.ai CLI), and values speed, privacy, and control over their tools. They are comfortable with command-line interfaces, local server configuration, and are willing to invest in setup to achieve a premium experience."),
  p("Secondary users include developers who want voice-accessible code assistance without switching windows, knowledge workers who think best by talking through problems aloud, and privacy-conscious professionals in fields like law, finance, or healthcare who cannot send voice data to third-party clouds. The system is explicitly not designed for casual consumers, non-technical users, or enterprise multi-seat deployments in its initial release."),

  // ── 4. Core Purpose ──
  h1("4. Core Purpose"),
  p("The core purpose of Voice Line is to provide a single, persistent, context-aware AI assistant that is equally accessible through voice and text, responds fast enough to maintain conversational flow, processes audio locally for privacy, and can be extended with custom visual feedback and future platform surfaces. The system exists to bridge the gap between terminal-based AI workflows and natural voice interaction, making the assistant a true operational partner rather than a chatbot that requires typing."),
  p("The assistant should feel like a high-end personal operating system layer: always available, always contextual, and capable of handling tasks ranging from quick factual lookups to complex reasoning, all through a voice interface that does not force the user to break concentration or switch applications. The web-based visualizer extends this into an ambient awareness system that communicates the assistant\'s state at a glance."),

  // ── 5. Main Use Cases ──
  h1("5. Main Use Cases"),
  h2("5.1 Hands-Free Task Queries"),
  p("The user holds a global hotkey, speaks a question or instruction, releases the key, and receives a spoken answer within one to two seconds on warm turns. This covers factual questions ('What is the current temperature in Tokyo?'), calculations ('Convert 5000 USD to EUR'), and quick lookups that would otherwise require opening a browser, typing a search, and scanning results. The voice interface reduces a multi-step manual process to a single spoken sentence."),
  h2("5.2 Thinking Partner"),
  p("The user talks through a problem aloud — brainstorming, reasoning through a design decision, or exploring a technical trade-off — and the assistant responds conversationally, offering perspectives, identifying gaps in reasoning, and suggesting alternatives. The assistant writes for the ear, using short sentences and natural language rather than markdown or code blocks. This use case turns the assistant into a collaborative thinking tool that leverages the cognitive benefits of spoken articulation."),
  h2("5.3 Contextual Task Management"),
  p('Because the voice session shares its AI context with terminal-based sessions (via a shared project context file), the assistant can create, query, and manage tasks that are visible across all interfaces. The user can say \u201cRemind me to review the deployment PR by end of day\u201d or \u201cWhat is on my task list for this week?\u201d and the assistant operates on the same data that the terminal session accesses, maintaining a unified working memory.'),
  h2("5.4 Code and System Assistance"),
  p("For developers, the assistant can explain code, suggest fixes, look up documentation, and reason about system architecture — all through voice. While the assistant does not read code aloud (per the write-for-the-ear principle), it can describe what code does, suggest approaches, and flag potential issues in plain language. This is particularly valuable when the user is away from the keyboard or wants to think through a problem without switching to an editor."),
  h2("5.5 Ambient Status and Feedback"),
  p("The visualizer provides a fullscreen ambient display that communicates the assistant\'s current state (idle, listening, thinking, speaking) through reactive visual animations. This serves as a peripheral awareness channel: the user can glance at a secondary monitor or a tablet on their desk and immediately know whether the assistant is ready, processing, or responding, without looking at a terminal window."),

  // ── 6. Non-Goals ──
  h1("6. Non-Goals"),
  p("Voice Line explicitly does not aim to be a multi-user SaaS platform, a native mobile application, or a full-duplex (barge-in) voice system in its initial release. The system is designed for a single user on a single machine and does not include user account management, billing, or multi-tenancy. Native mobile applications are explicitly deferred; the web interface is the primary and only delivery surface, designed to be mobile-friendly but not a standalone native app."),
  p("The system does not attempt real-time audio barge-in (interrupting the assistant mid-sentence by speaking over it). The half-duplex architecture means the microphone is gated while audio is playing, and the user interrupts by pressing the hotkey, not by speaking. Additionally, Voice Line is not a recording device, a transcription service, a speakerphone system, or a replacement for keyboard and mouse in all scenarios. It is a specialized voice interface for AI interaction."),

  // ── 7. Functional Requirements ──
  h1("7. Functional Requirements"),
  h2("7.1 Voice Capture"),
  p("The system must support two capture modes. The primary mode is hold-to-talk (PTT): pressing and holding a configurable global hotkey opens the microphone, and releasing it closes the microphone with a 0.18-second tail buffer for natural speech completion. Taps shorter than 250 milliseconds must be ignored to prevent accidental triggers. The system must filter OS key-repeat events using a held-state flag so that holding the key does not generate duplicate press events. The microphone must be fully closed between holds so that room audio and background music do not leak into the transcriber."),
  p("A secondary legacy mode is available behind the --open-mic flag, using webrtcvad for voice activity detection with endpointing. In this mode, any utterance with less than 240 milliseconds of actual speech must be discarded. Bracketed non-speech markers such as [SIGHS] and [BLANK_AUDIO] must be stripped from the transcription output before processing."),
  h2("7.2 Speech-to-Text"),
  p("Audio captured from the microphone is sent to a local Whisper.cpp server running on port 2022, exposing an OpenAI-compatible /v1/audio/transcriptions endpoint. The system must detect whether this server is running at startup and provide clear setup instructions if it is not. The Whisper server should use a small English model for speed, with hardware acceleration appropriate to the host machine."),
  h2("7.3 AI Brain (Z.ai Integration)"),
  p("The system uses the official Z.ai Python SDK to create and maintain a persistent streaming session for each voice session. One session is created at launch and reused for all turns within that session. A warmup query is fired at startup to populate the prompt cache, hiding the initial latency behind a spoken greeting. The session working directory is set to the project folder so that the voice session inherits the same project context (CLAUDE.md or equivalent) as terminal sessions, ensuring the assistant maintains a consistent identity and context across interfaces."),
  p("The assistant must write for the ear: short conversational sentences, no markdown, no code blocks read aloud, no lists. Streaming partial messages are chunked into sentences, and each completed sentence is handed to the TTS pipeline immediately. The sentence buffer must be flushed when a content block stops. Quit phrases such as \"goodbye,\" \"end voice mode,\" and \"hang up\" must terminate the session, and Ctrl-C must also work as a hard exit."),
  h2("7.4 Text-to-Speech"),
  p("The default TTS path uses a local Kokoro TTS server on port 8880, exposing /v1/audio/speech. Requests specify response_format=pcm to receive raw int16 PCM audio at 24kHz mono, which is played through sounddevice. The default voice is bm_lewis. An alternative path supports ElevenLabs for users who want higher quality: the system fetches mp3_44100_128 audio and decodes it locally with ffmpeg, using the turbo model with stability 0.5 and similarity 0.75. The ElevenLabs API key is stored in an ELEVENLABS_API_KEY environment variable and is never hardcoded. Kokoro remains the automatic fallback if ElevenLabs is unavailable."),
  h2("7.5 Playback and Interrupt"),
  p("The TTS pipeline maintains a queue of sentences, synthesized and played back to back. When the user presses the hotkey while audio is playing, the system immediately clears the playback queue and stops the current audio. This interrupt mechanism is the only way to cut off the assistant mid-sentence; the system does not support voice-activated barge-in."),
  h2("7.6 Typed Input"),
  p("A background reader feeds typed lines into the same handler as speech input. Typing while the assistant is speaking triggers an interrupt, identical to pressing the hotkey. The typed input implementation must race the input queue against the key listener using asyncio.wait with FIRST_COMPLETED, keeping unfinished futures alive across iterations. The terminal runs in raw mode with a custom line editor that assembles bracketed pastes into single messages, scrubs gutter glyphs and hard wraps from pasted text, and echoes long pastes as a character count rather than raw text."),
  h2("7.7 Signal Bus"),
  p("The voice line writes state files to the project root for the visualizer to consume. Three files are used: .voice_state (plain text: idle, listening, thinking, or speaking), .voice_waveform (JSON with a Unix timestamp and 64 float samples), and .voice_loading_pid (exists while a thinking sound plays). State transitions follow strict rules: key press writes listening, key release writes thinking, first audio block writes speaking, and playback end writes idle. Every waveform write also re-writes the state to speaking as a self-heal mechanism."),
  h2("7.8 Spotify Ducking"),
  p("While the assistant speaks, if Spotify is playing above 30% volume, the system reduces Spotify volume to max(30, current times 0.6) via the appropriate OS hook (AppleScript on macOS, D-Bus/MPRIS on Linux, COM/WSH on Windows). Volume is restored with a 1.2-second debounce after speech ends. The system must never launch Spotify if it is not already running. This feature is OS-specific and may be stubbed on platforms without a clean implementation path."),

  // ── 8. Non-Functional Requirements ──
  h1("8. Non-Functional Requirements"),
  h2("8.1 Latency"),
  p("On warm turns (after the first exchange), the first audio of the spoken response must begin playing within one to two seconds of the user releasing the hotkey. This latency budget includes transcription time, network round-trip to Z.ai, initial sentence generation, and TTS synthesis. The first turn of a session may be slower due to prompt cache population, which is hidden behind a startup warmup sequence."),
  h2("8.2 Reliability"),
  p("The system must never play the same audio segment twice. The half-duplex architecture must guarantee that the microphone cannot hear the speakers under any circumstances, including interrupt scenarios. The signal bus must never crash the voice line; any error in file I/O for the bus must be caught and silently ignored. The system must handle network timeouts from Z.ai gracefully, reporting the error to the user rather than hanging or crashing."),
  h2("8.3 Privacy and Security"),
  p("Audio processing (STT and TTS) runs on local servers by default. No audio data is sent to third-party services unless the user explicitly configures ElevenLabs. API keys are stored in environment variables, never in source code or configuration files. The Z.ai session uses the official SDK\'s authentication mechanisms. The system does not log, store, or transmit raw audio outside the local machine."),
  h2("8.4 Performance"),
  p("The visualizer must maintain 60fps fullscreen performance on modern hardware, including during the most demanding visual states. The voice pipeline must add no more than 100ms of internal processing latency beyond the STT and TTS service times. The client-side web interface must load in under two seconds on a mobile connection and use minimal CPU, memory, and battery resources."),
  h2("8.5 Mobile Compatibility"),
  p("Every screen must be usable on compact mobile displays with thumb-friendly controls. The client must be lightweight, avoiding large bundles and unnecessary animations. Media processing is server-side or GPU-side where possible. The system uses progressive loading and graceful degradation on slower devices. Real-time processing in the browser is minimized to preserve battery life."),

  // ── 9. Platform Strategy ──
  h1("9. Platform Strategy"),
  p("Voice Line is a web-first product. The browser is the primary and first release surface for all user-facing interfaces, including the voice interaction controls, settings, and the visualizer. The backend, authentication, session management, and data layer are designed so that a native application could be added in the future without modifying the core API or data model, but no native app is built in the current release cycle."),
  p("The voice pipeline itself (ears, brain, mouth) runs as a local Python process, not in the browser. The browser provides the user interface for mobile access and configuration, while the desktop experience uses the terminal-based voice line with the global hotkey. This hybrid approach leverages the strengths of each platform: the terminal for low-latency audio I/O and global keyboard hooks, and the browser for responsive, touch-friendly interfaces that work on any device."),
  p("The visualizer is a self-contained HTML file served by a minimal Python HTTP server on localhost, with no frameworks, no CDN dependencies, and no build step. It works offline and is designed to run in a Chrome kiosk window on a secondary display. The server reads the voice line\'s signal bus files and serves the state as JSON to the browser via polling."),

  // ── 10. Database Strategy ──
  h1("10. Database Strategy"),
  p("Voice Line uses PostgreSQL as its sole production database. SQLite is explicitly not used for any persistent data storage. The database stores session metadata, user preferences, device bindings, audit logs for sensitive actions, background jobs, and media metadata. Schema migrations and indexes are kept under version control, and a type-safe ORM (Drizzle) manages the data access layer."),
  p("Connection pooling is required in production to prevent connection exhaustion during concurrent operations. The schema is designed to support future multi-device access (web, mobile, desktop) while currently serving a single-user deployment. The database is provisioned via Docker Compose for local development, with migration scripts that can be applied to any PostgreSQL instance for production deployment."),

  // ── 11. Voice Workflow ──
  h1("11. Voice Workflow"),
  p("The voice workflow follows a strict half-duplex pipeline: microphone capture, local transcription, AI processing, and audio playback never overlap. The full sequence is as follows. First, the user presses and holds the global hotkey, which opens the microphone and begins capturing audio via sounddevice. The .voice_state file is set to \"listening.\" When the user releases the key, a 0.18-second tail buffer captures any trailing speech, then the microphone closes. The .voice_state transitions to \"thinking.\""),
  p("The captured audio is sent as a POST request to the local Whisper.cpp server on port 2022 at /v1/audio/transcriptions. The server returns the transcribed text, which is sent to the Z.ai streaming session as a user message. As the Z.ai session streams its response, the brain module buffers the output into sentences using punctuation-based splitting. Each completed sentence is immediately queued for TTS synthesis. The .voice_state transitions to \"speaking\" when the first audio block begins playing."),
  p("Each sentence is sent to the Kokoro TTS server (or ElevenLabs, if configured) and returned as raw PCM audio. The mouth module plays the audio through sounddevice, feeding each PCM block to the signal bus for the visualizer. When the queue is empty and playback finishes, .voice_state returns to \"idle.\" If the user presses the hotkey at any point during playback, the queue is cleared and playback stops immediately, transitioning back to \"listening.\""),

  // ── 12. Mobile Support ──
  h1("12. Mobile Support"),
  p("The web interface is the mobile interface. Voice Line does not have a native mobile application; instead, the browser-based UI is designed from the ground up to be lightweight, responsive, and touch-friendly. All controls are reachable with thumbs on compact screens. The client bundle is kept as small as possible, with advanced features loaded only when the user navigates to them."),
  p("Heavy processing — speech recognition, AI inference, and speech synthesis — runs server-side (on the user\'s local machine). The mobile browser acts as a thin client that captures audio, sends it to the voice line server, and plays back the response. Media is compressed where possible without degrading core quality. Asynchronous processing is used for any operation where live response is not required. The default experience on mobile is simple, fast, and low-bandwidth."),

  // ── 13. Safety and Consent Rules ──
  h1("13. Safety and Consent Rules"),
  p("Voice Line enforces consent and abuse prevention at every stage of any face, voice, or identity-transforming feature. The system does not allow generation or transformation involving a real person without proper, verified consent. Before using any live face, voice, or identity-changing tool, the user must confirm they have the rights or permission to use the source material. A clear consent warning is displayed before any sensitive operation."),
  p("The system blocks abusive, deceptive, impersonation, harassing, or non-consensual use cases. Safeguards against misuse include audit logging for sensitive actions, an administrative interface for revoking access or disabling risky accounts, and the ability to reject suspicious requests or require additional verification. The product is designed to prevent fraud, identity theft, and misleading impersonation. All safety checks remain active in both live and recorded workflows."),

  // ── 14. Access Rules ──
  h1("14. Access Rules"),
  p("Voice Line is a single-user system. In its initial release, the voice pipeline, visualizer, and web interface are accessible only from the local machine (localhost) and the local network. No public API endpoints are exposed. Authentication for future multi-device access is designed into the data model but not implemented in the first release."),
  p("The visualizer server binds to 127.0.0.1 and is accessible only from the local machine. The signal bus files are read-only from the visualizer\'s perspective; the visualizer never writes to the voice line\'s bus files. Administrative functions (database migrations, system configuration) are accessible only through local CLI commands, not through the web interface."),

  // ── 15. Success Metrics ──
  h1("15. Success Metrics"),
  p("The following metrics define the success criteria for Voice Line. Each metric has a target that must be met before the corresponding release phase is considered complete. These metrics are measured locally and are not reported to any external service."),
  // Metrics table
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: c(PAL.accent) }, bottom: { style: BorderStyle.SINGLE, size: 2, color: c(PAL.accent) }, left: NB, right: NB, insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: PAL.tableInner }, insideVertical: NB },
    rows: [
      new TableRow({ children: [headerCell("Metric", 35), headerCell("Target", 35), headerCell("Measurement", 30)] }),
      new TableRow({ children: [dataCell("Warm-turn first-audio latency", 35, 0), dataCell("< 2 seconds (p50 < 1.5s)", 35, 0), dataCell("Timestamp delta: key release to first audio frame", 30, 0)] }),
      new TableRow({ children: [dataCell("Cold-turn first-audio latency", 35, 1), dataCell("< 5 seconds (hidden by warmup)", 35, 1), dataCell("Measured from session creation to first audio", 30, 1)] }),
      new TableRow({ children: [dataCell("Interrupt responsiveness", 35, 0), dataCell("< 100ms from key press to silence", 35, 0), dataCell("Hotkey press to audio stop", 30, 0)] }),
      new TableRow({ children: [dataCell("Visualizer frame rate", 35, 1), dataCell("60fps fullscreen (no drops below 55)", 35, 1), dataCell("Browser Performance API, 10-second window", 30, 1)] }),
      new TableRow({ children: [dataCell("Audio feedback prevention", 35, 0), dataCell("Zero instances of mic hearing speakers", 35, 0), dataCell("Manual testing + automated gate check", 30, 0)] }),
      new TableRow({ children: [dataCell("Mobile page load time", 35, 1), dataCell("< 2 seconds on 3G connection", 35, 1), dataCell("Lighthouse Performance audit", 30, 1)] }),
    ],
  }),
  p("Table 1: Key performance targets for Voice Line."),

  // ── 16. Risks ──
  h1("16. Risks"),
  h2("16.1 Local Service Dependencies"),
  p("The voice pipeline depends on two local servers (Whisper.cpp and Kokoro TTS) being running before the voice line can operate. If either server crashes or is not started, the system must detect this at launch and provide actionable setup instructions. Mitigation: automatic health checks at startup, clear error messages, and a run-voice-line.sh launcher script that verifies dependencies before launching."),
  h2("16.2 Operating System Permissions"),
  p("Global keyboard listening requires Input Monitoring permission on macOS, microphone access requires system-level grants, and Spotify ducking requires platform-specific hooks (AppleScript, D-Bus, COM). These permissions vary by OS version and cannot be automated in all cases. Mitigation: document permission requirements clearly, detect missing permissions at startup, and fall back gracefully when permissions are denied."),
  h2("16.3 Audio Hardware Compatibility"),
  p("Different microphones, speakers, and audio interfaces have different latency characteristics, sample rates, and buffer sizes. The sounddevice library provides a cross-platform abstraction, but edge cases exist with Bluetooth audio, USB audio interfaces, and aggregate devices. Mitigation: allow audio device configuration via environment variables and fall back to system defaults."),
  h2("16.4 Z.ai API Changes"),
  p("The system depends on the Z.ai SDK\'s streaming API, session management, and tool-use interfaces. If the API changes in a breaking way, the voice line will need to be updated. Mitigation: pin SDK versions, use the official SDK (not raw HTTP), and abstract the brain interface behind a thin adapter layer."),
  h2("16.5 Performance on Weaker Machines"),
  p("Running Whisper, Kokoro, and the voice line simultaneously requires significant CPU and memory. On weaker machines, transcription or synthesis latency may exceed the two-second target. Mitigation: support configurable model sizes, allow GPU offloading where available, and provide clear documentation of minimum hardware requirements."),

  // ── 17. Dependencies ──
  h1("17. Dependencies"),
  p("Voice Line depends on the following software components, each of which must be installed and configured before the system can operate. The voice line project itself is managed with uv under Python 3.12."),
  // Dependencies table
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: c(PAL.accent) }, bottom: { style: BorderStyle.SINGLE, size: 2, color: c(PAL.accent) }, left: NB, right: NB, insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: PAL.tableInner }, insideVertical: NB },
    rows: [
      new TableRow({ children: [headerCell("Component", 30), headerCell("Version / Spec", 30), headerCell("Purpose", 40)] }),
      new TableRow({ children: [dataCell("Python", 30, 0), dataCell("3.12+", 30, 0), dataCell("Runtime for voice pipeline", 40, 0)] }),
      new TableRow({ children: [dataCell("uv", 30, 1), dataCell("Latest", 30, 1), dataCell("Package manager, pins setuptools < 81", 40, 1)] }),
      new TableRow({ children: [dataCell("sounddevice", 30, 0), dataCell("Latest", 30, 0), dataCell("Audio capture and playback", 40, 0)] }),
      new TableRow({ children: [dataCell("webrtcvad", 30, 1), dataCell("Latest", 30, 1), dataCell("Voice activity detection (open-mic mode)", 40, 1)] }),
      new TableRow({ children: [dataCell("pynput", 30, 0), dataCell("Latest", 30, 0), dataCell("Global hotkey listener", 40, 0)] }),
      new TableRow({ children: [dataCell("Z.ai SDK", 30, 1), dataCell("Official latest", 30, 1), dataCell("AI brain — streaming sessions", 40, 1)] }),
      new TableRow({ children: [dataCell("httpx", 30, 0), dataCell("Latest", 30, 0), dataCell("HTTP client for STT/TTS APIs", 40, 0)] }),
      new TableRow({ children: [dataCell("numpy", 30, 1), dataCell("Latest", 30, 1), dataCell("Audio buffer manipulation", 40, 1)] }),
      new TableRow({ children: [dataCell("ffmpeg", 30, 0), dataCell("Binary in PATH", 30, 0), dataCell("Audio decoding (ElevenLabs path)", 40, 0)] }),
      new TableRow({ children: [dataCell("Whisper.cpp server", 30, 1), dataCell("Port 2022", 30, 1), dataCell("Local speech-to-text", 40, 1)] }),
      new TableRow({ children: [dataCell("Kokoro TTS server", 30, 0), dataCell("Port 8880", 30, 0), dataCell("Local text-to-speech", 40, 0)] }),
      new TableRow({ children: [dataCell("PostgreSQL", 30, 1), dataCell("15+", 30, 1), dataCell("Production database", 40, 1)] }),
    ],
  }),
  p("Table 2: Software dependencies and their roles."),

  // ── 18. Release Phases ──
  h1("18. Release Phases"),
  p("Voice Line is delivered in five phases, each of which must pass its quality gates before the next phase begins. This phased approach ensures that each component is stable and tested before building on top of it."),
  // Phases table
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: c(PAL.accent) }, bottom: { style: BorderStyle.SINGLE, size: 2, color: c(PAL.accent) }, left: NB, right: NB, insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: PAL.tableInner }, insideVertical: NB },
    rows: [
      new TableRow({ children: [headerCell("Phase", 12), headerCell("Name", 20), headerCell("Scope", 45), headerCell("Quality Gate", 23)] }),
      new TableRow({ children: [dataCell("1", 12, 0), dataCell("Core Voice Pipeline", 20, 0), dataCell("ears.py, brain.py, mouth.py, ptt.py, main.py, signals.py, ducking.py, run-voice-line.sh — full half-duplex voice loop with PTT, typed input, interrupt, and signal bus", 45, 0), dataCell("End-to-end turn works; interrupt works; no audio feedback; quit phrases work", 23, 0)] }),
      new TableRow({ children: [dataCell("2", 12, 1), dataCell("Visualizer", 20, 1), dataCell("index.html (self-contained canvas scene), server.py (signal bus reader on port 8777), double-click launcher, mock harness", 45, 1), dataCell("All 5 states react correctly; level rides waveform; 60fps fullscreen; stale state eases to idle", 23, 1)] }),
      new TableRow({ children: [dataCell("3", 12, 0), dataCell("Cinematic Camera", 20, 0), dataCell("Space-bar triggered flythrough over live scene, shot pool, dealer rules, camera grammar, finale pull-back", 45, 0), dataCell("Full run over mock; cuts land mid-motion; camera never stops; bail-out works; runs differ press to press", 23, 0)] }),
      new TableRow({ children: [dataCell("4", 12, 1), dataCell("Web UI + Mobile", 20, 1), dataCell("Browser-based voice controls, mobile-responsive layout, PostgreSQL schema and migrations, typed input in browser", 45, 1), dataCell("Works on mobile Chrome/Safari; DB is Postgres not SQLite; page load < 2s on 3G", 23, 1)] }),
      new TableRow({ children: [dataCell("5", 12, 0), dataCell("Polish + ElevenLabs", 20, 0), dataCell("ElevenLabs TTS integration with Kokoro fallback, audio mastering chain, consent UI, audit logging, settings page", 45, 0), dataCell("ElevenLabs path works; fallback triggers correctly; consent warnings display; audit logs write", 23, 0)] }),
    ],
  }),
  p("Table 3: Release phases and their quality gates."),

  h2("18.1 Phase 1: Core Voice Pipeline"),
  p("Phase 1 delivers the complete voice interaction loop. The user presses a hotkey, speaks, releases, and hears a spoken response from the Z.ai assistant. This phase includes the ears (audio capture via sounddevice, transcription via Whisper), the brain (Z.ai SDK integration with sentence chunking), the mouth (Kokoro TTS with queuing and interrupt), the PTT controller (global hotkey via pynput with key-repeat filtering), the typed input handler (asyncio-based with raw terminal mode), the signal bus (state and waveform file writers), and the Spotify ducking module. The run-voice-line.sh launcher script checks for dependencies and starts the voice line."),
  h2("18.2 Phase 2: Visualizer"),
  p("Phase 2 delivers the fullscreen browser visualizer that reacts to the voice line\'s state in real time. The visualizer is a self-contained HTML file using plain canvas 2D and vanilla JavaScript with no frameworks, no CDN, and no build step. A minimal Python HTTP server on port 8777 serves the page and provides a /state JSON endpoint that reads the voice line\'s signal bus files. A double-click launcher starts the server if needed and opens a Chrome kiosk window. A mock harness (--mock on port 8778) allows testing without the voice line running. The specific visual scene is selected before this phase begins, based on user preference."),
  h2("18.3 Phase 3: Cinematic Camera"),
  p("Phase 3 adds the cinematic presentation camera to the visualizer. Pressing Space triggers a roughly 30-second scripted flythrough that renders over the live simulation, using camera transforms applied to the actual scene each frame. A pool of shot types is defined based on the chosen scene, with dealer rules ensuring variety (no consecutive identical subjects, the finale never repeats the previous shot). Pressing Space again bails out cleanly. The camera uses constant-speed drift within each shot, cuts land mid-motion, and the finale decelerates to land on the full wide scene."),
  h2("18.4 Phase 4: Web UI and Mobile"),
  p("Phase 4 adds the browser-based user interface that makes the voice assistant accessible from mobile devices and any browser. This includes touch-friendly PTT controls, a responsive layout, the PostgreSQL database schema with Drizzle ORM, session management, and migration scripts. The web UI connects to the voice line\'s backend and provides the same interaction as the terminal-based interface, but optimized for touch and mobile screens."),
  h2("18.5 Phase 5: Polish and ElevenLabs Integration"),
  p("Phase 5 adds the ElevenLabs TTS integration as a premium voice option alongside the default Kokoro path. The ElevenLabs path includes an audio mastering chain (presence boost, low shelf, compression, limiter via ffmpeg), consent and safety UI, comprehensive audit logging for sensitive actions, and a settings page for voice selection and configuration. This phase also includes general polish: error handling improvements, documentation, and the one-page controls cheat sheet."),
];

// ── Document Assembly ──
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Times New Roman" }, size: 24, color: c(PAL.bodyText) },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: "Times New Roman" }, size: 32, bold: true, color: c(PAL.bodyHead) },
        paragraph: { spacing: { before: 360, after: 160, line: 312 } },
      },
      heading2: {
        run: { font: { ascii: "Times New Roman" }, size: 28, bold: true, color: c(PAL.bodyHead) },
        paragraph: { spacing: { before: 280, after: 120, line: 312 } },
      },
    },
  },
  sections: [
    // ── Section 1: Cover (R4, GO-1) ──
    {
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0 } },
      },
      children: buildCoverR4({
        title: "Voice Line",
        englishLabel: "PRODUCT REQUIREMENTS DOCUMENT",
        subtitle: "Z.ai Jarvis-Style Voice Assistant & Visualizer Platform",
        metaLines: ["Version 1.0  |  August 2026", "Status: Draft", "Classification: Internal"],
        footerLeft: "Z.ai", footerRight: "Confidential",
        palette: { bg: PAL.coverBg, titleColor: PAL.coverTitle, subtitleColor: PAL.coverSub, metaColor: PAL.coverMeta, footerColor: PAL.coverFooter, accent: PAL.accent },
      }),
    },
    // ── Section 2: TOC ──
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: "upperRoman" },
        },
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ["PAGE"], size: 18, color: "808080", font: { ascii: "Times New Roman" } })] })] }),
      },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360 }, children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, font: { ascii: "Times New Roman" }, color: c(PAL.bodyHead) })] }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Note: Right-click the Table of Contents and select \"Update Field\" to refresh page numbers after editing.", italics: true, size: 18, color: "888888", font: { ascii: "Times New Roman" } })] }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    // ── Section 3: Body ──
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: "decimal" },
        },
      },
      headers: {
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Voice Line PRD", size: 18, color: "808080", font: { ascii: "Times New Roman" } })] })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: { ascii: "Times New Roman" } })] })] }),
      },
      children: bodyContent,
    },
  ],
});

// ── Generate ──
const OUT = "/home/z/my-project/download/Voice_Line_PRD.docx";
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("Generated: " + OUT);
});
