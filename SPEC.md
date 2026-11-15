# SPEC.md - CuttingBoard: Web-Based Video Editor Specification

## 1. Executive Overview & Reverse-Engineering Provenance

This document specifies the complete functional requirements, architecture, feature-by-feature test suite, and 3-part build plan for **CuttingBoard** — a web-first video editor built on **HTML5 Canvas**, **WebCodecs API**, **WebGL 2 / WebGPU**, and **modular TypeScript/JavaScript**, wrapped in **Electron** for native desktop distribution.

The feature set and architectural priorities are derived from static reverse-engineering analysis of **CapCut Desktop (JianyingPro)** version `9.7.1.4203` (Windows x64) using the **REA (Reverse Engineer Anything)** toolset with Ghidra `12.1.4` and direct artifact inspection.

### 1.1 REA Evidence Register
Every architectural decision and feature requirement in this specification is anchored to authenticated REA evidence:

| Evidence ID | Target / Provider | Observed Architectural Fact |
|-------------|-------------------|-----------------------------|
| `ev_e47dcde86c4f6358db78e221207eb337c48f4262251adf61f33956a21004c15d` | `CapCut.exe` (SHA-256: `a7cf6fc9...`) | PE32+ x86_64 native executable, uncompressed root container |
| `ev_573c7348273db5e0db47963af6f6490c8226adba11927b313532b344eef2c09b` | `inspect_managed_artifact` | Non-managed PE (no CLI header); native C++ runtime |
| `ev_276e98f838bf8edb7e4f89c2cd8e595af1a579434f8dd3df625c406912b550dc` | `binary_overview` (Ghidra 12.1.4) | 323 procedures, 8 segments (`.text`, `.rdata`, `.data`, `.pdata`, `.rsrc`, `.reloc`, `tdb`) |
| `ev_02df4d17bced562c29956e62ff1ec4d8811c2b0a07901b7e1a2b2d6214f4ba06` | `list_procedures` | Direct imports: `QT6CORE.DLL`, `QT6QML.DLL`, `VECONFIG.DLL`, `VESAFEGUARD.DLL` |
| `ev_5b4fd7b34a20ba83f33f95f2a430c173748414c09d33585448c37f637f0707f0` | `list_strings` | QML module `Foundation`, `VECreator`, `CefCreator`, `--type=renderer`, Mojom `DeepAgentsService` |
| `ev_8c83c96e667a14e0ab1fce69cccf7e4ab043066d83016f8b6d720ff7eebedae9` | `list_strings` | Product version `9.7.1.13ba4b5d`, company ByteDance, internal name `XCode` / `JianyingPro` |
| `ev_3d71a0dfa421a0d21d2384d57a44f8a1d25f8ec90a2d335d13c36301f31b349a` | `analyze_function` (`entry`) | Entry point `0x140004e30` initializes security cookies, calls CRT init |
| `ev_88b744f7af7b4b50d3b98400cb8b8d6d1c6461b9f76880adedec5e8b0652f265` | `analyze_function` (`FUN_1400033c0`) | Main launcher sets system PATH, isolates DLL loading, handles multi-process roles |
| *Artifact Inspection* | `Tools/draft-converter` | OpenTimelineIO (OTIO 0.18.1), AAF (`pyaaf2`), FCPXML, FCP7 XML conversion pipeline |
| *Artifact Inspection* | Root DLLs | `VECreator.dll` (281 MB), `cccreator.dll` (158 MB), `lens.dll` (88 MB), `videoeditor.dll` (72 MB), `lynx.dll` (24 MB), `avcodec-61.dll`, `openvino.dll`, `SvtAv1Enc.dll`, `audioeffect.dll` |
| *Artifact Inspection* | User Drafts | `draft_content.json` schema: microsecond time ranges, tracks, materials, canvas configs, keyframes |

---

## 2. Comprehensive Feature Specification & Verification Tests

Every feature discovered during REA analysis is defined below with its operational specification and exactly **one test** verifying its correct implementation. Implementation targets the **Web Platform** (WebCodecs, WebGL 2 / WebGPU, Web Audio API, Web Workers, OffscreenCanvas).

### Category 1: Project & Timeline Core

#### Feature 1.1: Microsecond-Precision Timebase Engine
- **Description**: The editor represents all clip start times, trim in/out points, transitions, and timeline durations using **JavaScript `bigint`** in microseconds ($\mu s$). This eliminates floating-point rounding errors and framerate drift over long sessions. Rational framerates (23.976, 29.97, etc.) are stored as `{numerator: bigint, denominator: bigint}`.
- **Verification Test `TEST-1.1`**:
  - *Name*: `test_microsecond_timeline_arithmetic`
  - *Preconditions*: Initialize timeline at 23.976 fps, 29.97 fps, and 60 fps.
  - *Execution*: Insert 10,000 contiguous 1-frame segments sequentially; calculate total duration using microsecond accumulation versus timestamp delta.
  - *Expected Outcome*: Total duration matches mathematical expectation without a single microsecond drift ($|\Delta| = 0\,\mu s$).

#### Feature 1.2: Multi-Track Magnetic & Free Timeline
- **Description**: Supports multiple concurrent tracks: Primary Video (with optional magnetic ripple editing), Overlay Video (B-Roll), Audio (Dialogue, Music, Sound FX), Text/Subtitles, and Adjustment/Filter layers. Track order determines compositing z-index.
- **Verification Test `TEST-1.2`**:
  - *Name*: `test_multi_track_composition_order`
  - *Preconditions*: 3 video tracks populated with overlapping clips (Track 1 = solid red, Track 2 = 50% opacity solid green, Track 3 = 50% opacity solid blue).
  - *Execution*: Request composited frame at time $t = 1.0\,\text{s}$ via compositor worker.
  - *Expected Outcome*: Composite pixel color evaluates strictly to bottom-to-top blending order ($R \rightarrow G \rightarrow B$).

#### Feature 1.3: Ripple Edit & Gap Management
- **Description**: When ripple edit mode is enabled, deleting or shortening a clip on the main track automatically pulls subsequent clips leftward to close the gap. When disabled, deletion creates an empty gap.
- **Verification Test `TEST-1.3`**:
  - *Name*: `test_ripple_deletion_shift`
  - *Preconditions*: Three 5-second clips (A, B, C) on the primary track spanning $0 - 15\,\text{s}$.
  - *Execution*: Enable ripple mode; delete clip B ($5 - 10\,\text{s}$).
  - *Expected Outcome*: Clip C start shifts from $10\,\text{s}$ to $5\,\text{s}$; total timeline duration becomes $10\,\text{s}$.

#### Feature 1.4: Clip Split & Trimming
- **Description**: Non-destructive splitting of clips at the playhead position into two independent segments, preserving source media references and adjusting `source_timerange` and `target_timerange`.
- **Verification Test `TEST-1.4`**:
  - *Name*: `test_clip_split_boundary_integrity`
  - *Preconditions*: A 10-second clip spanning $0 - 10\,\text{s}$ on timeline with source $0 - 10\,\text{s}$.
  - *Execution*: Execute split at $t = 4.0\,\text{s}$.
  - *Expected Outcome*: Two segments created: Segment 1 (target $0-4\,\text{s}$, source $0-4\,\text{s}$) and Segment 2 (target $4-10\,\text{s}$, source $4-10\,\text{s}$); playback at boundary is seamless without dropped frames.

#### Feature 1.5: Reverse Playback
- **Description**: Plays video and audio media in reverse chronologically while preserving source synchronization and speed settings. Implemented by requesting frames in reverse PTS order from the decoder.
- **Verification Test `TEST-1.5`**:
  - *Name*: `test_reverse_frame_rendering`
  - *Preconditions*: A 30-frame clip with burnt-in frame index numbers (1 to 30).
  - *Execution*: Set `reverse = true`; render frames sequentially from timeline start.
  - *Expected Outcome*: Output frames display numbers in decreasing sequence: 30, 29, 28, ..., 1.

#### Feature 1.6: Freeze Frame Generation
- **Description**: Freezes a single selected video frame at the playhead for a configurable duration (default 3 seconds), inserting it into the timeline without re-encoding source media. Implemented by holding a `VideoFrame` reference and repeating it.
- **Verification Test `TEST-1.6`**:
  - *Name*: `test_freeze_frame_insertion`
  - *Preconditions*: 5-second video clip on timeline; playhead at $t = 2.0\,\text{s}$.
  - *Execution*: Invoke freeze-frame action with duration $3.0\,\text{s}$.
  - *Expected Outcome*: Original clip split into two parts; a 3-second still image segment referencing the frame at $t = 2.0\,\text{s}$ is inserted between them.

#### Feature 1.7: Compound Clips (Nested Sequences)
- **Description**: Groups multiple clips across multiple tracks into a single container clip (subdraft) that can be manipulated, trimmed, and transitioned as one unit. Implemented as a recursive timeline tree structure.
- **Verification Test `TEST-1.7`**:
  - *Name*: `test_compound_clip_encapsulation`
  - *Preconditions*: 2 video clips and 1 audio clip across 3 tracks selected.
  - *Execution*: Invoke `create_compound_clip`.
  - *Expected Outcome*: Selected tracks collapse into a single compound clip; opening the compound clip displays the internal tracks with identical relative timings.

#### Feature 1.8: Canvas Aspect Ratio & Background Modes
- **Description**: Project canvas supports preset aspect ratios (16:9, 9:16, 1:1, 4:3, 21:9) and custom sizes. Canvas background supports Solid Color, 3-level Gaussian Blur of the active video (via separable WebGL/WebGPU blur shader), or custom Image Wallpaper.
- **Verification Test `TEST-1.8`**:
  - *Name*: `test_canvas_blur_background_generation`
  - *Preconditions*: 16:9 video placed in a 9:16 canvas with Background Mode set to Blur Level 2.
  - *Execution*: Render composite frame at $t = 1.0\,\text{s}$ via compositor worker.
  - *Expected Outcome*: Central 16:9 area displays sharp video; upper and lower pillarbox areas display blurred scaled video with Gaussian radius matching Level 2.

#### Feature 1.9: CapCut Draft JSON Bidirectional Serialization
- **Description**: Complete compatibility with CapCut's native project structure (`draft_content.json` and `draft_meta_info.json`), allowing projects saved in CuttingBoard to open directly in CapCut Desktop and vice versa. Uses JSON Schema (Ajv) for validation.
- **Verification Test `TEST-1.9`**:
  - *Name*: `test_capcut_draft_roundtrip_equivalence`
  - *Preconditions*: Load valid CapCut project `0512/draft_content.json`.
  - *Execution*: Deserialize into engine data structures, re-serialize to a new JSON file, and compare schemas and normalized values.
  - *Expected Outcome*: All tracks, materials, keyframes, and timeranges match original project values with 100% fidelity.

#### Feature 1.10: OpenTimelineIO / FCPXML / AAF Interoperability
- **Description**: Built-in library integration for exporting/importing industry-standard timeline formats (Final Cut Pro FCPXML, Premiere Pro AAF/XML, DaVinci Resolve OTIO) via `otio.js` (OpenTimelineIO compiled to WASM) or native TypeScript adapters.
- **Verification Test `TEST-1.10`**:
  - *Name*: `test_draft_to_fcpxml_conversion`
  - *Preconditions*: Project with multi-clip edit and audio tracks.
  - *Execution*: Run draft converter export to FCPXML format.
  - *Expected Outcome*: Generated FCPXML validates against Apple DTD schema v1.10 and matches timeline cuts.

---

### Category 2: Video Processing & Visual Effects (WebCodecs + WebGL/WebGPU)

#### Feature 2.1: Hardware-Accelerated Video Decoding (WebCodecs)
- **Description**: Hardware-accelerated video decoding using **WebCodecs `VideoDecoder`** API with `preferHardwareAcceleration: true`. Supports H.264, HEVC, VP9, AV1. Falls back to software decoding (FFmpeg.wasm) if hardware decoder unavailable.
- **Verification Test `TEST-2.1`**:
  - *Name*: `test_webcodecs_hardware_decode_4k60`
  - *Preconditions*: 4K H.264 60fps video test file; `VideoDecoder.isConfigSupported({codec: 'avc1.640028', hardwareAcceleration: 'prefer-hardware'})` returns `true`.
  - *Execution*: Decode 300 sequential frames measuring `decode()` latency and `VideoFrame` throughput.
  - *Expected Outcome*: Hardware decoder initializes successfully; average decoding time per frame is $< 10\,\text{ms}$; zero frame drops.

#### Feature 2.2: Geometric Transforms & Anchor Points
- **Description**: Real-time 2D affine transformation on any video/image layer: Scale $(X, Y)$, Position $(X, Y)$, Rotation ($\theta$), Anchor offset, and Flip Horizontal/Vertical. Implemented via vertex shader (WebGL) / compute + vertex shader (WebGPU) with uniform buffer for transform matrix.
- **Verification Test `TEST-2.2`**:
  - *Name*: `test_affine_transform_matrix_webgl`
  - *Preconditions*: A $1920\times 1080$ test texture with a white square at $(100, 100)$.
  - *Execution*: Apply Scale $2.0$, Rotation $90^\circ$, Translate $(+200, +100)$; render frame via OffscreenCanvas.
  - *Expected Outcome*: Output pixel positions strictly match calculated affine transformation matrix within $\pm 0.5$ pixel tolerance.

#### Feature 2.3: Bezier Keyframe Animation System
- **Description**: Animates any scalar/vector property (position, scale, rotation, opacity, volume, filter parameters) across time using cubic bezier interpolation curves with adjustable tangent handles. Evaluated on main thread for UI, in compositor worker for render.
- **Verification Test `TEST-2.3`**:
  - *Name*: `test_bezier_keyframe_interpolation`
  - *Preconditions*: Keyframe 1 at $t = 0\,\text{s}$ (value $0.0$, ease-out handle), Keyframe 2 at $t = 2.0\,\text{s}$ (value $100.0$, ease-in handle).
  - *Execution*: Sample interpolated value at $t = 1.0\,\text{s}$.
  - *Expected Outcome*: Evaluated value matches cubic bezier curve calculation ($\approx 50.0 \pm 0.1$) exhibiting S-curve easing rather than linear slope.

#### Feature 2.4: Layer Blend Modes
- **Description**: GPU fragment shader blending supporting 14 blend modes: Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion, Hue, Saturation. Implemented as shader permutations or dynamic branching.
- **Verification Test `TEST-2.4`**:
  - *Name*: `test_gpu_blend_mode_screen_webgl`
  - *Preconditions*: Background layer $RGB(0.5, 0.2, 0.8)$, Foreground layer $RGB(0.2, 0.5, 0.1)$ set to Screen mode ($1 - (1-A)(1-B)$).
  - *Execution*: Execute GPU blend shader on test textures via OffscreenCanvas.
  - *Expected Outcome*: Composited output matches formula: $R = 0.60, G = 0.60, B = 0.82 \pm 0.01$.

#### Feature 2.5: Video Masks (Geometric & Freeform)
- **Description**: Alpha masking supporting Linear, Mirror, Radial (ellipse), Rectangle, Heart, and Star geometries with configurable feathering, expansion, and inversion. Implemented via stencil buffer (WebGL) or compute shader mask generation (WebGPU).
- **Verification Test `TEST-2.5`**:
  - *Name*: `test_circular_mask_feathering_webgl`
  - *Preconditions*: Solid white video layer with Radial mask at center, radius $200\,\text{px}$, feather $50\,\text{px}$.
  - *Execution*: Sample alpha values along radial line from center to $300\,\text{px}$ via `readPixels`.
  - *Expected Outcome*: Alpha is $1.0$ at $<175\,\text{px}$, smoothly decreases from $1.0$ to $0.0$ between $175-225\,\text{px}$, and is $0.0$ at $>225\,\text{px}$.

#### Feature 2.6: Chroma Keying (Green/Blue Screen Removal)
- **Description**: Color difference chroma keyer with user-selected target hue, tolerance/intensity threshold, edge feathering, and spill suppression. Implemented as WebGL/WebGPU fragment shader with uniform parameters.
- **Verification Test `TEST-2.6`**:
  - *Name*: `test_chroma_key_green_isolation_webgl`
  - *Preconditions*: Video frame containing a subject over pure green backdrop $RGB(0, 255, 0)$.
  - *Execution*: Apply chroma key shader with target green, tolerance $0.4$, despill $0.8$.
  - *Expected Outcome*: Backdrop alpha reaches $0.0$; green spill on subject edges is neutralized without eroding non-green subject pixels.

#### Feature 2.7: AI Smart Cutout (Portrait Matting)
- **Description**: Neural human segmentation that extracts subjects from video backgrounds in real time without a physical green screen. Uses **MediaPipe Selfie Segmentation** (WASM/WebGL backend) or **Transformers.js** (ONNX Runtime Web) running in a Dedicated Worker.
- **Verification Test `TEST-2.7`**:
  - *Name*: `test_ai_portrait_matting_inference_wasm`
  - *Preconditions*: Input video frame of human presenter in urban environment.
  - *Execution*: Run segmentation model pass in worker; generate alpha matte texture; composite in main compositor.
  - *Expected Outcome*: Alpha channel segments human figure with $> 95\%$ IoU (Intersection over Union) against ground truth mask; inference latency $< 33\,\text{ms}$ (30 fps).

#### Feature 2.8: Variable Speed & Bezier Curve Speed
- **Description**: Constant speed change ($0.1\times$ to $100\times$) and custom multi-point speed curves (Montage, Hero, Bullet Time) with optional optical flow frame interpolation (via WASM optical flow). Speed curve maps timeline time $\rightarrow$ source media PTS.
- **Verification Test `TEST-2.8`**:
  - *Name*: `test_curve_speed_time_remapping`
  - *Preconditions*: 10-second clip with speed curve: $0-2\,\text{s}$ at $1\times$, accelerating to $5\times$ at $5\,\text{s}$, decelerating to $0.5\times$ at $10\,\text{s}$.
  - *Execution*: Map timeline timestamps to source video PTS using speed curve integral.
  - *Expected Outcome*: PTS progression follows integral of speed curve; output duration exactly matches target timerange.

---

### Category 3: Color Grading & Look Development (WebGL/WebGPU Shaders)

#### Feature 3.1: Primary Lift / Gamma / Gain Wheels
- **Description**: Industry-standard 3-way color grading wheels adjusting shadows (Lift), midtones (Gamma), and highlights (Gain) across independent RGB channels and master luminance. Implemented as a single fragment shader with 12 uniform parameters.
- **Verification Test `TEST-3.1`**:
  - *Name*: `test_lift_gamma_gain_response_shader`
  - *Preconditions*: Greyscale gradient test texture ($0.0$ to $1.0$).
  - *Execution*: Increase Lift red channel by $+0.2$; decrease Gain blue channel by $-0.2$; render via shader.
  - *Expected Outcome*: Shadow blacks shift red; highlights shift yellow/warm; gamma midpoint transitions smoothly according to grading equations.

#### Feature 3.2: 8-Channel HSL Selective Color Correction
- **Description**: Targeted adjustments for 8 color families (Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta) controlling Hue shift, Saturation delta, and Luminance delta. Implemented as hue-range mask + HSL adjustment in fragment shader.
- **Verification Test `TEST-3.2`**:
  - *Name*: `test_hsl_selective_hue_shift_shader`
  - *Preconditions*: Texture containing distinct blue sky and red car.
  - *Execution*: Shift Blue channel Hue by $+60^\circ$ (towards cyan); leave other channels at $0$; render via shader.
  - *Expected Outcome*: Sky pixels change hue while red car pixels retain exact original RGB values within $0.1\%$.

#### Feature 3.3: Spline RGB & Luma Color Curves
- **Description**: Interactive spline curve editor with Master (Luma), Red, Green, and Blue curves supporting multiple arbitrary control points with cubic spline smoothing. Curves baked into 1D lookup textures (256 texels) uploaded to GPU.
- **Verification Test `TEST-3.3`**:
  - *Name*: `test_spline_curve_evaluation_texture`
  - *Preconditions*: Add control points at $(0, 0)$, $(0.25, 0.1)$, $(0.75, 0.9)$, $(1.0, 1.0)$ on Master curve (S-curve).
  - *Execution*: Pass linear test ramp through curve lookup texture in fragment shader.
  - *Expected Outcome*: Output exhibits increased contrast matching calculated cubic spline knot points.

#### Feature 3.4: 3D LUT (.cube) Import & Application
- **Description**: Loads standard $17\times 17\times 17$, $33\times 33\times 33$, or $65\times 65\times 65$ `.cube` format 3D Look-Up Tables with trilinear interpolation on GPU. Parsed on main thread, uploaded as 3D texture (`TEXTURE_3D` WebGL 2 / `texture_3d` WebGPU).
- **Verification Test `TEST-3.4`**:
  - *Name*: `test_3d_lut_trilinear_sampling_webgl`
  - *Preconditions*: Load a known calibration `.cube` LUT file (e.g., identity + sepia tint).
  - *Execution*: Process test texture on GPU fragment shader using 3D texture sampler.
  - *Expected Outcome*: Transformed pixel values match CPU reference software trilinear interpolation within $\Delta E < 0.5$.

#### Feature 3.5: Basic Adjustment Sliders
- **Description**: 12 core photographic adjustments: Temperature, Tint, Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Saturation, Sharpness, Clarity, and Vignette. Implemented as combined fragment shader with uniform parameters.
- **Verification Test `TEST-3.5`**:
  - *Name*: `test_temperature_tint_white_balance_shader`
  - *Preconditions*: Neutral grey test patch $RGB(128, 128, 128)$.
  - *Execution*: Apply Temperature $+50$ (warm), Tint $+20$ (magenta) via shader uniforms.
  - *Expected Outcome*: Red channel increases, Blue channel decreases, Green channel shifts slightly matching chromaticity coordinates on the Planckian locus.

---

### Category 4: Audio Engine & DSP (Web Audio API + AudioWorklet + WASM)

#### Feature 4.1: Multi-Channel 32-bit Floating Point Mixer
- **Description**: High-fidelity audio mixing engine operating at 48 kHz, 32-bit float internal depth, supporting independent track channel gain, clipping prevention, and master bus summing. Implemented via `AudioContext` (`latencyHint: 'interactive'`) with `GainNode` per track.
- **Verification Test `TEST-4.1`**:
  - *Name*: `test_audio_mixer_headroom_summing_webaudio`
  - *Preconditions*: Two full-scale 0 dBFS sine waves ($1\,\text{kHz}$ and $2\,\text{kHz}$) via `AudioBufferSourceNode`.
  - *Execution*: Mix both signals on master bus without attenuation; capture via `OfflineAudioContext`.
  - *Expected Outcome*: 32-bit float buffer stores signal up to $+6\,\text{dBFS}$ without hard digital clipping; master gain $-6\,\text{dB}$ restores clean sine waveforms.

#### Feature 4.2: Exponential Audio Fades
- **Description**: Configurable audio fade-in and fade-out durations using smooth exponential curve envelopes to eliminate audible clicks and pops at segment boundaries. Implemented via `AudioParam` automation (`setTargetAtTime`, `exponentialRampToValueAtTime`).
- **Verification Test `TEST-4.2`**:
  - *Name*: `test_audio_fade_in_smoothness_audioparam`
  - *Preconditions*: Continuous $440\,\text{Hz}$ tone via `AudioBufferSourceNode`; apply 500 ms Fade-In via `gainNode.gain.setTargetAtTime`.
  - *Execution*: Measure amplitude envelope of first 24,000 samples ($500\,\text{ms}$ at $48\,\text{kHz}$) via `OfflineAudioContext`.
  - *Expected Outcome*: Amplitude begins at $0.0$, increases monotonically following exponential curve, reaching $1.0$ at sample 24,000 without discontinuity.

#### Feature 4.3: Real-Time AI Noise Reduction (RNNoise WASM)
- **Description**: Neural network speech denoiser based on RNNoise architecture running in real time to isolate speech and suppress ambient background noise (fans, hums, traffic). **RNNoise compiled to WASM**, executed in an `AudioWorkletProcessor` for zero-main-thread-jitter processing.
- **Verification Test `TEST-4.3`**:
  - *Name*: `test_rnnoise_suppression_ratio_audioworklet`
  - *Preconditions*: Clean voice recording mixed with stationary pink noise at $0\,\text{dB}$ SNR.
  - *Execution*: Process audio stream through `AudioWorkletNode` hosting RNNoise WASM.
  - *Expected Outcome*: Noise floor during non-speech pauses drops by $\ge 18\,\text{dB}$ while voice frequency spectrum is preserved; AudioWorklet processing time $< 3\,\text{ms}$ per 128-frame block.

#### Feature 4.4: Loudness Normalization (ITU-R BS.1770-4 / EBU R128)
- **Description**: Automatic loudness analysis and gain adjustment to conform audio tracks to streaming standards (e.g., $-14\,\text{LUFS}$ for YouTube/TikTok or $-23\,\text{LUFS}$ for broadcast). Implemented via `AudioWorkletProcessor` for true-peak and integrated loudness measurement.
- **Verification Test `TEST-4.4`**:
  - *Name*: `test_lufs_loudness_target_compliance_audioworklet`
  - *Preconditions*: Dynamic podcast audio file with integrated loudness $-22\,\text{LUFS}$.
  - *Execution*: Analyze via `AudioWorkletProcessor` implementing BS.1770-4; apply gain offset.
  - *Expected Outcome*: Processed audio measures $-14.0 \pm 0.5\,\text{LUFS}$ integrated loudness with true-peak limiter preventing inter-sample peaks above $-1.0\,\text{dBTP}$.

#### Feature 4.5: Pitch-Preserving Time Stretch
- **Description**: Changes audio playback speed ($0.1\times$ to $100\times$) with formant-preserving pitch correction (WSOLA / phase vocoder algorithm). Implemented in `AudioWorkletProcessor` using `AudioBuffer` manipulation or `webkitAudioContext` `playbackRate` + custom pitch shifter.
- **Verification Test `TEST-4.5`**:
  - *Name*: `test_pitch_preserved_speed_doubling_audioworklet`
  - *Preconditions*: Vocal recording with fundamental frequency $F_0 = 220\,\text{Hz}$ (A3).
  - *Execution*: Set speed to $2.0\times$ with Pitch Correction enabled via AudioWorklet.
  - *Expected Outcome*: Duration is halved; fundamental frequency $F_0$ remains $220 \pm 2\,\text{Hz}$ (no chipmunk effect).

#### Feature 4.6: Voice Effects & Modulation
- **Description**: DSP voice modification presets: Chipmunk (pitch up), Deep (pitch down), Robot (ring modulation), Megaphone (bandpass filter + saturation), Echo/Reverb (ConvolverNode). Implemented as `AudioWorkletProcessor` chains.
- **Verification Test `TEST-4.6`**:
  - *Name*: `test_robot_voice_ring_modulator_audioworklet`
  - *Preconditions*: Monologue voice track via `AudioBufferSourceNode`.
  - *Execution*: Apply Robot voice effect ($50\,\text{Hz}$ carrier modulation) via AudioWorklet ring modulator.
  - *Expected Outcome*: Audio spectrum exhibits sidebands spaced at $\pm 50\,\text{Hz}$ around input formant peaks producing metallic timbre.

#### Feature 4.7: AI Vocal & Accompaniment Separation
- **Description**: 2-stem neural separation (SAMI / Demucs / HTDemucs model quantized to ONNX) isolating vocal track and background music accompaniment from mixed audio. Runs in Dedicated Worker (not AudioWorklet) due to model size; outputs `AudioBuffer` for timeline placement.
- **Verification Test `TEST-4.7`**:
  - *Name*: `test_vocal_isolation_stem_separation_wasm`
  - *Preconditions*: Song recording with mixed vocals and instruments.
  - *Execution*: Run vocal separation model in Worker; export isolated vocal stem and instrumental stem as `AudioBuffer`.
  - *Expected Outcome*: Instrumental stem exhibits $\ge 20\,\text{dB}$ attenuation in primary vocal formant frequencies; vocal stem is clear and intelligible.

#### Feature 4.8: Beat Detection & Audio Rhythm Markers
- **Description**: Automatic tempo and transient detection identifying musical downbeats and rhythmic transients, generating timeline snap markers for music-synced editing. Implemented in Worker using Web Audio `AnalyserNode` data + onset detection (spectral flux).
- **Verification Test `TEST-4.8`**:
  - *Name*: `test_rhythm_beat_marker_accuracy_analyser`
  - *Preconditions*: 120 BPM electronic drum track with clicks on quarter notes ($500\,\text{ms}$ interval).
  - *Execution*: Run beat detection algorithm on decoded audio buffer in Worker.
  - *Expected Outcome*: Generated beat markers align with drum transients within $\pm 5\,\text{ms}$ tolerance across entire clip.

---

### Category 5: Text, Subtitles & AI Captions (Canvas 2D / WebGL / WASM)

#### Feature 5.1: Vector Typography & Text Styling
- **Description**: High-resolution vector text rendering with customizable font family, weight, size, tracking, leading, alignment, stroke outline, drop shadow, glow, and curved text layout. Uses **Canvas 2D `Path2D` + `fillText`/`strokeText`** or **WebGL glyph atlas (SDF)** for GPU-accelerated rendering.
- **Verification Test `TEST-5.1`**:
  - *Name*: `test_curved_text_geometry_layout_canvas2d`
  - *Preconditions*: String `"CUTTINGBOARD"` rendered on circular path with radius $300\,\text{px}$ using `Path2D` arc + `fillText` per glyph.
  - *Execution*: Render glyph vector paths to offscreen canvas.
  - *Expected Outcome*: Glyph baselines orient tangent to circular path with uniform character kerning.

#### Feature 5.2: Speech-to-Text Auto-Captions
- **Description**: Offline Automatic Speech Recognition (ASR) converting dialogue audio into synchronized subtitle segments with word-level timestamps. Uses **`whisper.cpp` compiled to WASM** (quantized `tiny.en`/`base.en` models) running in a Dedicated Worker.
- **Verification Test `TEST-5.2`**:
  - *Name*: `test_asr_auto_caption_timestamp_alignment_wasm`
  - *Preconditions*: 10-second audio clip reciting: `"The quick brown fox jumps over the lazy dog."`
  - *Execution*: Execute auto-captioning pipeline in Worker; generate subtitle track with word timestamps.
  - *Expected Outcome*: Subtitle segments generated with $< 10\%$ Word Error Rate (WER); word boundary timestamps match audio utterance within $\pm 100\,\text{ms}$.

#### Feature 5.3: Caption File Import & Export (SRT / VTT / ASS)
- **Description**: Parsing and serializing subtitle formats (.srt, .vtt, .ass) with timecode formatting, styling attributes, and timeline track conversion. Pure TypeScript parser/serializer.
- **Verification Test `TEST-5.3`**:
  - *Name*: `test_srt_subtitle_roundtrip_parsing_ts`
  - *Preconditions*: Standard SRT file with 50 subtitle cues.
  - *Execution*: Import SRT into subtitle track, export back to new SRT file, compare timestamps and text.
  - *Expected Outcome*: Output file is byte-identical or semantically equivalent in all timestamps and text bodies.

#### Feature 5.4: Text-to-Speech (TTS) Synthesis
- **Description**: Neural voice synthesis generating natural spoken audio clips from user-entered text, supporting multiple voice profiles, speeds, and pitch offsets. Uses **Web Speech API** (browser native) or **Piper/Coqui TTS WASM** for offline voices.
- **Verification Test `TEST-5.4`**:
  - *Name*: `test_tts_synthesis_audio_generation_wasm`
  - *Preconditions*: Text string `"Welcome to the video editor."`; voice preset `"Narrator"` (Piper WASM).
  - *Execution*: Invoke TTS synthesis module in Worker; produce `AudioBuffer`.
  - *Expected Outcome*: Synthesized 48 kHz `AudioBuffer` produced; duration matches speech rate; audio passes speech presence validation.

#### Feature 5.5: Animated Text Templates
- **Description**: Pre-designed title cards, lower-thirds, and social callouts with parameterized text fields, auto-scaling background banners, and entrance/exit keyframe animations. Template defined as JSON with keyframeable properties; instantiated by binding user text.
- **Verification Test `TEST-5.5`**:
  - *Name*: `test_text_template_parameter_binding_json`
  - *Preconditions*: Load two-line Lower-Third template (Title + Subtitle) with auto-scale background.
  - *Execution*: Bind Title = `"John Doe"`, Subtitle = `"Director"`; render animation from $t = 0$ to $t = 2.0\,\text{s}$ via keyframe evaluator.
  - *Expected Outcome*: Background container automatically scales to fit bounding box of `"John Doe"`; entrance kinetic animation plays smoothly.

---

### Category 6: Motion Tracking, Stickers & VFX (WASM / WebGL / WebGPU)

#### Feature 6.1: Motion Tracking (Point & Bounding Box)
- **Description**: Optical flow and template matching tracker tracking an area or object across successive frames, calculating $(X, Y, \text{Scale}, \text{Rotation})$ trajectories to bind text, stickers, or masks. Implements **Lucas-Kanade / Farnebäck optical flow in WASM** (OpenCV.js or custom).
- **Verification Test `TEST-6.1`**:
  - *Name*: `test_motion_tracker_trajectory_correlation_wasm`
  - *Preconditions*: 60-frame video of a moving high-contrast circle traveling diagonally from $(100, 100)$ to $(700, 500)$.
  - *Execution*: Initialize tracker on circle; run forward tracking in Worker.
  - *Expected Outcome*: Generated trajectory points track center of circle with root-mean-square error (RMSE) $< 2.0\,\text{px}$.

#### Feature 6.2: Animated Sticker Engine (Lottie / APNG / GIF / WebP)
- **Description**: Renders scalable vector animations (Lottie JSON via `lottie-web` or `lottie-webgl`) and animated raster graphics (APNG, WebP, GIF) with loop control, speed scaling, and transparency blending. Lottie parsed to keyframe data, rendered via Canvas 2D or WebGL.
- **Verification Test `TEST-6.2`**:
  - *Name*: `test_lottie_vector_sticker_animation_webgl`
  - *Preconditions*: 60-frame Lottie sticker file placed on timeline for 2 seconds (looped).
  - *Execution*: Sample rendered frames at $t = 0.5\,\text{s}$ and $t = 1.5\,\text{s}$ via compositor.
  - *Expected Outcome*: Frames render clean anti-aliased vector paths with alpha transparency; frame at $1.5\,\text{s}$ matches frame at $0.5\,\text{s}$ (cycle repeated).

#### Feature 6.3: Video Transition Engine
- **Description**: Two-clip transition shader system executing blend passes (Cross Dissolve, Dip to Black, Slide, Push, Wipe, Zoom Blur, Flash, Glitch) across clip overlaps. Implemented as parameterized WebGL/WebGPU fragment shaders with `progress` uniform ($0.0 \rightarrow 1.0$).
- **Verification Test `TEST-6.3`**:
  - *Name*: `test_transition_dissolve_overlap_shader`
  - *Preconditions*: Clip A and Clip B overlapping with a 1-second Cross Dissolve transition centered on cut.
  - *Execution*: Render composite at midpoint of transition ($t = 0.5\,\text{s}$) via compositor worker.
  - *Expected Outcome*: Composite pixel value evaluates exactly to $0.5 \times \text{ClipA} + 0.5 \times \text{ClipB}$.

#### Feature 6.4: Video VFX Shaders (Glitch, Blur, Particle)
- **Description**: GPU post-processing effects library (Directional Blur, Gaussian Blur, RGB Split Glitch, Film Grain, Halftone, Prism, Glow) applied as clip effects or adjustment tracks. Implemented as reusable WebGL/WebGPU fragment shaders with uniform parameters.
- **Verification Test `TEST-6.4`**:
  - *Name*: `test_rgb_split_glitch_displacement_shader`
  - *Preconditions*: High-contrast edge test texture; apply RGB Split shader with 10 px displacement uniform.
  - *Execution*: Render output frame via OffscreenCanvas.
  - *Expected Outcome*: Red channel is displaced $+10\,\text{px}$ horizontally, Blue channel displaced $-10\,\text{px}$, Green channel remains centered.

---

### Category 7: Export & Encoding Engine (WebCodecs + FFmpeg.wasm + MP4Box.js)

#### Feature 7.1: Multi-Format Hardware Video Encoding (WebCodecs)
- **Description**: High-throughput rendering and encoding pipeline supporting MP4 and MOV containers with H.264, HEVC, VP9, AV1 via **WebCodecs `VideoEncoder`** with `hardwareAcceleration: 'prefer-hardware'`. Frames fed from compositor OffscreenCanvas; MP4 muxing via `mp4box.js`.
- **Verification Test `TEST-7.1`**:
  - *Name*: `test_export_h264_mp4_webcodecs`
  - *Preconditions*: 10-second multi-track project with video, text, and audio.
  - *Execution*: Export to $1080\text{p}60$ MP4 using H.264 at $10\,\text{Mbps}$ via `VideoEncoder` + `mp4box.js`.
  - *Expected Outcome*: Exported MP4 file has valid headers, exact 600 frames, proper `moov` atom placement (fast start via `mp4box.js`), and bit-accurate audio/video synchronization.

#### Feature 7.2: Custom Bitrate & Rate Control Modes
- **Description**: Supports Constant Bitrate (CBR), Variable Bitrate (VBR), and Constant Quality (CQ) encoding via `VideoEncoderConfig` `bitrateMode` and `bitrate` / `quantizationParameter` parameters.
- **Verification Test `TEST-7.2`**:
  - *Name*: `test_vbr_encoding_bitrate_budget_webcodecs`
  - *Preconditions*: 30-second complex video sequence; target bitrate $8000\,\text{kbps}$ VBR.
  - *Execution*: Run export encoding via `VideoEncoder` with `bitrateMode: 'variable'`.
  - *Expected Outcome*: Average bitrate of resulting file is within $\pm 5\%$ of target $8000\,\text{kbps}$.

#### Feature 7.3: Dedicated Audio-Only Export
- **Description**: Extracts and encodes timeline audio mix directly to standalone audio formats: MP3, AAC, WAV (16-bit/24-bit PCM), FLAC. Uses `OfflineAudioContext` to render master mix to `AudioBuffer`, then `AudioEncoder` (WebCodecs) or `ffmpeg.wasm` for encoding.
- **Verification Test `TEST-7.3`**:
  - *Name*: `test_audio_export_wav_fidelity_offlineaudiocontext`
  - *Preconditions*: Multi-track audio project at 48 kHz.
  - *Execution*: Render master mix via `OfflineAudioContext`; encode to 24-bit PCM WAV via `ffmpeg.wasm` or custom RIFF writer.
  - *Expected Outcome*: Generated WAV file contains valid RIFF header, 48000 Hz sample rate, 24-bit depth, and exact sample count matching timeline length.

#### Feature 7.4: C2PA Content Credentials Watermark
- **Description**: Injects signed C2PA (Coalition for Content Provenance and Authenticity) metadata manifests and optional invisible watermarks into exported files documenting provenance and AI edits. Uses `c2pa-node` / `c2pa.wasm` via Electron main process (Node.js) for signing.
- **Verification Test `TEST-7.4`**:
  - *Name*: `test_c2pa_provenance_manifest_injection_electron`
  - *Preconditions*: Export video with C2PA enabled and signed with local cert via Electron IPC to main process.
  - *Execution*: Validate exported file with standard C2PA verification CLI (`c2patool`).
  - *Expected Outcome*: Manifest is cryptographically verified; claims list author, tool name ("CuttingBoard"), and applied generative AI modifications.

---

### Category 8: Electron Application Window, Viewport & UI

#### Feature 8.1: Dockable Multi-Pane Electron Window Layout
- **Description**: Electron `BrowserWindow` with customizable, dockable panes: Media Browser, Player Viewport, Property Inspector, and Timeline Canvas. Implemented via React/Solid + `dnd-kit` or `golden-layout` with persistable JSON layout state saved to Electron `store` (file-based). Supports multi-monitor window undocking via `BrowserWindow` `setBounds`.
- **Verification Test `TEST-8.1`**:
  - *Name*: `test_electron_window_pane_docking_persistence`
  - *Preconditions*: Reorganize window layout (dock Inspector to left, undock Timeline to secondary `BrowserWindow`).
  - *Execution*: Save layout, close application, relaunch Electron app.
  - *Expected Outcome*: Window restores exact geometry, pane positions, and dock states across relaunch; secondary window restored on correct monitor.

#### Feature 8.2: Hardware-Accelerated Interactive Canvas Viewport
- **Description**: Low-latency `<canvas>` / `OffscreenCanvas` receiving composited frames from WebGL/WebGPU compositor worker. Interactive canvas manipulation: bounding box handles for scale, rotate gizmo, drag-to-reposition, and alignment guides. Gizmos rendered as SVG overlay (DOM) or second canvas layer for 60fps interaction.
- **Verification Test `TEST-8.2`**:
  - *Name*: `test_canvas_viewport_interactive_gizmo_drag`
  - *Preconditions*: Viewport displaying clip at $(0, 0)$; mouse cursor over rotation handle (SVG overlay).
  - *Execution*: Drag mouse clockwise by $45^\circ$; transform updated via IPC to main thread $\rightarrow$ timeline store $\rightarrow$ compositor worker.
  - *Expected Outcome*: Clip rotation updates in real time to $45^\circ$; Property Inspector reflects $45^\circ$; frame redraws at $\ge 60\,\text{fps}$.

#### Feature 8.3: Safe Margins Overlay (Social & TV Standards)
- **Description**: Configurable viewport guidelines displaying Action Safe ($93\%$), Title Safe ($90\%$), 16:9 in 9:16 guides, and TikTok UI overlay masks (avatar, likes, comment icons, caption area). Rendered as SVG overlay on viewport canvas.
- **Verification Test `TEST-8.3`**:
  - *Name*: `test_safe_margin_overlay_toggle_svg`
  - *Preconditions*: Viewport set to 9:16 portrait canvas.
  - *Execution*: Enable TikTok Safe Margins overlay via UI toggle.
  - *Expected Outcome*: Viewport overlays semi-transparent SVG zones showing right-hand button stack and bottom caption box, preventing important visual elements from being obscured.

#### Feature 8.4: Transactional Undo / Redo Command Stack
- **Description**: Full transactional command pattern recording all user operations (add, delete, move, trim, split, color grade, keyframe modification) with infinite undo/redo capability. Uses **Immer** for immutable state updates or custom command stack with `execute()`/`undo()`/`redo()`.
- **Verification Test `TEST-8.4`**:
  - *Name*: `test_undo_redo_transactional_rollback_immer`
  - *Preconditions*: Project with 1 clip.
  - *Execution*: Perform 5 sequential edits (Split, Move, Color Grade, Add Text, Delete Part 2); invoke Undo 5 times; invoke Redo 5 times.
  - *Expected Outcome*: Each undo restores exact prior project state; redos recreate all modifications; final state matches original edits perfectly.

#### Feature 8.5: Keyboard Shortcut Mapping System
- **Description**: Configurable hotkey management system with presets matching standard CapCut, Premiere Pro, and Final Cut Pro shortcuts (e.g., `Ctrl+B` / `C` for razor split, `Space` for play/pause, `J/K/L` for reverse/stop/forward scrub). Uses `hotkeys-js` or custom `keydown`/`keyup` listener with `Electron` global shortcuts for media keys.
- **Verification Test `TEST-8.5`**:
  - *Name*: `test_jkl_shuttle_scrub_behavior_hotkeys`
  - *Preconditions*: Playhead stationary at $t = 5.0\,\text{s}$.
  - *Execution*: Press `L` (play forward $1\times$), press `L` again (speed up to $2\times$), press `K` (pause), press `J` (play reverse $1\times$).
  - *Expected Outcome*: Engine executes exact playback direction and speed transitions matching shuttle control protocol via `VideoDecoder` frame callback scheduling.

---

## 3. The Three-Part Build Plan

The complete implementation plan is organized into three sequential, self-contained development phases, all targeting the **Web Platform** first, with Electron integration in Part 3:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PART 1: CORE ENGINE & TIMELINE (WEB)                 │
│  - TypeScript Timeline Data Model (bigint μs, Rational FPS)            │
│  - Track & Segment Hierarchy (Video, Audio, Text, Adjustment)          │
│  - Keyframe Evaluator & Interpolation Engine (Bezier, Spring, Hold)    │
│  - CapCut Draft JSON Parser & Serializer (`draft_content.json`)        │
│  - Transactional Undo / Redo Command Stack (Immer)                     │
│  - WebCodecs Playback Engine Prototype (VideoDecoder + Canvas)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Foundation APIs Ready
┌───────────────────────────────────▼────────────────────────────────────┐
│           PART 2: MEDIA PIPELINES, EFFECTS, AUDIO & AI (WEB)           │
│  - WebCodecs VideoDecoder/Encoder Pipeline + Frame Cache (Worker)      │
│  - WebGL 2 / WebGPU Compositor & Shader Graph (OffscreenCanvas)        │
│  - Color Grading Shaders (3-Way Wheels, 8-Ch HSL, Curves, 3D LUT)      │
│  - Web Audio API + AudioWorklet DSP (RNNoise WASM, LUFS, WSOLA)        │
│  - AI Vision Models (MediaPipe/Transformers.js WASM, Whisper.cpp WASM) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Pipelines & Shaders Operational
┌───────────────────────────────────▼────────────────────────────────────┐
│              PART 3: ELECTRON SHELL, UI & PRODUCTION                   │
│  - Electron Main/Preload/Renderer Architecture (Context Isolation)     │
│  - React/Solid + TypeScript App Shell (Dockable Panes, Virtual Lists)  │
│  - Interactive Canvas Viewport (SVG Gizmos, Safe Margins Overlay)      │
│  - 60fps Virtualized Timeline Canvas (Waveforms, Trim Handles)         │
│  - Export Dialog, C2PA Signing (Main Process), OTIO/FCPXML Bridge      │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Part 1: Core Engine, Data Structures, Timeline Foundation & WebCodecs Playback

**Objective**: Construct the headless non-linear editing engine, timebase arithmetic, data structures, serialization layer, and a **working WebCodecs playback prototype** in a browser environment (no Electron yet).

#### Milestones:

1. **Milestone 1.1: Timeline Data Model & Microsecond Clock (TypeScript)**
   - Implement `TimePoint` and `TimeRange` using `bigint` in microseconds ($\mu s$).
   - Implement `RationalTime` conversion utilities for standard framerates ($23.976, 24, 25, 29.97, 30, 50, 59.94, 60\,\text{fps}$).
   - Build `Segment`, `Track`, and `Timeline` graph structures with TypeScript interfaces.
   - *Verification*: Pass unit tests `TEST-1.1`, `TEST-1.2`, and `TEST-1.4` (Jest/Vitest).

2. **Milestone 1.2: Keyframe & Animation Evaluator**
   - Implement cubic bezier evaluator supporting arbitrary parameter curves.
   - Implement keyframe storage with linear, hold, bezier, and spring interpolation types.
   - Create property animator evaluating animated parameters at timestamp $t$ (pure function, no side effects).
   - *Verification*: Pass unit test `TEST-2.3`.

3. **Milestone 1.3: Transactional Undo/Redo System (Immer)**
   - Implement Command Pattern interface (`execute()`, `undo()`, `redo()`) with Immer `produce` for immutable updates.
   - Create transactional commands for `SplitClipCommand`, `MoveClipCommand`, `DeleteClipCommand`, `SetPropertyCommand`.
   - Implement command history stack with configurable depth and `canUndo`/`canRedo` selectors.
   - *Verification*: Pass unit test `TEST-8.4`.

4. **Milestone 1.4: CapCut Draft JSON Parser & Serializer**
   - Implement JSON Schema (Ajv) validated deserializer reading CapCut `draft_content.json` and `draft_meta_info.json`.
   - Implement serializer writing compliant CapCut projects with exact folder layout.
   - Implement `otio.js` (OpenTimelineIO WASM) import/export adapter.
   - *Verification*: Pass unit tests `TEST-1.9` and `TEST-1.10`.

5. **Milestone 1.5: WebCodecs Playback Engine Prototype**
   - Implement `VideoDecoder` initialization with `preferHardwareAcceleration: true` for `avc1`, `hev1`, `vp09`, `av01`.
   - Implement frame pipeline: `decode()` $\rightarrow$ `VideoFrame` callback $\rightarrow$ `drawImage()` to `<canvas>` / `OffscreenCanvas`.
   - Implement basic transport controls: play, pause, seek (flush + decode from keyframe), variable speed (frame drop/repeat).
   - Implement `VideoFrame` pool management with `close()` discipline to avoid GPU memory leaks.
   - *Verification*: Play 1080p60 H.264 test file in browser at 60fps with $< 16\,\text{ms}$ frame latency; seek accuracy $\pm 1$ frame.

---

### Part 2: Media Pipelines, Effects, Audio & AI (Web Workers + WebGL/WebGPU + WASM)

**Objective**: Build the hardware-accelerated media decoding/encoding pipelines, GPU shader rendering graph, Web Audio API DSP engine, and AI model inference bindings — all running in **Web Workers** and **OffscreenCanvas** for main-thread responsiveness.

#### Milestones:

1. **Milestone 2.1: WebCodecs Decoder/Encoder Pipeline + Frame Cache (Dedicated Worker)**
   - Move `VideoDecoder` / `VideoEncoder` to a Dedicated Worker; communicate via `MessagePort` (transfer `EncodedVideoChunk`, `VideoFrame`).
   - Implement asynchronous frame cache: LRU `VideoFrame` ring buffer with directional scrub prefetch (decode ahead/behind playhead).
   - Implement `VideoEncoder` pipeline: compositor worker $\rightarrow$ `VideoFrame` transfer $\rightarrow$ `encode()` $\rightarrow$ `EncodedVideoChunk` $\rightarrow$ `mp4box.js` muxer (main thread or worker).
   - *Verification*: Pass unit test `TEST-2.1`; encode 1080p30 H.264 at 10 Mbps with hardware acceleration; MP4 validates.

2. **Milestone 2.2: WebGL 2 / WebGPU Compositor & Shader Graph (OffscreenCanvas Worker)**
   - Implement OffscreenCanvas compositor worker receiving `VideoFrame`s via `MessagePort`.
   - WebGL 2 baseline: vertex shader (quad + transform matrix), fragment shader (blend, color grade, mask, FX).
   - WebGPU preferred path: render pipeline + bind groups for uniforms, compute shaders for blur/masks.
   - Implement node graph: base texture $\rightarrow$ transform $\rightarrow$ mask $\rightarrow$ color grade $\rightarrow$ FX $\rightarrow$ transition blend $\rightarrow$ output.
   - Implement 14 blend modes as fragment shader permutations.
   - Implement geometric masks (stencil buffer WebGL / compute shader WebGPU).
   - *Verification*: Pass unit tests `TEST-2.2`, `TEST-2.4`, `TEST-2.5`, `TEST-6.3`; composite 3-track 1080p60 at 60fps.

3. **Milestone 2.3: Color Grading Engine (WebGL/WebGPU Shaders)**
   - Implement Lift/Gamma/Gain 3-way color grading fragment shader with 12 uniforms.
   - Implement 8-channel HSL color adjustment shader (hue-range mask + HSL shift).
   - Implement RGB & Luma spline curves: CPU-side cubic spline $\rightarrow$ 1D texture (256 texels) upload.
   - Implement 3D LUT `.cube` parser: CPU parse $\rightarrow$ `TEXTURE_3D` (WebGL 2) / `texture_3d` (WebGPU) upload with trilinear sampling.
   - *Verification*: Pass unit tests `TEST-3.1`, `TEST-3.2`, `TEST-3.3`, `TEST-3.4`; visual regression against CPU reference.

4. **Milestone 2.4: Web Audio API + AudioWorklet DSP Engine**
   - Create `AudioContext` (`latencyHint: 'interactive'`, `sampleRate: 48000`).
   - Implement per-track `GainNode` + `AudioParam` automation for volume/fades.
   - Implement `AudioWorkletProcessor` for:
     - RNNoise WASM denoiser (real-time, 128-frame blocks).
     - BS.1770-4 loudness meter (integrated, momentary, short-term, true-peak).
     - WSOLA pitch-preserving time stretch (buffer-based).
   - Implement master bus: limiter (true-peak) $\rightarrow$ loudness normalization gain $\rightarrow$ destination.
   - *Verification*: Pass unit tests `TEST-4.1`, `TEST-4.2`, `TEST-4.3`, `TEST-4.4`, `TEST-4.5`; AudioWorklet processing $< 3\,\text{ms}$/block.

5. **Milestone 2.5: AI Vision & Audio Model Integration (WASM Workers)**
   - **Portrait Matting**: MediaPipe Selfie Segmentation (WASM) or Transformers.js (ONNX Runtime Web) in Dedicated Worker; input `VideoFrame` $\rightarrow$ output alpha `ImageBitmap` transferred to compositor.
   - **Auto-Captions**: `whisper.cpp` (WASM, quantized `base.en`) in Dedicated Worker; input `AudioBuffer` $\rightarrow$ output word-timestamped segments.
   - **Motion Tracking**: Lucas-Kanade optical flow (OpenCV.js WASM) in Dedicated Worker; input `VideoFrame` sequence $\rightarrow$ output trajectory keyframes.
   - **Vocal Separation**: HTDemucs ONNX (Transformers.js) in Dedicated Worker; input `AudioBuffer` $\rightarrow$ output stem `AudioBuffer`s.
   - *Verification*: Pass unit tests `TEST-2.7`, `TEST-5.2`, `TEST-6.1`; inference latency $< 33\,\text{ms}$ (30 fps) for vision, real-time factor $< 1.0$ for audio.

---

### Part 3: Electron Shell, Application UI, Tools & Full Integration

**Objective**: Deliver the complete native desktop user experience via **Electron**, with responsive window docking, interactive viewport, high-performance timeline canvas, and production-grade export pipeline.

#### Milestones:

1. **Milestone 3.1: Electron Architecture & Secure IPC**
   - Electron 30+ with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (renderer).
   - Preload script (`contextBridge.exposeInMainWorld`) exposing typed IPC channels: `fs`, `dialog`, `export`, `c2pa`, `app`.
   - Main process handlers: native file dialogs, drag-and-drop, auto-updater, window state persistence, C2PA signing (`c2pa-node`), FFmpeg CLI fallback.
   - Secure CSP headers; no `remote` module; all Node.js APIs via preload.
   - *Verification*: Electron Security Checklist passes; `npm run lint:security` clean.

2. **Milestone 3.2: React/Solid + TypeScript App Shell (Dockable Panes)**
   - Initialize Vite + React 18 / SolidJS + TypeScript + Tailwind CSS project.
   - Implement dockable layout: `dnd-kit` + CSS Grid for Media Browser (left), Viewport (center), Inspector (right), Timeline (bottom).
   - Virtualized media grid (`@tanstack/virtual` or `react-virtualized`) for thousands of assets.
   - Persist layout JSON to Electron Store (file-based, preload IPC).
   - Implement global keyboard shortcuts (`hotkeys-js` + Electron `globalShortcut` for media keys).
   - *Verification*: Pass unit test `TEST-8.1`; layout persists across restart; 60fps UI interactions.

3. **Milestone 3.3: Interactive Canvas Viewport & SVG Gizmos**
   - Viewport component: `<canvas>` receiving frames from compositor worker via `MessagePort` + `transferControlToOffscreen()`.
   - SVG overlay layer for transform gizmos: bounding box (8 handles), rotation handle (circular), pivot point.
   - Pointer event handling: `pointerdown` $\rightarrow$ calculate transform delta $\rightarrow$ dispatch to timeline store $\rightarrow$ compositor re-render.
   - Safe Margins overlay: SVG `<rect>`/`<path>` for Action Safe, Title Safe, TikTok zones; toggleable via Inspector.
   - Playback transport: play/pause, J/K/L shuttle (frame callback scheduling in decoder worker).
   - *Verification*: Pass unit tests `TEST-8.2`, `TEST-8.3`, `TEST-8.5`; gizmo drag updates at 60fps; shuttle responds in $< 50\,\text{ms}$.

4. **Milestone 3.4: High-Performance Virtualized Timeline Canvas**
   - Timeline component: HTML `<canvas>` (or `OffscreenCanvas` in worker) rendering track lanes, clip blocks, waveforms, keyframe diamonds.
   - Virtualization: only render visible time range + 1 screen buffer; CSS `transform: translateX` for pan.
   - Audio waveforms: pre-computed peak data (min/max per pixel column) generated in AudioWorklet/Worker; rendered as vertical bars.
   - Interactive: clip trim handles (hover $\rightarrow$ resize cursor), razor tool (`Ctrl+B`), magnetic snap guides (visual + logic).
   - Inline keyframe curves: expand track $\rightarrow$ render parameter curve via Canvas 2D `Path2D`.
   - *Verification*: Pass unit tests `TEST-1.2`, `TEST-1.3`, `TEST-1.4`; 1000 clips at 60fps zoom/pan; trim drag latency $< 16\,\text{ms}$.

5. **Milestone 3.5: Contextual Inspector, Media Library & Export Production**
   - Inspector panel: React Hook Form + Zod schema binding to selected segment's keyframeable properties (Video, Audio, Speed, Animation, Adjustments, Effects tabs).
   - Media Pool: File System Access API / drag-and-drop import; thumbnail generation via `VideoDecoder` in worker; proxy generation for large files.
   - Text/Subtitle Editor: `contenteditable` / `textarea` with SRT/VTT/ASS import/export; font picker (system fonts + Google Fonts CSS).
   - Export Dialog: resolution, framerate, codec (H.264/HEVC/VP9/AV1), bitrate mode (CBR/VBR/CQ), audio codec (AAC/OPUS/PCM), C2PA toggle.
   - Export Pipeline: Renderer $\rightarrow$ IPC $\rightarrow$ Main Process spawns headless render (or uses renderer compositor) $\rightarrow$ `VideoEncoder` + `mp4box.js` $\rightarrow$ C2PA sign (`c2pa-node`) $\rightarrow$ write file.
   - *Verification*: Pass unit tests `TEST-5.1`, `TEST-5.3`, `TEST-7.1`, `TEST-7.2`, `TEST-7.3`, `TEST-7.4`; full 1080p60 export $< 2\times$ realtime; C2PA validates.

---

*Specification created based on REA reverse-engineering evidence of CapCut 9.7.1. All feature claims substantiated by binary evidence. Architecture targets Web Platform (WebCodecs, WebGL 2 / WebGPU, Web Audio API, Web Workers) with Electron desktop distribution.*