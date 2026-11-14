import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../store';
import {
  Search,
  Grid,
  List,
  Video,
  Image,
  Music,
  FileText,
  Plus,
  ChevronDown,
  ChevronUp,
  FileVideo,
  FileImage,
  FileAudio,
  Trash2,
  RefreshCw,
  Upload,
} from 'lucide-react';

interface MediaItem {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  size?: number;
  createdAt: number;
}

export function MediaBrowser({ className = '' }: { className?: string }) {
  const { mediaItems, addMedia, removeMedia } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio' | 'image'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'type' | 'duration'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const filteredItems = useMemo(() => {
    let items = [...(mediaItems as MediaItem[])];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(
        (item) => item.name.toLowerCase().includes(query) || item.type.includes(query)
      );
    }

    if (filterType !== 'all') {
      items = items.filter((item) => item.type === filterType);
    }

    items.sort((a, b) => {
      let aVal: string | number, bVal: string | number;
      switch (sortBy) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'type':
          aVal = a.type;
          bVal = b.type;
          break;
        case 'duration':
          aVal = a.duration ?? 0;
          bVal = b.duration ?? 0;
          break;
        default:
          aVal = a.createdAt;
          bVal = b.createdAt;
      }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return items;
  }, [mediaItems, searchQuery, filterType, sortBy, sortOrder]);

  // ------------------------------------------------------------ file import
  const handleFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const url = URL.createObjectURL(file);
        let type: MediaItem['type'] = 'video';
        if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';
        else if (file.type.startsWith('image/')) type = 'image';

        const newItem: MediaItem = {
          id: crypto.randomUUID(),
          name: file.name,
          type,
          url,
          size: file.size,
          createdAt: Date.now(),
        };

        // Fetch media duration where possible
        try {
          if (type === 'video' || type === 'audio') {
            const el = document.createElement(type);
            el.preload = 'metadata';
            const duration = await new Promise<number>((resolve) => {
              const done = (d: number) => {
                el.removeAttribute('src');
                resolve(d);
              };
              el.onloadedmetadata = () => done(el.duration || 0);
              el.onerror = () => done(0);
              setTimeout(() => done(0), 5000);
              el.src = url;
            });
            newItem.duration = duration;
          }
        } catch {
          /* duration is optional */
        }

        addMedia(newItem);
      }
    },
    [addMedia]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    handleFiles(files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const toggleSelection = (id: string) =>
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ------------------------------------------------------------------- view
  return (
    <div className={`h-full flex flex-col bg-card ${className}`}>
      {/* Toolbar */}
      <div className="p-2 border-b border-border space-y-2">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 text-xs bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            className="p-1.5 rounded-md bg-muted hover:bg-accent transition-colors"
            title="Import media"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 rounded-md bg-muted hover:bg-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="flex-1 px-2 py-1 text-[11px] bg-input border border-border rounded-md"
          >
            <option value="all">All types</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="image">Image</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="flex-1 px-2 py-1 text-[11px] bg-input border border-border rounded-md"
          >
            <option value="date">Date</option>
            <option value="name">Name</option>
            <option value="type">Type</option>
            <option value="duration">Duration</option>
          </select>

          <button
            className="p-1 rounded hover:bg-accent transition-colors"
            title="Toggle sort order"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              className={`p-1 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              title="Grid view"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              className={`p-1 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              title="List view"
              onClick={() => setViewMode('list')}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        className={`flex-1 overflow-y-auto transition-colors ${
          dragOver ? 'bg-primary/5 ring-2 ring-inset ring-primary' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
            <Upload className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No media yet</p>
            <p className="text-xs mt-1">Drag and drop files here, or click + to import</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs hover:bg-primary/90"
            >
              Import Media
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2 p-2">
            {filteredItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                isSelected={selectedItems.has(item.id)}
                onClick={() => toggleSelection(item.id)}
                onRemove={() => removeMedia(item.id)}
              />
            ))}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm z-10">
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">Name</th>
                <th className="px-2 py-1.5 text-left font-medium">Type</th>
                <th className="px-2 py-1.5 text-right font-medium">Duration</th>
                <th className="px-2 py-1.5 text-right font-medium">Size</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-border/40 hover:bg-accent/50 cursor-pointer transition-colors ${
                    selectedItems.has(item.id) ? 'bg-primary/10' : ''
                  }`}
                  onClick={() => toggleSelection(item.id)}
                >
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {getFileIcon(item.type)}
                      <span className="truncate">{item.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] capitalize">
                      {item.type}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {formatDuration(item.duration)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">
                    {formatFileSize(item.size)}
                  </td>
                  <td className="px-1">
                    <button
                      className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeMedia(item.id);
                      }}
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

function MediaCard({
  item,
  isSelected,
  onClick,
  onRemove,
}: {
  item: MediaItem;
  isSelected: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`relative group rounded-lg overflow-hidden border bg-card cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-primary border-transparent' : 'border-border hover:border-primary/50'
      }`}
      onClick={onClick}
    >
      <div className="aspect-video relative overflow-hidden bg-muted flex items-center justify-center">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-muted-foreground/40">{getFileIcon(item.type)}</span>
        )}
        {item.duration ? (
          <span className="absolute bottom-1 right-1 px-1 py-0.5 text-[9px] font-mono bg-black/75 text-white rounded">
            {formatDuration(item.duration)}
          </span>
        ) : null}
        <button
          className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <div className="p-1.5">
        <div className="text-[11px] font-medium truncate" title={item.name}>
          {item.name}
        </div>
        <div className="text-[9px] text-muted-foreground">{formatFileSize(item.size)}</div>
      </div>
    </div>
  );
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  switch (type) {
    case 'video':
      return <FileVideo className="w-6 h-6" />;
    case 'audio':
      return <FileAudio className="w-6 h-6" />;
    case 'image':
      return <FileImage className="w-6 h-6" />;
    default:
      return <FileText className="w-6 h-6" />;
  }
}

/* keep lucide Video/Image/Music icon imports referenced for future proxy thumbs */
export { Video as VideoIcon, Image as ImageIcon, Music as MusicIcon };
