import React from 'react';

/**
 * Cult UI Design System Primitives for CuttingBoard
 * Tactile textured surfaces, hairline specular top bevels, direction-aware segmented controls,
 * and glassmorphic floating studio panels.
 */

export interface TextureCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  interactive?: boolean;
}

export function TextureCard({
  children,
  className = '',
  interactive = false,
  ...props
}: TextureCardProps) {
  return (
    <div
      className={`relative rounded-xl border border-border/80 dark:border-white/[0.08] bg-card/80 dark:bg-zinc-900/75 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_4px_16px_-4px_rgba(0,0,0,0.35)] ${
        interactive
          ? 'transition-all duration-150 hover:border-primary/40 dark:hover:border-white/[0.16] hover:bg-accent/30 dark:hover:bg-zinc-800/80'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export interface TextureButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'active';
  size?: 'xs' | 'sm' | 'md' | 'icon';
}

export function TextureButton({
  variant = 'secondary',
  size = 'sm',
  className = '',
  children,
  ...props
}: TextureButtonProps) {
  const variantClasses: Record<NonNullable<TextureButtonProps['variant']>, string> = {
    primary:
      'bg-gradient-to-b from-blue-500 to-blue-600 text-white border border-blue-400/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35),0_2px_10px_-2px_rgba(59,130,246,0.55)] hover:from-blue-400 hover:to-blue-600 active:scale-[0.98]',
    secondary:
      'bg-muted/80 dark:bg-zinc-800/85 text-foreground border border-border/80 dark:border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)] hover:bg-accent dark:hover:bg-zinc-700/80 active:scale-[0.98]',
    active:
      'bg-primary/15 text-primary border border-primary/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] hover:bg-primary/20',
    ghost:
      'bg-transparent text-muted-foreground border border-transparent hover:text-foreground hover:bg-accent/60 dark:hover:bg-white/[0.06] active:scale-[0.98]',
    destructive:
      'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:bg-rose-600 hover:text-white active:scale-[0.98]',
  };

  const sizeClasses: Record<NonNullable<TextureButtonProps['size']>, string> = {
    xs: 'px-2 py-1 text-[11px] rounded-md gap-1',
    sm: 'px-2.5 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-3.5 py-2 text-xs rounded-lg gap-2',
    icon: 'p-1.5 rounded-lg',
  };

  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 disabled:opacity-35 disabled:pointer-events-none select-none cursor-pointer ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export interface SegmentedTabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  testId?: string;
  disabled?: boolean;
}

export interface CultSegmentedTabsProps<T extends string = string> {
  items: SegmentedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function CultSegmentedTabs<T extends string = string>({
  items,
  value,
  onChange,
  className = '',
}: CultSegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      className={`grid gap-1 p-1 rounded-xl border border-border/80 dark:border-white/[0.08] bg-muted/60 dark:bg-zinc-950/80 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] ${className}`}
      style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={item.label}
            title={item.label}
            data-testid={item.testId}
            disabled={item.disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled) onChange(item.id);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg text-[10px] font-medium transition-all duration-150 min-w-0 cursor-pointer select-none ${
              active
                ? 'bg-background dark:bg-zinc-800 text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.35)] border border-border/70 dark:border-white/[0.08]'
                : item.disabled
                  ? 'text-muted-foreground/35 cursor-not-allowed'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
            }`}
          >
            {item.icon}
            <span className="truncate w-full text-center leading-tight">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface FloatingPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function FloatingPanel({ children, className = '', ...props }: FloatingPanelProps) {
  return (
    <div
      className={`rounded-xl border border-border/80 dark:border-white/[0.1] bg-card/90 dark:bg-zinc-900/90 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_32px_-8px_rgba(0,0,0,0.65)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
