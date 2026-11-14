# CuttingBoard

> A powerful, standalone **web-based video editor** built from the ground up with a custom **WebCodecs architecture**. Designed to match or exceed top-tier desktop editors — running entirely in the browser, wrapped in Electron for native desktop distribution.

---

## 🎬 Overview

CuttingBoard is a professional-grade non-linear editor (NLE) built entirely on modern web standards:

| Technology | Purpose |
|------------|---------|
| **WebCodecs API** | Hardware-accelerated video decode/encode (H.264, HEVC, VP9, AV1) |
| **WebGL 2 / WebGPU** | Real-time compositing, color grading, effects, transitions |
| **Web Audio API + AudioWorklet** | 32-bit float mixing, RNNoise denoising, LUFS loudness, pitch-preserving stretch |
| **Web Workers + OffscreenCanvas** | Multi-threaded decode, compositing, AI inference off main thread |
| **TypeScript + Immer** | Type-safe, immutable state with transactional undo/redo |
| **Electron** | Native desktop app (Windows/macOS/Linux) with secure IPC |

**Zero native dependencies** for the core editor — the entire pipeline runs on web standards.

---

## ✨ Feature Highlights

### 🎞️ Timeline & Project Core
- **Microsecond-precision timebase** (`bigint` µs) — zero drift at any framerate (23.976, 24, 25, 29.97, 30, 50, 59.94, 60 fps)
- **Multi-track magnetic & free timeline** — Primary video (ripple), overlay B-roll, audio (dialogue/music/SFX), text, adjustment layers
- **Ripple edit & gap management** — Toggleable magnetic timeline with automatic gap closing
- **Non-destructive split & trim** — Frame-accurate with source/target timerange preservation
- **Reverse playback, freeze frames, compound clips** — Full nested sequence support
- **Canvas aspect presets** (16:9, 9:16, 1:1, 4:3, 21:9) + Gaussian blur background

### 🎨 Visual Effects & Compositing
- **GPU-accelerated compositor** (WebGL 2 / WebGPU) — 60 fps real-time preview
- **14 blend modes** (Normal, Multiply, Screen, Overlay, Color Dodge, etc.)
- **Geometric & freeform masks** — Rectangle, ellipse, linear, mirror, radial with feathering
- **Chroma keying** — Green/blue screen with despill and edge feathering
- **AI Smart Cutout** — Neural portrait segmentation (MediaPipe/Transformers.js) without green screen

### 🎨 Color Grading (Pro Grade)
- **3-way Lift/Gamma/Gain wheels** — Independent RGB + master luminance
- **8-channel HSL selective correction** — Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta
- **Spline RGB & Luma curves** — Arbitrary control points with cubic spline interpolation
- **3D LUT (.cube) support** — 17³/33³/65³ with trilinear GPU sampling
- **12 photographic adjustments** — Temperature, Tint, Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Saturation, Sharpness, Clarity, Vignette

### 🔊 Audio Engine (Studio Grade)
- **32-bit float @ 48 kHz** multi-track mixer with sample-accurate automation
- **Exponential fade in/out** via `AudioParam` scheduling
- **RNNoise neural denoising** (WASM in AudioWorklet, zero main-thread jitter)
- **EBU R128 / ITU-R BS.1770-4 loudness metering** — Integrated, momentary, short-term, true-peak
- **Pitch-preserving time stretch** (WSOLA/phase vocoder in AudioWorklet)
- **Voice effects** — Chipmunk, Deep, Robot (ring mod), Megaphone, Reverb
- **AI vocal separation** — 2-stem (vocals + instrumental) via HTDemucs ONNX
- **Beat detection** — Spectral flux onset detection for music-synced editing

### 📝 Text, Captions & AI
- **Vector text rendering** — Font, weight, tracking, leading, stroke, shadow, glow, curved path
- **Auto-captions** — Offline Whisper.cpp (WASM) with word-level timestamps
- **SRT/VTT/ASS import/export** — Round-trip subtitle fidelity
- **Text-to-Speech** — Piper/Coqui WASM for offline voice synthesis
- **Animated text templates** — Lower-thirds, titles, social callouts with auto-scaling backgrounds

### 🎞️ Motion, Stickers & VFX
- **Motion tracking** — Lucas-Kanade/Farnébak optical flow (OpenCV.js WASM)
- **Lottie/APNG/WebP/GIF stickers** — Vector animation with loop/speed control
- **Transition engine** — Cross dissolve, dip to black, slide, push, wipe, zoom blur, flash, glitch
- **VFX shaders** — RGB split glitch, directional/gaussian blur, film grain, halftone, prism, glow

### 📤 Export & Delivery
- **WebCodecs VideoEncoder** — H.264 (NVENC/QSV/x264), HEVC (NVENC/QSV/x265), AV1 (SVT-AV1)
- **CBR/VBR/CQ rate control** — ±5% bitrate accuracy
- **Audio-only export** — MP3, AAC, WAV (16/24-bit), FLAC
- **C2PA Content Credentials** — Cryptographic provenance signing (author, tool, AI edits)
- **OTIO/FCPXML/AAF/EDL** — Round-trip with Premiere, Final Cut, DaVinci Resolve

### 🖥️ Application Experience
- **Dockable multi-pane layout** — Media browser, viewer, inspector, timeline (persists across restarts)
- **Interactive canvas viewport** — Transform gizmos (scale, rotate, position), safe margins (TikTok/TV safe zones)
- **60 fps virtualized timeline** — Waveforms, trim handles, razor tool, magnetic snap, inline keyframe curves
- **Contextual inspector** — Video/Audio/Speed/Animation/Adjustments/Effects tabs
- **Transactional undo/redo** — Immer-powered, infinite depth, command pattern
- **Customizable keyboard shortcuts** — CapCut/Premiere/Final Cut presets + J/K/L shuttle

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Electron Main Process                           │
│  Native menus, file dialogs, auto-updater, C2PA signing, FFmpeg CLI     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ IPC (contextBridge, secure)
┌───────────────────────────────────▼─────────────────────────────────────┐
│                      Renderer Process (Browser Context)                 │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    Application Shell (React + TS)                  │ │
│  │  Dockable panes, virtualized lists, keyboard shortcuts, theming    │ │
│  └───────────────────────────────────┬────────────────────────────────┘ │
│                                       │                                 │
│  ┌───────────────────────────────────▼────────────────────────────────┐ │
│  │                     Editor Core (Main Thread)                      │ │
│  │  Timeline graph, keyframe evaluator, undo/redo (Immer),           │ │
│  │  CapCut draft JSON I/O, OTIO/FCPXML/AAF bridge                     │ │
│  └─────────────┬───────────────────────────────┬──────────────────────┘ │
│                │                               │                        │
│  ┌─────────────▼───────────────┐ ┌────────────▼───────────────────────┐ │
│  │    Video Pipeline (Worker)  │ │     Audio Pipeline (AudioWorklet)  │ │
│  │ WebCodecs VideoDecoder      │ │ Web Audio API (32-bit float @48kHz)│ │
│  │ OffscreenCanvas + WebGL/WebGPU│ │ RNNoise WASM, LUFS, WSOLA        │ │
│  │ WebGPU Shaders (grade/FX)   │ │ Pitch-preserving stretch           │ │
│  │ VideoEncoder (encode)       │ │                                    │ │
│  └─────────────┬───────────────┘ └────────────┬──────────────────────┘ │
│                │                               │                        │
│  ┌─────────────▼───────────────────────────────▼──────────────────────┐ │
│  │              AI / Vision Subsystem (WASM / WebGPU)                │ │
│  │ MediaPipe/Transformers.js (portrait matting), Whisper.cpp (ASR),  │ │
│  │ OpenCV.js (motion tracking), HTDemucs (vocal separation)          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 20+** (for Electron build tooling)
- **Modern browser** with WebCodecs, WebGPU, WebAssembly support (Chrome 110+, Firefox 120+, Safari 16.4+)

### Development
```bash
# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm run dev

# Build for production
npm run build

# Package Electron app
npm run package
```

### Running Tests
```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

---

## 📁 Project Structure

```
cuttingboard/
├── src/
│   └── core/
│       ├── animation/     # Easing, keyframes, animator
│       ├── commands/      # Command pattern, undo/redo (Immer)
│       ├── io/            # CapCut draft JSON, OTIO adapter
│       ├── timeline/      # TimePoint, Segment, Track, Timeline
│       └── webcodecs/     # VideoDecoder, VideoEncoder, PlaybackEngine
├── tests/                 # 118 tests across 5 suites
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 📋 Build Plan (3 Parts)

| Part | Focus | Status |
|------|-------|--------|
| **Part 1** | Core Engine & Timeline Foundation | ✅ Complete |
| **Part 2** | Media Pipelines, Effects, Audio & AI | 🔄 In Progress |
| **Part 3** | Electron Shell, UI & Production | ⏳ Planned |

---

## 🧪 Testing

All features have **exactly one verification test** with deterministic pass/fail criteria. Run `npm test` to execute the full suite (118 tests).

| Test Suite | Tests | Coverage |
|------------|-------|----------|
| `timeline.test.ts` | 28 | Timebase, tracks, segments, split/trim/ripple |
| `animation.test.ts` | 27 | Easing, keyframes, transform evaluation |
| `commands.test.ts` | 29 | Undo/redo, command history, composite commands |
| `capcutDraft.test.ts` | 16 | JSON parser/serializer, OTIO bridge |
| `webcodecs.test.ts` | 18 | Decoder/encoder config, demuxer, scheduler |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built on the shoulders of giants:
- **WebCodecs, WebGPU, Web Audio API** — W3C standards
- **WebCodecs, WebGPU, Web Audio API** — Browser vendors
- **FFmpeg, libavcodec, libavformat** — Multimedia backbone
- **MediaPipe, Transformers.js, Whisper.cpp, OpenCV.js** — AI models in WASM
- **Immer, Ajv, Vitest, TypeScript** — Developer tooling
- **Electron** — Native desktop from web tech

---

**CuttingBoard** — Professional video editing, reimagined for the web.