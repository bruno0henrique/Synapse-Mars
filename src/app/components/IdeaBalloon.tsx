import { useRef, useState, useEffect } from 'react';
import {
  Trash2,
  Brain,
  Search,
  ArrowRight,
  Lightbulb,
  Loader2,
  Link2,
  Star,
  MoreHorizontal,
  Pencil,
  Check,
  X,
  Plus,
  Eye,
  EyeOff,
  Sparkles
} from 'lucide-react';
import { Idea } from '../App';

interface IdeaBalloonProps {
  idea: Idea;
  balloonW?: number;
  balloonH?: number;
  categories: Array<{ name: string; color: string; bgColor: string }>;
  onUpdatePosition: (id: string, position: { x: number; y: number }) => void;
  onUpdateCategory: (id: string, category: string, color?: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onToggleCentral?: (id: string) => void;
  onUpdateSize?: (id: string, size: { width: number; height: number }) => void;
  onUpdateRect?: (id: string, rect: { x?: number; y?: number; width?: number; height?: number }) => void;
  onDelete: (id: string) => void;
  recentColors: string[];
  onSaveRecentColor?: (color: string) => void;
  isConnecting: boolean;
  connectingFromAny: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onStartConnecting: (id: string) => void;
  onFinishConnecting: (id: string) => void;
  onAiAction: (ideaId: string, action: string) => void;
  isAiProcessing: boolean;
}

const AI_ACTIONS = [
  { key: 'root-cause', label: 'Encontrar Causa Raiz', icon: Search, color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  { key: 'next-steps', label: 'Próximos Passos', icon: ArrowRight, color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },
  { key: 'expand', label: 'Expandir Ideia', icon: Lightbulb, color: '#0617a8', bg: 'rgba(6,23,168,0.10)' }
];

const PRESET_CATEGORIES = ['Problema', 'Solução', 'Recurso', 'Objetivo', 'Risco'];
const MIN_BALLOON_WIDTH = 318;
const MIN_BALLOON_HEIGHT = 148;

export function IdeaBalloon({
  idea,
  categories,
  onUpdatePosition,
  onUpdateCategory,
  onUpdateText,
  onDelete,
  recentColors,
  onSaveRecentColor,
  isConnecting,
  connectingFromAny,
  isSelected,
  onSelect,
  onStartConnecting,
  onFinishConnecting,
  onAiAction,
  isAiProcessing,
  onUpdateRect
}: IdeaBalloonProps) {
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [showCatMenu, setShowCatMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [tempText, setTempText] = useState(idea.text);
  const [isResizing, setIsResizing] = useState(false);
  const [isObscured, setIsObscured] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Custom category state
  const [showCustomCat, setShowCustomCat] = useState(false);
  const [customCatName, setCustomCatName] = useState('');
  const [customCatColor, setCustomCatColor] = useState(recentColors[0] || '#0617a8');

  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const resizeStart = useRef<{ mx: number; my: number; sw: number; sh: number; sy: number } | null>(null);
  const dragMoved = useRef(false);
  const skipNextClick = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  const isAiGenerated = Boolean(idea.aiGenerated);
  const category = categories.find(c => c.name === idea.category);
  const categoryColor = category?.color;
  const color = idea.categoryColor
    || (isAiGenerated && (!categoryColor || categoryColor === '#6b7280') ? '#a78bfa' : categoryColor)
    || '#6b7280';
  const isInteractiveTarget = (target: HTMLElement) =>
    target.closest('button') ||
    target.closest('input') ||
    target.closest('textarea') ||
    target.closest('[data-balloon-control="true"]');

  // ── Resize Logic ──
  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!resizeStart.current) return;
      const dx = clientX - resizeStart.current.mx;
      const dy = clientY - resizeStart.current.my;

      const parent = ref.current?.offsetParent as HTMLElement | null;
      let scale = 1;
      if (parent) {
        const m = new DOMMatrix(window.getComputedStyle(parent).transform);
        scale = m.a || 1;
      }
      
      if (onUpdateRect) {
        const newWidth = Math.max(MIN_BALLOON_WIDTH, resizeStart.current.sw + dx / scale);
        let newHeight = resizeStart.current.sh - (dy / scale);
        let newY = resizeStart.current.sy + (dy / scale);
        
        // Enforce minimum height and keep bottom anchored
        if (newHeight < MIN_BALLOON_HEIGHT) {
          const diff = MIN_BALLOON_HEIGHT - newHeight;
          newHeight = MIN_BALLOON_HEIGHT;
          newY -= diff;
        }

        onUpdateRect(idea.id, {
          y: newY,
          width: newWidth,
          height: newHeight
        });
      }
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (isResizing) {
        e.preventDefault();
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onUp = () => {
      if (!resizeStart.current) return;
      resizeStart.current = null;
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onUp);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isResizing, idea.id, onUpdateRect]);

  // ── Drag & Drop Logic ──
  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!dragStart.current) return;
      const dx = clientX - dragStart.current.mx;
      const dy = clientY - dragStart.current.my;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        dragMoved.current = true;
      }

      const parent = ref.current?.offsetParent as HTMLElement | null;
      let scale = 1;
      if (parent) {
        const m = new DOMMatrix(window.getComputedStyle(parent).transform);
        scale = m.a || 1;
      }
      onUpdatePosition(idea.id, {
        x: dragStart.current.px + dx / scale,
        y: dragStart.current.py + dy / scale
      });
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (isDragging) {
        e.preventDefault();
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onUp = () => {
      if (!dragStart.current) return;
      dragStart.current = null;
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onUp);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isDragging, idea.id, onUpdatePosition]);

  const handlePointerDown = (clientX: number, clientY: number, target: HTMLElement) => {
    dragMoved.current = false;
    if (isInteractiveTarget(target)) return;
    if (isEditingText || showAiMenu || showCatMenu) return;

    setIsDragging(true);
    dragStart.current = { mx: clientX, my: clientY, px: idea.position.x, py: idea.position.y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    handlePointerDown(e.clientX, e.clientY, e.target as HTMLElement);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    handlePointerDown(e.touches[0].clientX, e.touches[0].clientY, e.target as HTMLElement);
  };

  const handleBalloonClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (skipNextClick.current) {
      skipNextClick.current = false;
      return;
    }

    const target = e.target as HTMLElement;
    if (isInteractiveTarget(target)) return;
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }

    onSelect(idea.id);

    if (connectingFromAny && !isConnecting) {
      onFinishConnecting(idea.id);
    }
  };

  const handleBalloonTouchEnd = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (isInteractiveTarget(target)) return;

    if (dragMoved.current) {
      skipNextClick.current = true;
      dragMoved.current = false;
      return;
    }

    skipNextClick.current = true;
    onSelect(idea.id);

    if (connectingFromAny && !isConnecting) {
      onFinishConnecting(idea.id);
    }
  };

  const handleSaveCustomCategory = () => {
    if (!customCatName.trim()) return;
    onUpdateCategory(idea.id, customCatName.trim(), customCatColor);
    if (onSaveRecentColor) onSaveRecentColor(customCatColor);
    setShowCatMenu(false);
    setShowCustomCat(false);
    setCustomCatName('');
  };

  useEffect(() => {
    if (!isSelected && !isHovered) {
      setShowAiMenu(false);
      setShowCatMenu(false);
      setShowDeleteConfirm(false);
    }
  }, [isSelected, isHovered]);

  const isActive = isHovered || isSelected || isDragging || showAiMenu || showCatMenu || isAiProcessing;
  const isAiButtonActive = showAiMenu || isAiProcessing || isSelected;

  // Neon glow: stronger when hovered/selected/connecting, subtle at rest
  const neonGlow = isConnecting
    ? `0 0 0 2px ${color}, 0 0 30px ${color}cc, 0 0 60px ${color}66, inset 0 0 20px ${color}33`
    : isAiProcessing
      ? '0 0 0 1.5px rgba(168,85,247,0.72), 0 0 24px rgba(168,85,247,0.42), 0 18px 44px rgba(0,0,0,0.62), inset 0 0 18px rgba(168,85,247,0.12)'
    : isActive
      ? `0 0 0 1.5px ${color}aa, 0 0 22px ${color}99, 0 0 48px ${color}44, 0 20px 40px rgba(0,0,0,0.6), inset 0 0 16px ${color}22`
      : `0 0 0 1px ${color}55, 0 0 12px ${color}44, 0 0 28px ${color}22, 0 8px 24px rgba(0,0,0,0.4)`;
  const cardGlow = isAiGenerated && !isActive && !isConnecting
    ? `${neonGlow}, 0 0 22px rgba(168,85,247,0.16), inset 0 1px 0 rgba(255,255,255,0.07)`
    : neonGlow;

  return (
    <div
      ref={ref}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        if (!isSelected) {
          setShowAiMenu(false);
          setShowCatMenu(false);
        }
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleBalloonTouchEnd}
      onClick={handleBalloonClick}
      className="absolute group idea-balloon-root"
      style={{
        left: idea.position.x,
        top: idea.position.y,
        width: idea.width || 320,
        maxWidth: 600,
        minWidth: MIN_BALLOON_WIDTH,
        height: idea.height || 'auto',
        minHeight: MIN_BALLOON_HEIGHT,
        cursor: isDragging ? 'grabbing' : connectingFromAny && !isConnecting ? 'crosshair' : 'grab',
        zIndex: isDragging ? 1000 : showAiMenu || showCatMenu ? 500 : isConnecting ? 300 : isActive ? 200 : 1,
        userSelect: 'none',
        opacity: isDragging ? 0.9 : 1,
        touchAction: 'none'
      }}
    >
      {/* Visual Card (Neural Organizer Style) */}
      <div
        className="idea-balloon-card relative rounded-[28px] transition-all duration-300 flex flex-col backdrop-blur-md z-[9999]"
        style={{
          width: '100%',
          height: '100%',
          background: isAiGenerated
            ? 'radial-gradient(circle at 18% 12%, rgba(168,85,247,0.12), transparent 34%), radial-gradient(circle at 82% 0%, rgba(6,182,212,0.09), transparent 30%), rgba(12, 12, 18, 0.88)'
            : 'rgba(12, 12, 18, 0.85)',
          border: `1.5px solid ${isAiGenerated ? 'rgba(216,180,254,0.32)' : `${color}55`}`,
          boxShadow: cardGlow,
          transform: isDragging ? 'scale(1.01)' : 'scale(1)',
          transition: 'box-shadow 0.3s ease, transform 0.2s ease, border-color 0.3s ease',
        }}
      >
        {/* Category Label with Dot */}
        <div style={{ paddingTop: '20px', paddingLeft: '24px', paddingRight: '24px', paddingBottom: '2px' }} className="flex min-w-0 flex-wrap items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}cc, 0 0 16px ${color}66` }}
          />
          <span className="min-w-0 max-w-[170px] truncate text-[10px] font-bold tracking-widest uppercase" style={{ color: `${color}cc` }}>
            {idea.category}
          </span>
          {isAiGenerated && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider"
              style={{
                color: '#e9d5ff',
                background: 'rgba(168,85,247,0.14)',
                border: '1px solid rgba(216,180,254,0.18)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)'
              }}
            >
              <Sparkles size={10} />
              Sugestao IA
            </span>
          )}
          {idea.isCentral && (
            <div className="ml-auto">
              <Star size={14} fill="#f59e0b" className="text-amber-500" />
            </div>
          )}
        </div>

        {/* Content Section */}
        <div style={{ padding: '14px 24px 10px 24px' }} className="min-h-0 flex-1">
          {isEditingText ? (
            <div className="flex flex-col gap-3 relative z-50">
              <textarea
                autoFocus
                value={tempText}
                onChange={e => setTempText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onUpdateText(idea.id, tempText);
                    setIsEditingText(false);
                  }
                  if (e.key === 'Escape') {
                    setTempText(idea.text);
                    setIsEditingText(false);
                  }
                }}
                className="w-full text-white rounded-2xl border focus:outline-none text-sm font-medium resize-none"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  borderColor: `${color}44`,
                  caretColor: color,
                  boxSizing: 'border-box',
                  lineHeight: 1.55,
                  minHeight: 112,
                  padding: '14px 16px',
                  overflowWrap: 'anywhere'
                }}
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setTempText(idea.text); setIsEditingText(false); }}
                  className="p-2.5 rounded-full transition-colors text-gray-400"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <X size={16} />
                </button>
                <button
                  onClick={() => { onUpdateText(idea.id, tempText); setIsEditingText(false); }}
                  className="p-2.5 rounded-full transition-colors"
                  style={{ background: `${color}22`, color }}
                >
                  <Check size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className={`transition-all duration-300 ${isObscured ? 'blur-[6px] select-none opacity-50' : ''}`}>
              <p className="text-[15px] text-gray-100 leading-relaxed break-words whitespace-pre-wrap font-medium" style={{ overflowWrap: 'anywhere' }}>
                {idea.text}
              </p>
            </div>
          )}
        </div>

        {/* Action toolbar */}
        <div style={{ padding: '10px 22px 22px 22px' }} className="flex flex-wrap items-center justify-between gap-3 overflow-visible">
          <div className="flex min-w-0 flex-wrap gap-2.5 items-center">
            {/* Connect */}
            <button
              onClick={e => { e.stopPropagation(); if (isConnecting) onFinishConnecting(idea.id); else onStartConnecting(idea.id); }}
              className="balloon-action-button transition-all duration-200"
              style={{ background: isConnecting ? `${color}33` : 'transparent', color: isConnecting ? color : '#6b7280' }}
            >
              <Link2 size={18} />
            </button>

            {/* Edit text */}
            <button
              onClick={e => { e.stopPropagation(); setIsEditingText(v => !v); setTempText(idea.text); }}
              className="balloon-action-button text-gray-500 hover:text-gray-300 transition-colors"
            >
              <Pencil size={18} />
            </button>

            {/* Obscure content */}
            <button
              onClick={e => { e.stopPropagation(); setIsObscured(v => !v); }}
              className="balloon-action-button text-gray-500 hover:text-gray-300 transition-colors"
            >
              {isObscured ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>

            {/* AI Menu */}
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setShowAiMenu(v => !v); setShowCatMenu(false); }}
                className="balloon-action-button relative transition-all duration-200 focus-visible:ring-2 focus-visible:ring-purple-300/50"
                aria-label="Ações de IA"
                title="Ações de IA"
                style={{
                  color: isAiButtonActive ? '#f5d0fe' : '#8b8aa3',
                  background: isAiButtonActive
                    ? 'linear-gradient(135deg, rgba(168,85,247,0.24), rgba(6,182,212,0.10))'
                    : 'rgba(255,255,255,0.035)',
                  border: isAiButtonActive ? '1px solid rgba(216,180,254,0.32)' : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: isAiButtonActive
                    ? '0 0 18px rgba(168,85,247,0.20), inset 0 1px 0 rgba(255,255,255,0.08)'
                    : 'none'
                }}
              >
                {isAiProcessing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              </button>

              {showAiMenu && !isAiProcessing && (
                <div
                  className="idea-ai-menu absolute bottom-full left-0 mb-3 rounded-2xl shadow-2xl z-[100] overflow-hidden backdrop-blur-xl"
                  style={{
                    width: '236px',
                    background: 'linear-gradient(180deg, rgba(18,14,28,0.98), rgba(8,8,14,0.98))',
                    border: '1px solid rgba(216,180,254,0.14)',
                    padding: '10px',
                    boxShadow: '0 22px 70px rgba(0,0,0,0.74), 0 0 26px rgba(168,85,247,0.10)'
                  }}
                >
                  <div className="flex items-center gap-2 px-2 pb-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-purple-500/15 text-purple-200">
                      <Brain size={14} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-4 text-white">IA Synapse</p>
                      <p className="text-[10px] font-medium leading-4 text-gray-500">Expanda este balão</p>
                    </div>
                  </div>

                  {AI_ACTIONS.map(act => (
                    <button
                      key={act.key}
                      onClick={e => { e.stopPropagation(); setShowAiMenu(false); onAiAction(idea.id, act.key); }}
                      className="w-full flex items-center gap-3 rounded-xl border border-transparent text-left transition-all"
                      style={{ padding: '10px 10px' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                      }}
                    >
                      <span
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                        style={{ color: act.color, background: act.bg }}
                      >
                        <act.icon size={15} />
                      </span>
                      <span className="text-xs font-semibold text-gray-200">{act.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category Menu */}
            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setShowCatMenu(v => !v); setShowAiMenu(false); setShowCustomCat(false); }}
                className="balloon-action-button transition-colors"
                style={{ color: showCatMenu ? color : '#6b7280', background: showCatMenu ? `${color}15` : 'transparent' }}
              >
                <MoreHorizontal size={18} />
              </button>

              {showCatMenu && (
                <div
                  className="idea-category-menu absolute bottom-full left-0 mb-3 rounded-2xl shadow-2xl z-[100] backdrop-blur-xl"
                  style={{
                    width: '240px',
                    background: 'rgba(10,10,16,0.97)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    padding: '10px 0',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.8)'
                  }}
                >
                  {/* Label */}
                  <div style={{ padding: '4px 18px 10px 18px' }}>
                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-600">Categoria</span>
                  </div>

                  {/* Preset categories */}
                  {categories
                    .filter(c => PRESET_CATEGORIES.includes(c.name))
                    .map(cat => (
                      <button
                        key={cat.name}
                        onClick={e => {
                          e.stopPropagation();
                          onUpdateCategory(idea.id, cat.name, cat.color);
                          setShowCatMenu(false);
                        }}
                        className="w-full flex items-center gap-3 transition-colors"
                        style={{ padding: '10px 18px' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: cat.color, boxShadow: `0 0 6px ${cat.color}88` }}
                        />
                        <span className="text-sm font-medium text-gray-300">{cat.name}</span>
                        {idea.category === cat.name && (
                          <Check size={12} className="ml-auto" style={{ color: cat.color }} />
                        )}
                      </button>
                    ))}

                  {/* Divider */}
                  <div style={{ margin: '8px 18px', height: '1px', background: 'rgba(255,255,255,0.06)' }} />

                  {/* Custom category toggle */}
                  {!showCustomCat ? (
                    <button
                      onClick={e => { e.stopPropagation(); setShowCustomCat(true); }}
                      className="w-full flex items-center gap-3 transition-colors"
                      style={{ padding: '10px 18px' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.15)', boxShadow: 'none' }}
                      >
                        <Plus size={8} className="text-gray-400" />
                      </div>
                      <span className="text-sm font-medium text-gray-500">Nova categoria...</span>
                    </button>
                  ) : (
                    <div style={{ padding: '8px 14px 12px 14px' }} className="flex flex-col gap-3">
                      {/* Name input */}
                      <input
                        autoFocus
                        type="text"
                        placeholder="Nome da categoria"
                        value={customCatName}
                        onChange={e => setCustomCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveCustomCategory(); if (e.key === 'Escape') setShowCustomCat(false); }}
                        className="w-full text-sm text-white rounded-xl focus:outline-none"
                        style={{
                          background: 'rgba(255,255,255,0.07)',
                          border: `1px solid ${customCatColor}55`,
                          padding: '8px 12px',
                          caretColor: customCatColor
                        }}
                        onClick={e => e.stopPropagation()}
                      />

                      {/* Color picker + recent colors */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Native color picker */}
                        <label className="relative cursor-pointer flex-shrink-0" title="Escolher cor">
                          <div
                            className="w-7 h-7 rounded-full border-2 border-white/20"
                            style={{ background: customCatColor, boxShadow: `0 0 10px ${customCatColor}88` }}
                          />
                          <input
                            type="color"
                            value={customCatColor}
                            onChange={e => { e.stopPropagation(); setCustomCatColor(e.target.value); }}
                            onClick={e => e.stopPropagation()}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </label>

                        {/* Recent colors */}
                        {recentColors.slice(0, 5).map((rc, i) => (
                          <button
                            key={i}
                            onClick={e => { e.stopPropagation(); setCustomCatColor(rc); }}
                            className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0"
                            style={{
                              background: rc,
                              borderColor: customCatColor === rc ? 'white' : 'transparent',
                              boxShadow: customCatColor === rc ? `0 0 8px ${rc}` : `0 0 4px ${rc}55`
                            }}
                            title={rc}
                          />
                        ))}
                      </div>

                      {/* Save/Cancel */}
                      <div className="flex gap-2">
                        <button
                          onClick={e => { e.stopPropagation(); setShowCustomCat(false); setCustomCatName(''); }}
                          className="flex-1 py-1.5 rounded-xl text-xs font-medium text-gray-500 transition-colors"
                          style={{ background: 'rgba(255,255,255,0.05)' }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleSaveCustomCategory(); }}
                          className="flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all"
                          style={{
                            background: customCatName.trim() ? customCatColor : 'rgba(255,255,255,0.05)',
                            color: customCatName.trim() ? 'white' : '#6b7280',
                            boxShadow: customCatName.trim() ? `0 0 12px ${customCatColor}66` : 'none'
                          }}
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Delete */}
          <div className="relative">
            <button
              onClick={e => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
                setShowAiMenu(false);
                setShowCatMenu(false);
              }}
              className="balloon-action-button transition-all duration-200"
              style={{
                color: showDeleteConfirm ? '#fca5a5' : '#6b7280',
                background: showDeleteConfirm ? 'rgba(239,68,68,0.12)' : 'transparent'
              }}
              aria-label="Excluir balão"
              title="Excluir"
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = '#f87171';
                (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = showDeleteConfirm ? '#fca5a5' : '#6b7280';
                (e.currentTarget as HTMLElement).style.background = showDeleteConfirm ? 'rgba(239,68,68,0.12)' : 'transparent';
              }}
            >
              <Trash2 size={18} />
            </button>

            {showDeleteConfirm && (
              <div
                className="idea-delete-menu absolute bottom-full right-0 z-[120] mb-3 w-[238px] rounded-2xl border border-red-300/20 bg-[#120d13]/95 p-3 shadow-[0_22px_70px_rgba(0,0,0,0.72),0_0_22px_rgba(239,68,68,0.10)] backdrop-blur-xl"
                data-balloon-control="true"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/12 text-red-200">
                    <Trash2 size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-5 text-white">Excluir balão?</p>
                    <p className="mt-1 text-xs leading-5 text-gray-400">Essa ação remove o insight do mapa.</p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="min-h-9 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                    onClick={e => {
                      e.stopPropagation();
                      setShowDeleteConfirm(false);
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="min-h-9 flex-1 rounded-xl border border-red-300/20 bg-red-500/16 px-3 text-xs font-bold text-red-100 transition-colors hover:bg-red-500/24"
                    onClick={e => {
                      e.stopPropagation();
                      onDelete(idea.id);
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isAiProcessing && (
        <div className="absolute -bottom-10 left-4 z-[10001] inline-flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border border-purple-300/25 bg-[#100c18]/95 px-3 py-2 text-xs font-semibold text-purple-100 shadow-[0_12px_34px_rgba(0,0,0,0.44),0_0_20px_rgba(168,85,247,0.18)] backdrop-blur-xl pointer-events-none">
          <Loader2 size={14} className="animate-spin text-purple-200" />
          <span className="min-w-0 truncate">Analisando conexões...</span>
        </div>
      )}

      {isSelected && !isConnecting && (
        <div className="neuron-selection-outline" style={{ color }}>
          <span className="neuron-selection-dot neuron-selection-dot-top" />
          <span className="neuron-selection-dot neuron-selection-dot-right" />
          <span className="neuron-selection-dot neuron-selection-dot-bottom" />
          <span className="neuron-selection-dot neuron-selection-dot-left" />
        </div>
      )}

      {isConnecting && (
  <div className="absolute -inset-[6px] pointer-events-none z-[10000]">
    <svg className="w-full h-full overflow-visible">
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx="34" // Ajustado para o arredondamento do card + a margem de 6px
        stroke={color}
        strokeWidth="3"
        strokeDasharray="12 8"
        fill="none"
        style={{
          filter: `drop-shadow(0 0 8px ${color})`,
          animation: 'borderFlow 1s linear infinite'
        }}
      />
      <style>{`
        @keyframes borderFlow {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </svg>
  </div>
)}

      {/* Resize Handle */}
      <div
        className={`absolute -top-3 right-0 w-18 h-18 cursor-nesw-resize flex items-start justify-end p-1 transition-opacity z-50 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        data-balloon-control="true"
        onMouseDown={(e) => {
          e.stopPropagation();
          setIsResizing(true);
          resizeStart.current = {
            mx: e.clientX,
            my: e.clientY,
            sw: ref.current?.offsetWidth || 320,
            sh: ref.current?.offsetHeight || 160,
            sy: idea.position.y
          };
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          setIsResizing(true);
          resizeStart.current = {
            mx: e.touches[0].clientX,
            my: e.touches[0].clientY,
            sw: ref.current?.offsetWidth || 320,
            sh: ref.current?.offsetHeight || 160,
            sy: idea.position.y
          };
        }}
      >
        <div className="w-3 h-3.5 rounded-full" style={{ backgroundColor: color, opacity: 0.5 }} />
      </div>
    </div>
  );
}
