import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { 
  Minimize2, Maximize2, 
  Smartphone, Tablet, Monitor, 
  Shield, AlertTriangle, CheckCircle 
} from 'lucide-react';

interface SafeAreaConfig {
  actionSafe: boolean;
  titleSafe: boolean;
  tiktokSafe: boolean;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '21:9';
}

export function SafeAreaProvider({ children }: { children: React.ReactNode }) {
  const { safeArea, setSafeArea, canvasAspectRatio, setCanvasAspectRatio } = useStore();
  const [isOpen, setIsOpen] = useState(false);

  const safeAreaConfig: SafeAreaConfig = {
    actionSafe: safeArea.actionSafe,
    titleSafe: safeArea.titleSafe,
    tiktokSafe: safeArea.tiktokSafe,
    aspectRatio: safeArea.aspectRatio,
  };

  const presets = [
    { label: '16:9', value: '16:9' as const, icon: <Monitor className="w-4 h-4" /> },
    { label: '9:16', value: '9:16' as const, icon: <Smartphone className="w-4 h-4" /> },
    { label: '1:1', value: '1:1' as const, icon: <Tablet className="w-4 h-4" /> },
    { label: '4:3', value: '4:3' as const, icon: <Monitor className="w-4 h-4" /> },
    { label: '21:9', value: '21:9' as const, icon: <Maximize2 className="w-4 h-4" /> },
  ];

  const safeZones = [
    { id: 'actionSafe', label: 'Action Safe (93%)', default: true },
    { id: 'titleSafe', label: 'Title Safe (90%)', default: true },
    { id: 'tiktokSafe', label: 'TikTok Safe Zones', default: false },
  ];

  const toggleSafeZone = (id: string) => {
    if (id === 'actionSafe') setSafeArea({ actionSafe: !safeArea.actionSafe });
    else if (id === 'titleSafe') setSafeArea({ titleSafe: !safeArea.titleSafe });
    else if (id === 'tiktokSafe') setSafeArea({ tiktokSafe: !safeArea.tiktokSafe });
  };

  const setAspectRatio = (ratio: SafeAreaConfig['aspectRatio']) => {
    setSafeArea({ aspectRatio: ratio });
    setCanvasAspectRatio(ratio);
  };

  return (
    <div className="relative">
      {/* Safe Area Overlay Button */}
      <button
        className="fixed bottom-4 right-4 z-50 p-2 rounded-lg bg-background/90 backdrop-blur-sm border border-border shadow-lg hover:bg-accent transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Safe Area Settings"
        title="Safe Area Settings"
      >
        <Shield className="w-5 h-5" />
      </button>

      {/* Safe Area Panel */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-72 bg-card border border-border rounded-xl shadow-xl p-4 animate-slide-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Safe Area Settings</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded hover:bg-accent transition-colors"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Aspect Ratio Presets */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  className={`p-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                    safeArea.aspectRatio === preset.value
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                  onClick={() => setAspectRatio(preset.value)}
                >
                  {preset.icon}
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Safe Zones */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Safe Zones
            </label>
            <div className="space-y-2">
              {safeZones.map((zone) => (
                <label key={zone.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={zone.default}
                    onChange={() => toggleSafeZone(zone.id)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-foreground">{zone.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>Safe area overlay active on viewport</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SafeAreaOverlay({ 
  aspectRatio = '16:9',
  showActionSafe = true,
  showTitleSafe = true,
  showTikTokSafe = false,
}: {
  aspectRatio?: string;
  showActionSafe?: boolean;
  showTitleSafe?: boolean;
  showTikTokSafe?: boolean;
}) {
  const [width, height] = (aspectRatio.split(':').map(Number) as [number, number]);
  const aspect = width / height;

  const getSafeZoneStyle = (percent: number) => ({
    position: 'absolute' as const,
    top: `${(100 - percent) / 2}%`,
    left: `${(100 - percent) / 2}%`,
    width: `${percent}%`,
    height: `${percent}%`,
    border: '1.5px dashed',
    borderRadius: '4px',
    pointerEvents: 'none' as const,
  });

  return (
    <div className="relative w-full h-full overflow-hidden pointer-events-none">
      {showActionSafe && (
        <div style={getSafeZoneStyle(93)} className="border-primary/50" title="Action Safe (93%)" />
      )}
      {showTitleSafe && (
        <div style={getSafeZoneStyle(90)} className="border-secondary/50" title="Title Safe (90%)" />
      )}
      {showTikTokSafe && (
        <>
          {/* TikTok right side UI area */}
          <div 
            className="absolute top-0 right-0 h-full w-1/4 bg-black/20 pointer-events-none" 
            title="TikTok Right UI Zone"
          />
          {/* TikTok bottom caption area */}
          <div 
            className="absolute bottom-0 left-0 right-0 h-1/4 bg-black/20 pointer-events-none" 
            title="TikTok Caption Zone"
          />
        </>
      )}
    </div>
  );
}