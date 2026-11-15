# features.md - CapCut Engine & Window Architecture (Static Analysis)

## Executive Summary

Based on static REA analysis of `CapCut.exe` (SHA-256: `a7cf6fc9f9a130e435c5529744cbdb2cf5260eb4a8437cd5d4fab244661f4b20`), CapCut is a **Qt6-based native Windows application** built by ByteDance (internal name "JianyingPro" / "XCode"). The main executable is a lightweight launcher/entry point (~90 KB) that loads the core functionality through Qt6 and custom DLLs.

> **Evidence**: `ev_e47dcde86c4f6358db78e221207eb337c48f4262251adf61f33956a21004c15d` (artifact inventory), `ev_573c7348273db5e0db47963af6f6490c8226adba11927b313532b344eef2c09b` (managed inspection - not managed), `ev_b7244d88e76a07c89af0ced0c213092e93589ecec85e31248b3edad66606eccf` (binary overview)

---

## 1. Application Architecture

### 1.1 Main Executable Role
- **CapCut.exe** = Native PE32+ x86_64 launcher (~90,536 bytes)
- **Not managed**: No CLI metadata directory (pure native C++)
- **Entry point**: `entry` at `0x140004e30` (standard CRT startup)
- **Image base**: `0x140000000`

> **Evidence**: `ev_276e98f838bf8edb7e4f89c2cd8e595af1a579434f8dd3df625c406912b550dc` (binary overview), `ev_02df4d17bced562c29956e62ff1ec4d8811c2b0a07901b7e1a2b2d6214f4ba06` (procedure list)

### 1.2 Segment Layout
| Segment | Range | Size | Purpose |
|---------|-------|------|---------|
| Headers | `0x140000000` - `0x140000400` | 1 KB | PE headers |
| `.text` | `0x140001000` - `0x140006c00` | 23 KB | Code |
| `.rdata` | `0x140007000` - `0x14000b200` | 16 KB | Read-only data (strings, imports) |
| `.data` | `0x14000c000` - `0x14000cb28` | 2.8 KB | Read-write data |
| `.pdata` | `0x14000d000` - `0x14000d600` | 1.5 KB | Exception handling |
| `.rsrc` | `0x14000e000` - `0x140016200` | 32 KB | Resources (version info, manifest) |
| `.reloc` | `0x140017000` - `0x140017200` | 512 B | Relocations |
| `tdb` | `0xff00000000` - `0xff00001850` | 6 KB | Thread data block (TLS) |

> **Evidence**: `ev_276e98f838bf8edb7e4f89c2cd8e595af1a579434f8dd3df625c406912b550dc` (binary overview)

### 1.3 Procedure Inventory
- **323 procedures** discovered by Ghidra
- **~128 imported functions** (Qt6, CRT, Windows APIs, custom DLLs)
- **~195 internal functions** (mostly `FUN_` default names, some CRT internals)
- **No symbols recovered** from PDB (load state unknown)

> **Evidence**: `ev_02df4d17bced562c29956e62ff1ec4d8811c2b0a07901b7e1a2b2d6214f4ba06` (procedure list), `ev_b889fa1e9eee66925159dd425a246d00c9468f81d2b35c9429b1f99d908abd54` (procedures 100-199), `ev_03bfb14c213dd7536c86e84fc5d7f2c789707f102439e00594f53f28a1aabdad` (procedures 200-299), `ev_439e801299c4d52657e3b56c18abf1542b893289bb717672a687ff4f7154e5cf` (procedures 300-322)

---

## 2. Dependency Graph (Static Imports)

### 2.1 Qt6 Framework (Core UI/Logic)
| DLL | Key Imports | Purpose |
|-----|-------------|---------|
| `QT6CORE.DLL` | `QString`, `QUrl`, `QDir`, `QVariant`, `QHash`, `qRegisterResourceData`, `qUnregisterResourceData` | Core Qt types, resource system, filesystem |
| `QT6QML.DLL` | `QQmlPrivate::qmlregister`, `QQmlPrivate::qmlunregister` | QML type registration |

> **Evidence**: `ev_ed2d54e68a20d0d112995ddbd2dc252b7a1f0f34edfd4caf0dc47d62bc5cc935` (procedures 0-99), `ev_5b4fd7b34a20ba83f33f95f2a430c173748414c09d33585448c37f637f0707f0` (strings 0-99)

### 2.2 Custom ByteDance DLLs (Core Features)
| DLL | Exported Functions (Observed) | Inferred Purpose |
|-----|------------------------------|------------------|
| `VECONFIG.DLL` | `VEConfig::path::getVEHelperPath`, `getGlobalSettingIni`, `getDownloaderPath`, `getCrashPath`, `getCefPath`, `getVECrashHandlerPath`, `QSettingsProxy::value` | Configuration, paths, settings |
| `VESAFEGUARD.DLL` | `safe_guard_except_exit_monitor`, `safe_guard_first_load` | Crash monitoring, first-load safety |
| `VECreator` (QML module) | `VECreator`, `CefCreator`, `VETextTemplateCreator` | Video editing creator, CEF integration, text templates |

> **Evidence**: `ev_ed2d54e68a20d0d112995ddbd2dc252b7a1f0f34edfd4caf0dc47d62bc5cc935` (procedures 45-55), `ev_5b4fd7b34a20ba83f33f95f2a430c173748414c09d33585448c37f637f0707f0` (strings 5-12, 19-21)

### 2.3 Chromium Embedded Framework (CEF)
- **Command-line flags observed**: `--type=renderer`, `--type=utility`, `--type=gpu-process`, `--process-type=tool`, `--service-name=`, `enable_cef_subprocess_opt`
- **CEF paths**: `getCefPath` in VECONFIG
- **Log path**: `/Tool/cef_log.log`

> **Evidence**: `ev_5b4fd7b34a20ba83f33f95f2a430c173748414c09d33585448c37f637f0707f0` (strings 4, 13-18)

### 2.4 Windows APIs & CRT
- **KERNEL32.DLL**: Process/thread management, synchronization, error handling, DLL loading
- **VCRUNTIME140.DLL / MSVCP140.DLL**: C++ exception handling, memory ops, STL
- **API-MS-WIN-CRT-*-L1-1-0.DLL**: Universal CRT shims

> **Evidence**: `ev_ed2d54e68a20d0d112995ddbd2dc252b7a1f0f34edfd4caf0dc47d62bc5cc935` (procedures 56-99), `ev_7e1531b438bde77f3aa120b6f3642e1fc36a4caf561688aa07716af17615e627` (strings 109-199)

---

## 3. Window & UI Architecture (Inferred)

### 3.1 Qt6 + QML Hybrid
- **QML Modules**: `VECreator`, `Foundation` (with `QmlUtils.qml`)
- **QML Registration**: `qmlregister`/`qmlunregister` from `QT6QML.DLL`
- **Resource System**: `qRegisterResourceData` / `qUnregisterResourceData` for embedded assets
- **Emoji Detection**: `hasEmojiCharacters` function in `QmlUtils.qml` (RegExp-based)

> **Evidence**: `ev_5b4fd7b34a20ba83f33f95f2a430c173748414c09d33585448c37f637f0707f0` (strings 22-31), `ev_ed2d54e68a20d0d112995ddbd2dc252b7a1f0f34edfd4caf0dc47d62bc5cc935` (procedures 46-47)

### 3.2 Process Model (Multi-Process)
- **Main process**: `CapCut.exe` (launcher)
- **CEF subprocesses**: Renderer, GPU, Utility, Tool processes
- **Service registration**: `DeepAgentsService` (Mojom interface), `--service-name=` flag
- **Entry points**: `entryPoint`, `VECreator`, `CefCreator`

> **Evidence**: `ev_5b4fd7b34a20ba83f33f95f2a430c173748414c09d33585448c37f637f0707f0` (strings 5-12, 13-18)

---

## 4. Key Features Identified (Static)

| # | Feature | Static Evidence | Confidence |
|---|---------|----------------|------------|
| 1 | **Video Editing Core (VE)** | `VECreator`, `VETextTemplateCreator`, `VEConfig` paths | High |
| 2 | **Text/Template System** | `VETextTemplateCreator`, `QmlUtils.hasEmojiCharacters` | High |
| 3 | **Chromium/CEF Integration** | CEF command flags, `getCefPath`, `cef_log.log` | High |
| 4 | **Configuration Management** | `VEConfig::QSettingsProxy`, `getGlobalSettingIni`, version info | High |
| 5 | **Crash Monitoring** | `VESAFEGUARD.DLL::safe_guard_except_exit_monitor` | High |
| 6 | **Multi-Process Architecture** | `--type=renderer/gpu-process/utility`, `DeepAgentsService` | High |
| 7 | **Resource/Asset System** | `qRegisterResourceData`, `:/Foundation/` QML imports | Medium |
| 8 | **Downloader Component** | `getDownloaderPath` in VEConfig | Medium |
| 9 | **GPU Acceleration** | `--type=gpu-process`, `AmdPowerXpressRequestHighPerformance`, `NvOptimusEnablement` | Medium |
| 10 | **Logging/Diagnostics** | `/Tool/cef_log.log`, `OutputDebugStringW`, version resources | Medium |

> **Evidence**: All from `ev_5b4fd7b34a20ba83f33f95f2a430c173748414c09d33585448c37f637f0707f0` (strings), `ev_ed2d54e68a20d0d112995ddbd2dc252b7a1f0f34edfd4caf0dc47d62bc5cc935` (procedures), `ev_8c83c96e667a14e0ab1fce69cccf7e4ab043066d83016f8b6d720ff7eebedae9` (version strings)

---

## 5. Version & Build Metadata

| Field | Value |
|-------|-------|
| **Product Name** | CapCut |
| **Internal Name** | XCode (JianyingPro) |
| **Company** | ByteDance |
| **File Version** | 9.7.1.4203 |
| **Product Version** | 9.7.1.13ba4b5d |
| **Copyright** | Copyright (C) 2026 ByteDance |
| **Original Filename** | CapCut.exe |
| **Manifest** | Common Controls 6.0, asInvoker, Win10+ compatibility |

> **Evidence**: `ev_8c83c96e667a14e0ab1fce69cccf7e4ab043066d83016f8b6d720ff7eebedae9` (version strings 200-222)

---

## 6. Limitations & Unknowns (Static Analysis Only)

| Unknown | Reason |
|---------|--------|
| **Complete function call graph** | Only direct imports observed; indirect calls, virtual dispatch unknown |
| **Runtime window creation** | No live observation; QML window hierarchy unknown |
| **Video pipeline details** | `VECreator` internals not decompiled; codec/format support unknown |
| **Network/API endpoints** | No traffic capture; backend communication unknown |
| **Plugin/extension system** | QML module loading observed but not full plugin architecture |
| **User settings schema** | `QSettingsProxy` used but keys/structure unknown |
| **CEF remote debugging** | `--inspect` flags not observed; `EnableNodeCliInspectArguments` fuse unknown |

> **Evidence**: All limitations from binary overview (`ev_276e98f838bf8edb7e4f89c2cd8e595af1a579434f8dd3df625c406912b550dc`) and procedure/string inventories

---

## 7. Next Probes for Deeper Analysis

1. **Decompile entry point** (`0x140004e30`) and early initialization (`FUN_140001000` series)
2. **Analyze `VECONFIG.DLL`** and `VESAFEGUARD.DLL` directly (separate `open_binary`)
3. **Trace `qRegisterResourceData` callers** to find resource initialization
4. **Inspect QML files** in `Resources/` directory (extracted separately)
5. **Capture runtime** with `capture_browser_scenario` or `observe_native_ui` for live window behavior
6. **Compare versions** if multiple CapCut installations available

---

## 8. CuttingBoard: Web-Based Architecture Design

Building upon the reverse-engineered insights from CapCut (ByteDance LV Editor / VECreator / Qt6 / CEF), this section defines the blueprint for **CuttingBoard** — a **Web-first video editor** using **HTML5 Canvas**, **WebCodecs API**, **WebGL 2 / WebGPU**, and **modular TypeScript/JavaScript**, wrapped in **Electron** for native desktop distribution.

### 8.1 Engine Architecture Overview

CuttingBoard is designed as a decoupled, high-performance Non-Linear Editing (NLE) multimedia system composed of modular subsystems running in a web environment (browser main thread + Web Workers + OffscreenCanvas):

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Electron Main Process                            │
│  - Native menus, file dialogs, auto-updater, window management      │
│  - Node.js integration for filesystem, FFmpeg CLI, C2PA signing     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ IPC (contextBridge / preload)
┌────────────────────────────────▼────────────────────────────────────┐
│                 Renderer Process (Browser Context)                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                   Application Shell (React/Solid + TypeScript) │ │
│  │  - Dockable multi-pane layout (CSS Grid / Flexbox / Golden    │ │
│  │    Layout / dnd-kit)                                           │ │
│  │  - Media Browser, Property Inspector, Timeline Canvas,        │ │
│  │    Viewport Toolbar                                            │ │
│  └───────────────────────────┬────────────────────────────────────┘ │
│                              │                                        │
│  ┌───────────────────────────▼────────────────────────────────────┐ │
│  │                    Editor Core (Main Thread)                   │ │
│  │  - Timeline Graph & Multi-Track Composition (microseconds)     │ │
│  │  - Keyframe Evaluator (Bezier / Linear / Hold / Spring)        │ │
│  │  - Transactional Undo / Redo Command Stack (Immer / custom)    │ │
│  │  - CapCut Draft JSON Importer / Exporter (`draft_content.json`)│ │
│  │  - OTIO / FCPXML / AAF Bridge (OpenTimelineIO-WASM)            │ │
│  └─────────────┬───────────────────────────┬──────────────────────┘ │
│                │                           │                        │
│  ┌─────────────▼───────────────┐ ┌─────────▼──────────────────────┐ │
│  │   Video Pipeline (Worker)   │ │     Audio Pipeline (Worker)    │ │
│  │ - WebCodecs VideoDecoder    │ │ - Web Audio API (AudioWorklet) │ │
│  │ - OffscreenCanvas + WebGL 2 │ │ - 32-bit float @ 48 kHz        │ │
│  │   / WebGPU Compositor       │ │ - RNNoise (WASM) Denoiser      │ │
│  │ - WebGL/WebGPU Shaders for  │ │ - LUFS Meter (BS.1770-4)       │ │
│  │   Color Grading, Blend, FX  │ │ - WSOLA Pitch-Preserving Stretch│ │
│  │ - VideoEncoder (WebCodecs)  │ │ - AudioWorklet for real-time   │ │
│  └─────────────┬───────────────┘ └─────────┬──────────────────────┘ │
│                │                           │                        │
│  ┌─────────────▼───────────────────────────▼──────────────────────┐ │
│  │              AI / Vision Subsystem (WASM / WebGPU)             │ │
│  │ - MediaPipe / Transformers.js / ONNX Runtime Web               │ │
│  │ - Portrait Matting (Selfie Segmentation)                       │ │
│  │ - Whisper.cpp (WASM) for Auto-Captions                         │ │
│  │ - Motion Tracking (Optical Flow / Template Matching)           │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Subsystem Specifications

#### 8.2.1 Core Timeline Engine (`CoreNLE` / TypeScript)
- **Time Representation**: Pure integer microseconds (`bigint` in $\mu s$) stored in a normalized timeline store. Matches CapCut's native time unit (`source_timerange.start`, `duration`). Avoids floating-point drift over multi-hour timelines.
- **Track Management**: Multi-track hierarchy supporting concurrent tracks:
  - Video tracks (Primary magnetic track with ripple editing + arbitrary overlay B-roll tracks)
  - Audio tracks (Background music, dialogue, sound effects, voiceovers)
  - Text & Subtitle tracks (Timed captions, animated text templates)
  - Effect & Filter tracks (Adjustment layers affecting all tracks beneath)
- **Segment Transform Model**: Position $(X, Y)$, Scale $(S_x, S_y)$, Rotation ($\theta$), Anchor Point, Opacity ($\alpha$), Blend Mode (Multiply, Screen, Overlay, etc.) — all animatable via keyframes.
- **Keyframe Engine**: Cubic bezier, linear, hold, and spring interpolation for all numeric properties (position, scale, rotation, audio volume, effect parameters).

#### 8.2.2 WebCodecs Video Pipeline (`VideoPipeline` / Web Worker + OffscreenCanvas)
- **Decoding Engine**: `VideoDecoder` (WebCodecs API) with hardware acceleration preference (`preferHardwareAcceleration: true`). Supports H.264, HEVC, VP9, AV1. Falls back to software decoders (FFmpeg.wasm) if needed.
- **Frame Management**: `VideoFrame` pool with `close()` discipline. LRU cache with prefetch along playhead direction. Transferable to OffscreenCanvas via `transferControlToOffscreen()`.
- **Compositor**: WebGL 2 (fallback) / WebGPU (preferred) node graph rendering layers bottom-to-top:
  1. Base texture upload (YUV→RGB via shader or `VideoFrame.copyTo()`)
  2. Geometry transform & crop (vertex shader / compute shader)
  3. Mask evaluation (Shape, Alpha, Invert) via stencil or fragment shader
  4. Color grading pass (Lift/Gamma/Gain, 8-ch HSL, 3D LUT 3D texture, RGB Curves 1D textures)
  5. Effect shaders (Blur, Glitch, Glow, Distortion, Custom WGSL/GLSL)
  6. Transition blending (Alpha dissolve, Wipe, Zoom, Directional blur)
- **Export Pipeline**: `VideoEncoder` (WebCodecs) with hardware acceleration. Supports H.264 (Main/High), HEVC (Main), VP9, AV1. Configurable bitrate modes (CBR, VBR, CQ). MP4 muxing via `mp4box.js` or `ffmpeg.wasm`.

#### 8.2.3 Web Audio API Audio Pipeline (`AudioPipeline` / AudioWorklet)
- **Audio Graph**: `AudioContext` at 48 kHz, 32-bit float. `AudioWorkletProcessor` for real-time DSP without main-thread jitter.
- **Dynamic DSP Chain**:
  - Sample-accurate clipping, splicing, crossfades
  - Volume automation & exponential fade curves (parameter automation)
  - Parametric EQ (BiquadFilterNode chain or custom DSP)
  - Real-time AI noise reduction (RNNoise compiled to WASM, run in AudioWorklet)
  - Loudness metering & normalization (ITU-R BS.1770-4 / EBU R128 to -14 LUFS)
  - Pitch-preserving time stretch (WSOLA / Phase Vocoder in AudioWorklet)
  - Stereo panning, binaural spatialization (PannerNode)

#### 8.2.4 AI & Computer Vision Subsystem (`AIEngine` / WASM + WebGPU)
- **Background Removal**: MediaPipe Selfie Segmentation or Transformers.js (ONNX Runtime Web) for real-time portrait matting at 30+ fps.
- **Speech-to-Text (Auto Captions)**: `whisper.cpp` compiled to WASM (quantized `tiny`/`base` models) running in a Dedicated Worker for offline ASR with word-level timestamps.
- **Chroma Key**: Two-pass WebGL/WebGPU color distance keyer with despill and edge feathering uniforms.
- **Motion Tracking**: Optical flow (Farnebäck / Lucas-Kanade in WASM) or template matching for binding text/stickers to moving objects.

### 8.3 Application Shell & UI System Design

#### 8.3.1 Electron + Web Window Architecture
- **Framework**: Electron 30+ (Chromium 120+, V8, Node.js 20+). **Context Isolation** enabled, **preload script** exposes safe IPC surface (`contextBridge`).
- **UI Library**: React 18 / SolidJS with TypeScript, Tailwind CSS, Radix UI / shadcn-ui primitives. Virtualized lists for media pools.
- **Layout Engine**: `golden-layout` or custom CSS Grid / Flexbox dockable pane system with persistable JSON layout state (localStorage / Electron Store).
- **High-DPI**: Native `devicePixelRatio` handling; Canvas `width`/`height` = CSS size × DPR; `canvas.style.width/height` = CSS size.
- **Window Layout**: Modular dockable multi-pane workspace:
  - **Media & Assets Browser (Left)**: Tabbed media pool (Media, Audio, Text, Stickers, Effects, Transitions, Filters) with virtualized grid.
  - **Player Viewport (Center)**: `<canvas>` / OffscreenCanvas receiving composited frames; interactive transform gizmos (SVG overlay or canvas-rendered handles).
  - **Inspector & Property Panel (Right)**: Reactive form binding to selected segment's keyframeable properties.
  - **Timeline Canvas (Bottom)**: High-performance virtualized `<canvas>` (or `<table>` + CSS for tracks) with 60fps zoom/pan, waveform rendering via OffscreenCanvas + AudioWorklet, clip trimming handles, magnetic snap guides.

#### 8.3.2 Project & Draft Format Interoperability
- Direct bidirectional compatibility with CapCut's native project structure (`draft_content.json` and `draft_meta_info.json`), allowing projects saved in CuttingBoard to open directly in CapCut Desktop and vice versa.
- **Read**: Parse `draft_content.json` and `draft_meta_info.json` from CapCut project directories using JSON Schema validation (Ajv).
- **Write**: Export projects directly to CapCut-compatible draft folders for seamless roundtripping with CapCut desktop.
- **OTIO Bridge**: `OpenTimelineIO` compiled to WASM (via Pyodide or native JS port `otio.js`) for export to Final Cut Pro (FCPXML), Premiere Pro (AAF/EDL), and DaVinci Resolve.

---

*Generated by REA static analysis and architecture design. All claims backed by Evidence IDs. Runtime behavior not verified.*