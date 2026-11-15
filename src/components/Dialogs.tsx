import React from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store';
import type { AspectRatio } from '../store';
import { pickMime } from '../editor/exporter';

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onMouseDown={onClose} data-testid="dialog-backdrop">
      <div
        role="dialog"
        aria-label={title}
        className="w-[480px] max-w-[92vw] max-h-[86vh] overflow-y-auto rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button className="p-1 rounded hover:bg-accent" onClick={onClose} aria-label="Close dialog">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-xs font-medium">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

const selectCls = 'px-2 py-1 text-xs bg-input border border-border rounded-md';

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
    >
      <span className={`absolute top-0.5 transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'} w-4 h-4 rounded-full bg-white shadow`} />
    </button>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  return (
    <Modal title="Settings" onClose={onClose}>
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Appearance</h3>
      <Field label="Theme">
        <select aria-label="Theme" className={selectCls} value={s.theme} onChange={(e) => s.setTheme(e.target.value as 'light' | 'dark' | 'system')}>
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </Field>

      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Canvas</h3>
      <Field label="Aspect ratio">
        <select aria-label="Aspect ratio" className={selectCls} value={s.canvasAspectRatio} onChange={(e) => s.setCanvasAspectRatio(e.target.value as AspectRatio)}>
          {['16:9', '9:16', '1:1', '4:3', '21:9'].map((r) => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Action safe area"><Check label="Action safe area" checked={s.safeArea.actionSafe} onChange={(v) => s.setSafeArea({ actionSafe: v })} /></Field>
      <Field label="Title safe area"><Check label="Title safe area" checked={s.safeArea.titleSafe} onChange={(v) => s.setSafeArea({ titleSafe: v })} /></Field>
      <Field label="TikTok safe zones"><Check label="TikTok safe zones" checked={s.safeArea.tiktokSafe} onChange={(v) => s.setSafeArea({ tiktokSafe: v })} /></Field>

      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Editing</h3>
      <Field label="Snap to clips & playhead"><Check label="Snap" checked={s.settings.snapEnabled} onChange={(v) => s.setSettings({ snapEnabled: v })} /></Field>
      <Field label="Select clip after adding"><Check label="Select after add" checked={s.settings.autoSelectOnAdd} onChange={(v) => s.setSettings({ autoSelectOnAdd: v })} /></Field>
      <Field label="Show frames in timecode"><Check label="Show frames" checked={s.settings.showTimecodeFrames} onChange={(v) => s.setSettings({ showTimecodeFrames: v })} /></Field>
      <Field label="Default image duration" hint="seconds">
        <input
          type="number"
          aria-label="Default image duration"
          min={0.5}
          max={60}
          step={0.5}
          className={`${selectCls} w-20`}
          value={s.settings.defaultImageDuration}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n > 0) s.setSettings({ defaultImageDuration: n });
          }}
        />
      </Field>
      <Field label="Playback speed">
        <select aria-label="Playback speed" className={selectCls} value={s.playbackSpeed} onChange={(e) => s.setPlaybackSpeed(Number(e.target.value))}>
          {[0.25, 0.5, 1, 1.5, 2, 4].map((v) => <option key={v} value={v}>{v}x</option>)}
        </select>
      </Field>

      <div className="flex justify-between pt-2 border-t border-border">
        <button className="px-3 py-1.5 text-xs rounded-md bg-muted hover:bg-accent" onClick={s.resetSettings}>Reset to defaults</button>
        <button className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

function ExportDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  let mp4 = false;
  try {
    mp4 = pickMime('mp4').ext === 'mp4';
  } catch {
    /* unsupported */
  }
  const e = s.exportSettings;
  return (
    <Modal title="Export video" onClose={s.isExporting ? () => undefined : onClose}>
      <Field label="Format" hint={mp4 ? undefined : 'MP4 not supported by this browser'}>
        <select aria-label="Format" className={selectCls} disabled={s.isExporting} value={e.format === 'mp4' && !mp4 ? 'webm' : e.format} onChange={(ev) => s.setExportSettings({ format: ev.target.value as 'mp4' | 'webm' })}>
          <option value="webm">WebM</option>
          {mp4 && <option value="mp4">MP4</option>}
        </select>
      </Field>
      <Field label="Resolution">
        <select aria-label="Resolution" className={selectCls} disabled={s.isExporting} value={e.resolution} onChange={(ev) => s.setExportSettings({ resolution: ev.target.value as typeof e.resolution })}>
          <option value="480p">480p</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
          <option value="4k">4K</option>
        </select>
      </Field>
      <Field label="Frame rate">
        <select aria-label="Frame rate" className={selectCls} disabled={s.isExporting} value={e.framerate} onChange={(ev) => s.setExportSettings({ framerate: Number(ev.target.value) })}>
          {[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
        </select>
      </Field>
      <Field label="Bitrate" hint="Mbps">
        <input type="number" aria-label="Bitrate" min={1} max={100} step={1} disabled={s.isExporting} className={`${selectCls} w-20`} value={Math.round(e.bitrate / 1_000_000)} onChange={(ev) => { const n = Number(ev.target.value); if (n > 0) s.setExportSettings({ bitrate: n * 1_000_000 }); }} />
      </Field>
      <p className="text-[11px] text-muted-foreground">
        Export renders the timeline in real time (a 10s project takes about 10s) and downloads the file when finished.
      </p>

      {s.isExporting && (
        <div>
          <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${s.exportProgress}%` }} /></div>
          <div className="text-[11px] text-muted-foreground mt-1">Rendering… {Math.round(s.exportProgress)}%</div>
        </div>
      )}
      {s.exportError && <div className="text-xs text-destructive" role="alert">{s.exportError}</div>}
      {!s.isExporting && s.exportProgress === 100 && !s.exportError && <div className="text-xs text-emerald-500">Export complete — file downloaded.</div>}

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        {s.isExporting ? (
          <button className="px-3 py-1.5 text-xs rounded-md bg-destructive text-destructive-foreground" onClick={s.cancelExport}>Cancel export</button>
        ) : (
          <>
            <button className="px-3 py-1.5 text-xs rounded-md bg-muted hover:bg-accent" onClick={onClose}>Close</button>
            <button className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground" onClick={() => void s.startExport()}>Start export</button>
          </>
        )}
      </div>
    </Modal>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play / pause'],
  ['← / →', 'Step one frame'],
  ['J / L', 'Back / forward 1 second'],
  ['Home / End', 'Go to start / end'],
  ['Ctrl+B', 'Split clip at playhead'],
  ['Delete', 'Delete selected clip'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
  ['Ctrl+S', 'Save project (JSON)'],
  ['Ctrl+E', 'Export'],
  ['Ctrl + mouse wheel', 'Zoom timeline'],
  ['I / O', 'Set in / out marker'],
  ['Drag clip edges', 'Trim'],
  ['Double-click media', 'Add to timeline'],
  ['F1', 'This help'],
];

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts & help" onClose={onClose}>
      <table className="w-full text-xs">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k} className="border-b border-border/40">
              <td className="py-1.5 pr-3"><kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">{k}</kbd></td>
              <td className="py-1.5 text-muted-foreground">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function Dialogs() {
  const active = useStore((s) => s.activeDialog);
  const openDialog = useStore((s) => s.openDialog);
  const close = () => openDialog(null);
  if (active === 'settings') return <SettingsDialog onClose={close} />;
  if (active === 'export') return <ExportDialog onClose={close} />;
  if (active === 'help') return <HelpDialog onClose={close} />;
  return null;
}
