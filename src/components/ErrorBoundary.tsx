import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { TextureCard, TextureButton } from './ui/cult';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('CuttingBoard UI ErrorBoundary caught error:', error, info);
  }

  handleRecover = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 p-6">
          <TextureCard className="max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Workspace Recovery</h2>
                <p className="text-xs text-muted-foreground">A panel encountered an unexpected state.</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-950/80 border border-white/[0.06] text-xs font-mono text-rose-400 break-words">
              {this.state.error.message}
            </div>
            <div className="flex justify-end gap-2">
              <TextureButton variant="secondary" onClick={() => window.location.reload()}>
                Reload App
              </TextureButton>
              <TextureButton variant="primary" onClick={this.handleRecover}>
                <RotateCcw className="w-3.5 h-3.5" /> Recover Session
              </TextureButton>
            </div>
          </TextureCard>
        </div>
      );
    }

    return this.props.children;
  }
}
