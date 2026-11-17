import { useEffect } from 'react';
import { useStore } from '../store';
import type { Microseconds } from '../core/timeline/types';
import { pauseAll, releaseUnused } from './mediaPool';

const FRAME_US = 33_333n;

/** Serialise the project (bigint-safe) and trigger a download. */
export function saveProject() {
  const s = useStore.getState();
  const data = {
    version: 1,
    savedAt: new Date().toISOString(),
    aspect: s.canvasAspectRatio,
    media: s.mediaItems.map((m) => ({ ...m, url: undefined })),
    tracks: s.tracks.map((t) => ({ ...t, segments: undefined })),
    segments: Array.from(s.segments.values()),
  };
  const json = JSON.stringify(
    data,
    (k, v) => (typeof v === 'bigint' ? v.toString() : k === 'url' ? undefined : v),
    2,
  );
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cuttingboard-project.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Single playback clock + global keyboard shortcuts + theme + media GC. */
export function useEditorEffects() {
  // ---- playback clock
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let wasPlaying = false;
    const loop = (now: number) => {
      const st = useStore.getState();
      if (st.isPlaying && !st.isExporting) {
        const dur = st.getDuration();
        if (dur === 0n) {
          st.setIsPlaying(false);
        } else {
          if (!wasPlaying) last = now;
          const dtUs = BigInt(Math.round((now - last) * 1000 * st.playbackSpeed));
          let next = st.playhead + dtUs;
          if (next >= dur) {
            next = dur;
            st.setIsPlaying(false);
          }
          st.setPlayhead(next as Microseconds);
        }
      } else if (wasPlaying) {
        pauseAll();
      }
      wasPlaying = st.isPlaying && !st.isExporting;
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- restart from start when pressing play at the end
  useEffect(() => {
    return useStore.subscribe((s, prev) => {
      if (s.isPlaying && !prev.isPlaying) {
        const dur = s.getDuration();
        if (dur > 0n && s.playhead >= dur) s.setPlayhead(0n as Microseconds);
      }
    });
  }, []);

  // ---- release unused media elements
  useEffect(() => {
    return useStore.subscribe((s, prev) => {
      if (s.segments !== prev.segments || s.mediaItems !== prev.mediaItems) {
        const live = new Set<string>();
        s.mediaItems.forEach((m) => live.add(m.url));
        s.segments.forEach((seg) => {
          if (seg.media?.url) live.add(seg.media.url);
        });
        releaseUnused(live);
      }
    });
  }, []);

  // ---- theme
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // ---- shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) {
        // allow Escape to close dialogs even from inputs
        if (e.code !== 'Escape') return;
      }
      const st = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Escape' && st.activeDialog) {
        st.openDialog(null);
        return;
      }
      if (st.activeDialog) return;

      if (mod && e.code === 'KeyZ') {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
      } else if (mod && e.code === 'KeyY') {
        e.preventDefault();
        st.redo();
      } else if (mod && e.code === 'KeyB') {
        e.preventDefault();
        st.splitAtPlayhead();
      } else if (mod && e.code === 'KeyD') {
        e.preventDefault();
        if (st.selectedSegment) st.duplicateSegment(st.selectedSegment);
      } else if (mod && e.code === 'KeyS') {
        e.preventDefault();
        saveProject();
      } else if (mod && e.code === 'KeyE') {
        e.preventDefault();
        st.openDialog('export');
      } else if (e.code === 'F1') {
        e.preventDefault();
        st.openDialog('help');
      } else if (mod) {
        return;
      } else if (e.code === 'Space') {
        e.preventDefault();
        st.setIsPlaying(!st.isPlaying);
      } else if (e.code === 'KeyV') {
        st.setActiveTool('select');
      } else if (e.code === 'KeyC') {
        st.setActiveTool('razor');
      } else if (e.code === 'KeyS') {
        st.setSettings({ snapEnabled: !st.settings.snapEnabled });
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        st.deleteSelected();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        st.setPlayhead((st.playhead - FRAME_US) as Microseconds);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        st.setPlayhead((st.playhead + FRAME_US) as Microseconds);
      } else if (e.code === 'KeyJ') {
        st.setPlayhead((st.playhead - 1_000_000n) as Microseconds);
      } else if (e.code === 'KeyL') {
        st.setPlayhead((st.playhead + 1_000_000n) as Microseconds);
      } else if (e.code === 'KeyI') {
        st.setInPoint(st.playhead);
      } else if (e.code === 'KeyO') {
        st.setOutPoint(st.playhead);
      } else if (e.code === 'Home') {
        st.setPlayhead(0n as Microseconds);
      } else if (e.code === 'End') {
        st.setPlayhead(st.getDuration());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
