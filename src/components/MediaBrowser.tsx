import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../store';
import { 
  Search, Filter, Grid, List, 
  Video, Image, Music, FileText, 
  Plus, MoreHorizontal, ChevronDown,
  Clock, FileVideo, FileImage, FileAudio,
  Trash2, Copy, Edit, Download,
  RefreshCw, Filter as FilterIcon
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';

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

export function MediaBrowser() {
  const { mediaItems, setMediaItems, addMedia, removeMedia, selectedMedia, setSelectedMedia } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio' | 'image'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'type' | 'duration'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const filteredItems = useMemo(() => {
    let items = [...mediaItems];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.type.includes(query)
      );
    }

    // Filter by type
    if (filterType !== 'all') {
      items = items.filter(item => item.type === filterType);
    }

    // Sort
    items.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortBy) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'date':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        case 'type':
          aVal = a.type;
          bVal = b.type;
          break;
        case 'duration':
          aVal = a.duration || 0;
          bVal = b.duration || 0;
          break;
      }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return items;
  }, [mediaItems, searchQuery, filterType, sortBy, sortOrder]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
    e.target.value = '';
  };

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      const url = URL.createObjectURL(file);
      let type: 'video' | 'audio' | 'image' = 'video';
      
      if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';
      else if (file.type.startsWith('image/')) type = 'image';
      else type = 'video';

      const newItem: MediaItem = {
        id: crypto.randomUUID(),
        name: file.name,
        type,
        url,
        size: file.size,
        createdAt: Date.now(),
      };

      // Try to get metadata
      if (type === 'video' || type === 'audio') {
        try {
          const media = document.createElement(type);
          media.src = url;
          await new Promise((resolve) => {
            media.onloadedmetadata = () => {
              mediaItems.current = mediaItems.current.map(m => 
                m.id === newItem.id ? { ...m, duration: media.duration } : m
              );
              resolve(undefined);
            };
            media.onerror = () => resolve(undefined);
          });
        } catch {}
      }

      // Add to store
      // useStore.getState().addMedia(newItem);
    }
  };

  const handleDelete = (id: string) => {
    // useStore.getState().removeMedia(id);
  };

  const handleDuplicate = (item: MediaItem) => {
    // Duplicate logic
  };

  const toggleSelection = (id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedItems(new Set(filteredItems.map(i => i.id)));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'video': return <FileVideo className="w-4 h-4" />;
      case 'audio': return <FileAudio className="w-4 h-4" />;
      case 'image': return <FileImage className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    // handleFiles(files);
  };

  // Virtualized list for grid view
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => viewMode === 'grid' ? 180 : 60,
    overscan: 5,
  });

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 p-3 border-b border-border">
        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 text-sm bg-input border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-1.5 text-sm bg-input border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="image">Image</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 text-sm bg-input border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="date">Date</option>
              <option value="name">Name</option>
              <option value="type">Type</option>
              <option value="duration">Duration</option>
            </select>

            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-1.5 rounded hover:bg-accent transition-colors"
              title="Toggle sort order"
            >
              {sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1 ml-2">
              <button className="p-2 rounded hover:bg-accent transition-colors" title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button className="p-2 rounded hover:bg-accent transition-colors" title="Import Media">
                <Plus className="w-4 h-4" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="video/*,audio/*,image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input" className="p-2 rounded hover:bg-accent transition-colors cursor-pointer" title="Import Media">
                <Upload className="w-4 h-4" />
              </label>
            </div>
          </div>
        </div>

        {/* Active Filters */}
        {(searchQuery || filterType !== 'all') && (
          <div className="flex items-center gap-2 flex-wrap text-sm">
            {searchQuery && (
              <span className="px-2 py-1 bg-primary/10 text-primary rounded-full flex items-center gap-1">
                Search: {searchQuery}
                <button onClick={() => setSearchQuery('')} className="ml-1 hover:text-primary/80">×</button>
              </span>
            )}
            {filterType !== 'all' && (
              <span className="px-2 py-1 bg-primary/10 text-primary rounded-full flex items-center gap-1">
                Type: {filterType}
                <button onClick={() => setFilterType('all')} className="ml-1 hover:text-primary/80">×</button>
              </span>
            )}
            <button 
              onClick={() => { setSearchQuery(''); setFilterType('all'); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Content Area */}
        <div 
          ref={parentRef}
          className="flex-1 overflow-auto"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={dragOver ? 'bg-primary/5 border-2 border-primary' : ''}
        >
          {viewMode === 'grid' ? (
            <div 
              className="grid gap-3 p-3"
              style={{ 
                gridTemplateColumns: `repeat(auto-fill, minmax(180px, 1fr))`,
                height: '100%'
              }}
            >
              {filteredItems.map(item => (
                <MediaCard 
                  key={item.id}
                  item={item}
                  isSelected={selectedItems.has(item.id)}
                  onClick={() => toggleSelection(item.id)}
                  onDoubleClick={() => {}}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-auto h-full">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card/80 backdrop-blur-sm z-10">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Duration</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Size</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => (
                    <tr 
                      key={item.id}
                      className={`border-b border-border/50 hover:bg-accent/50 transition-colors ${
                        selectedItems.has(item.id) ? 'bg-primary/10' : ''
                      }`}
                      onClick={() => toggleSelection(item.id)}
                    >
                      <td className="px-3 py-2 flex items-center gap-2">
                        {getFileIcon(item.type)}
                        <span className="truncate max-w-[200px]">{item.name}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 text-xs rounded bg-muted text-muted-foreground capitalize">
                          {item.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {item.duration ? formatDuration(item.duration) : '--:--'}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground font-mono">
                        {formatFileSize(item.size)}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Upload className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg">No media found</p>
              <p className="text-sm">Drag and drop files here or click the import button</p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                Import Media
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,audio/*,image/*"
            onChange={handleFileSelect}
            className="hidden"
            id="file-input"
          />
        </div>
      </div>
    );
  }

  // Media Card Component
  function MediaCard({ 
    item, 
    isSelected, 
    onClick, 
    onDoubleClick 
  }: { 
    item: MediaItem; 
    isSelected: boolean; 
    onClick: () => void;
    onDoubleClick: () => void;
  }) {
    return (
      <div
        className={`relative group aspect-video rounded-lg overflow-hidden border border-border bg-card cursor-pointer transition-all duration-200 ${
          isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : ''
        }`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="aspect-video relative overflow-hidden bg-muted">
          {item.thumbnail ? (
            <img 
              src={item.thumbnail} 
              alt={item.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              {getFileIcon(item.type)}
            </div>
          )}
          
          {/* Duration badge */}
          {item.duration && (
            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 text-xs font-mono bg-black/80 text-white rounded">
              {formatDuration(item.duration)}
            </div>
          )}

          {/* Type badge */}
          <div className="absolute top-1 left-1">
            <span className="px-1.5 py-0.5 text-xs rounded bg-black/70 text-white capitalize">
              {item.type}
            </span>
          </div>
        </div>

        <div className="p-2 space-y-1">
          <h4 className="font-medium text-sm truncate">{item.name}</h4>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDuration(item.duration)}</span>
            <span>{formatFileSize(item.size)}</span>
          </div>
        </div>

        {/* Context menu would go here */}
      </div>
    );
  }

  return <MediaBrowser />;
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
    case 'video': return <Video className="w-4 h-4" />;
    case 'audio': return <Music className="w-4 h-4" />;
    case 'image': return <Image className="w-4 h-4" />;
    default: return <FileText className="w-4 h-4" />;
  }
}