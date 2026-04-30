import { useRef, useEffect, useState, ReactNode } from 'react';
import { GitBranch, Lightbulb, PenLine, Sparkles, X } from 'lucide-react';
import { IdeaBalloon } from './IdeaBalloon';
import { Idea } from '../App';

interface BrainstormBoardProps {
  ideas: Idea[];
  categories: Array<{ name: string; color: string; bgColor: string }>;
  onUpdatePosition: (id: string, position: { x: number; y: number }) => void;
  onUpdateCategory: (id: string, category: string, color?: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onDeleteIdea: (id: string) => void;
  onToggleCentral: (id: string) => void;
  onUpdateSize: (id: string, size: { width: number; height: number }) => void;
  onUpdateRect: (id: string, rect: { x?: number; y?: number; width?: number; height?: number }) => void;
  connectingFrom: string | null;
  connectingLine: { x1: number; y1: number; x2: number; y2: number } | null;
  onStartConnecting: (id: string) => void;
  onFinishConnecting: (id: string) => void;
  connectionFlash: { from: string; to: string } | null;
  onAiAction: (ideaId: string, action: string) => void;
  aiProcessingId: string | null;
  // Exposed so App can drive zoom/pan
  zoom: number;
  panX: number;
  panY: number;
  showCartesianGuide: boolean;
  onZoomChange: (z: number) => void;
  onPanChange: (x: number, y: number) => void;
  recentColors: string[];
  onSaveRecentColor: (color: string) => void;
}

let animatedConnections = new Set<string>();
export function resetAnimatedConnections() {
  animatedConnections = new Set<string>();
}

// Fixed balloon dimensions (base size — used for fallbacks and connection centers)
export const BALLOON_W = 280;
export const BALLOON_H = 100;

const EMPTY_STATE_STEPS = [
  {
    icon: PenLine,
    title: 'Comece com uma ideia central',
    description: 'Digite ou cole sua ideia principal no campo abaixo.'
  },
  {
    icon: GitBranch,
    title: 'Conecte pensamentos relacionados',
    description: 'Adicione conexões e explore diferentes perspectivas.'
  },
  {
    icon: Lightbulb,
    title: 'Peça para a IA expandir causas, riscos e próximos passos',
    description: 'Receba sugestões inteligentes para aprofundar seu mapa.'
  }
];

export function BrainstormBoard({
  ideas,
  categories,
  onUpdatePosition,
  onUpdateCategory,
  onUpdateText,
  onDeleteIdea,
  onToggleCentral,
  onUpdateSize,
  onUpdateRect,
  connectingFrom,
  connectingLine,
  onStartConnecting,
  onFinishConnecting,
  connectionFlash,
  onAiAction,
  aiProcessingId,
  zoom,
  panX,
  panY,
  showCartesianGuide,
  onZoomChange,
  onPanChange,
  recentColors,
  onSaveRecentColor
}: BrainstormBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [isEmptyStateClosed, setIsEmptyStateClosed] = useState(false);

  const [synapseAnimations, setSynapseAnimations] = useState<
    Array<{ id: string; pathD: string; color: string }>
  >([]);

  const getCategoryColor = (idea: Idea) => {
    if (idea.categoryColor) return idea.categoryColor;
    return categories.find(c => c.name === idea.category)?.color || '#6b7280';
  };

  useEffect(() => {
    if (selectedIdeaId && !ideas.some(idea => idea.id === selectedIdeaId)) {
      setSelectedIdeaId(null);
    }
  }, [ideas, selectedIdeaId]);

  useEffect(() => {
    if (ideas.length > 0 && isEmptyStateClosed) {
      setIsEmptyStateClosed(false);
    }
  }, [ideas.length, isEmptyStateClosed]);

  // ── Synapse burst effect ───────────────────────────────────────────
  useEffect(() => {
    if (!connectionFlash) return;
    const fromIdea = ideas.find(i => i.id === connectionFlash.from);
    const toIdea = ideas.find(i => i.id === connectionFlash.to);
    if (!fromIdea || !toIdea) return;

    const key = `${connectionFlash.from}-${connectionFlash.to}`;
    if (animatedConnections.has(key)) return;
    animatedConnections.add(key);

    const w1 = fromIdea.width || BALLOON_W;
    const h1 = fromIdea.height || BALLOON_H;
    const w2 = toIdea.width || BALLOON_W;
    const h2 = toIdea.height || BALLOON_H;
    const x1 = fromIdea.position.x + w1 / 2;
    const y1 = fromIdea.position.y + h1 / 2;
    const x2 = toIdea.position.x + w2 / 2;
    const y2 = toIdea.position.y + h2 / 2;
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const curv = dist * 0.25;
    const cx1 = x1 + dx * 0.3 + (dy * curv) / dist;
    const cy1 = y1 + dy * 0.3 - (dx * curv) / dist;
    const cx2 = x1 + dx * 0.7 - (dy * curv) / dist;
    const cy2 = y1 + dy * 0.7 + (dx * curv) / dist;

    const color = getCategoryColor(fromIdea);
    const pathD = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
    const animId = `syn-${Date.now()}-${Math.random()}`;

    setSynapseAnimations(prev => [...prev, { id: animId, pathD, color }]);
    setTimeout(() => setSynapseAnimations(prev => prev.filter(a => a.id !== animId)), 1600);
  }, [connectionFlash]);

  // ── Pan with mouse/touch and zoom with wheel ────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom toward cursor
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.08 : 0.93;
        const newZoom = Math.min(3, Math.max(0.2, zoom * factor));
        const ratio = newZoom / zoom;
        const newPanX = mx - ratio * (mx - panX);
        const newPanY = my - ratio * (my - panY);
        onZoomChange(newZoom);
        onPanChange(newPanX, newPanY);
      } else {
        // Pan with scroll
        onPanChange(panX - e.deltaX, panY - e.deltaY);
      }
    };

    const isOnBalloon = (target: EventTarget | null): boolean => {
      if (!target) return false;
      const node = target as HTMLElement;
      // If the click is on the container itself or on the SVG layer, allow pan
      return !!node.closest('.idea-balloon-root');
    };

    const handlePanStart = (clientX: number, clientY: number) => {
      isPanning.current = true;
      lastPan.current = { x: clientX, y: clientY };
      el.style.cursor = 'grabbing';
    };

    const handlePanMove = (clientX: number, clientY: number) => {
      if (!isPanning.current) return;
      const dx = clientX - lastPan.current.x;
      const dy = clientY - lastPan.current.y;
      lastPan.current = { x: clientX, y: clientY };
      onPanChange(panX + dx, panY + dy);
    };

    const handlePanEnd = () => {
      isPanning.current = false;
      el.style.cursor = 'default';
    };

    const onMouseDown = (e: MouseEvent) => {
      if (isOnBalloon(e.target)) return; // let balloon handle it
      setSelectedIdeaId(null);
      if (e.button === 0 || e.button === 1 || e.button === 2) {
        e.preventDefault();
        handlePanStart(e.clientX, e.clientY);
      }
    };

    const onMouseMove = (e: MouseEvent) => handlePanMove(e.clientX, e.clientY);
    const onMouseUp = () => handlePanEnd();

    const onTouchStart = (e: TouchEvent) => {
      if (isOnBalloon(e.target)) return;
      setSelectedIdeaId(null);
      handlePanStart(e.touches[0].clientX, e.touches[0].clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isPanning.current) {
        handlePanMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onTouchEnd = () => handlePanEnd();

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    el.addEventListener('contextmenu', e => e.preventDefault());

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      el.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [zoom, panX, panY, onZoomChange, onPanChange]);


  // ── Draw connections ───────────────────────────────────────────────
  const drawConnections = () => {
    const els: ReactNode[] = [];

    ideas.forEach((idea, iIdx) => {
      idea.connections.forEach((connId: string, cIdx: number) => {
        const conn = ideas.find(i => i.id === connId);
        if (!conn) return;

        const key = `${idea.id}-${connId}`;
        const color = getCategoryColor(idea);

        const w1 = idea.width || BALLOON_W;
        const h1 = idea.height || BALLOON_H;
        const w2 = conn.width || BALLOON_W;
        const h2 = conn.height || BALLOON_H;
        const x1 = idea.position.x + w1 / 2;
        const y1 = idea.position.y + h1 / 2;
        const x2 = conn.position.x + w2 / 2;
        const y2 = conn.position.y + h2 / 2;
        const dx = x2 - x1, dy = y2 - y1;
        const dist = Math.hypot(dx, dy);
        if (dist < 1) return;
        const curv = dist * 0.25;
        const cx1 = x1 + dx * 0.3 + (dy * curv) / dist;
        const cy1 = y1 + dy * 0.3 - (dx * curv) / dist;
        const cx2 = x1 + dx * 0.7 - (dy * curv) / dist;
        const cy2 = y1 + dy * 0.7 + (dx * curv) / dist;
        const path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

        const delay = (iIdx * 2.1 + cIdx * 1.3) % 6;
        const dur = 3 + (iIdx + cIdx) % 3;

        els.push(
          <g key={key}>
            {/* Wide soft glow */}
            <path
              d={path}
              stroke={color}
              strokeWidth="10"
              fill="none"
              opacity="0.05"
              filter="url(#glow)"
            />
            {/* Main line */}
            <path
              d={path}
              stroke={color}
              strokeWidth="1.5"
              fill="none"
              opacity="0.5"
              strokeLinecap="round"
              strokeDasharray="6 3"
            />
            {/* Bright core */}
            <path d={path} stroke={color} strokeWidth="0.5" fill="none" opacity="0.8" strokeLinecap="round" />
            {/* Flowing particle */}
            <circle r="2.5" fill={color}>
              <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} begin={`${delay}s`} />
              <animate attributeName="opacity" values="0;0.9;0" dur={`${dur}s`} repeatCount="indefinite" begin={`${delay}s`} />
              <animate attributeName="r" values="1.5;3.5;1.5" dur={`${dur}s`} repeatCount="indefinite" begin={`${delay}s`} />
            </circle>
            {/* Small trailing particle */}
            <circle r="1.5" fill="white" opacity="0">
              <animateMotion dur={`${dur + 0.8}s`} repeatCount="indefinite" path={path} begin={`${delay + 0.4}s`} />
              <animate attributeName="opacity" values="0;0.4;0" dur={`${dur + 0.8}s`} repeatCount="indefinite" begin={`${delay + 0.4}s`} />
            </circle>
          </g>
        );
      });
    });

    return els;
  };

  const drawSynapses = () =>
    synapseAnimations.map(anim => (
      <g key={anim.id}>
        <path d={anim.pathD} stroke={anim.color} strokeWidth="5" fill="none" filter="url(#synapse-glow)" opacity="0">
          <animate attributeName="opacity" values="0;0.9;0.5;0" dur="1.4s" repeatCount="1" fill="freeze" />
          <animate attributeName="stroke-width" values="2;7;2" dur="1.4s" repeatCount="1" fill="freeze" />
        </path>
        <path d={anim.pathD} stroke="white" strokeWidth="2" fill="none" opacity="0">
          <animate attributeName="opacity" values="0;0.6;0" dur="0.7s" repeatCount="1" fill="freeze" />
        </path>
        <circle r="5" fill="white" filter="url(#synapse-glow)" opacity="0.9">
          <animateMotion dur="0.75s" repeatCount="1" fill="freeze" path={anim.pathD} />
          <animate attributeName="opacity" values="0.9;0.5;0" dur="0.75s" repeatCount="1" fill="freeze" />
          <animate attributeName="r" values="3;7;3" dur="0.75s" repeatCount="1" fill="freeze" />
        </circle>
        <circle r="4" fill={anim.color} filter="url(#synapse-glow)">
          <animateMotion dur="0.75s" repeatCount="1" fill="freeze" path={anim.pathD} />
          <animate attributeName="opacity" values="1;0.6;0" dur="0.75s" repeatCount="1" fill="freeze" />
        </circle>
        <circle r="2.5" fill={anim.color} opacity="0.5">
          <animateMotion dur="1s" repeatCount="1" fill="freeze" path={anim.pathD} begin="0.1s" />
          <animate attributeName="opacity" values="0.5;0.2;0" dur="1s" repeatCount="1" fill="freeze" begin="0.1s" />
        </circle>
      </g>
    ));

  // Grid dots offset by pan
  const gridDotX = ((panX % 32) + 32) % 32;
  const gridDotY = ((panY % 32) + 32) % 32;

  return (
    <div
      ref={containerRef}
      className="synapse-canvas-root relative overflow-hidden w-full h-full"
      style={{ cursor: 'default' }}
    >
      {/* Background grid (Wallpaper) */}
      <div
        className="synapse-canvas-grid absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, var(--app-dot) 1.2px, transparent 1.2px)`,
          backgroundSize: '32px 32px',
          backgroundPosition: `${gridDotX}px ${gridDotY}px`,
          zIndex: 0
        }}
      />
      {/* Radial ambient */}
      <div
        className="synapse-canvas-ambient absolute inset-0 pointer-events-none"
        style={{
          background: 'var(--app-canvas-ambient)',
          zIndex: 0
        }}
      />

      {/* Transformable world */}
      <div
        className="synapse-canvas-world"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
          zIndex: 1
        }}
      >
        {showCartesianGuide && (
          <div className="cartesian-guide" aria-hidden="true">
            <span className="cartesian-guide-axis cartesian-guide-axis-x" />
            <span className="cartesian-guide-axis cartesian-guide-axis-y" />
            <span className="cartesian-guide-origin" />
          </div>
        )}

        {/* SVG connections layer */}
        <svg
          ref={svgRef}
          className="absolute pointer-events-none"
          style={{ left: 0, top: 0, width: '9999px', height: '9999px', overflow: 'visible' }}
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="synapse-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {drawConnections()}
          {drawSynapses()}

          {/* Live connecting preview line */}
          {connectingLine && (
            <line
              x1={connectingLine.x1} y1={connectingLine.y1}
              x2={connectingLine.x2} y2={connectingLine.y2}
              stroke="#8b5cf6" strokeWidth="2" strokeDasharray="6 4"
              opacity="0.7" filter="url(#glow)"
            />
          )}
        </svg>

        {/* Ideas */}
        {ideas.map(idea => (
          <IdeaBalloon
            key={idea.id}
            idea={idea}
            categories={categories}
            onUpdatePosition={onUpdatePosition}
            onUpdateCategory={onUpdateCategory}
            onUpdateText={onUpdateText}
            onToggleCentral={onToggleCentral}
            onUpdateSize={onUpdateSize}
            onUpdateRect={onUpdateRect}
            onDelete={onDeleteIdea}
            recentColors={recentColors}
            onSaveRecentColor={onSaveRecentColor}
            isConnecting={connectingFrom === idea.id}
            connectingFromAny={connectingFrom !== null}
            isSelected={selectedIdeaId === idea.id}
            onSelect={setSelectedIdeaId}
            onStartConnecting={onStartConnecting}
            onFinishConnecting={onFinishConnecting}
            onAiAction={onAiAction}
            isAiProcessing={aiProcessingId === idea.id}
            balloonW={BALLOON_W}
            balloonH={BALLOON_H}
          />
        ))}
      </div>

      {/* Empty state */}
      {ideas.length === 0 && !isEmptyStateClosed && (
        <div className="empty-state-shell">
          <section className="empty-state-card" aria-label="Canvas vazio">
            <div className="empty-state-aura" />
            <button
              type="button"
              className="empty-state-close"
              onClick={() => setIsEmptyStateClosed(true)}
              aria-label="Fechar estado vazio"
            >
              <X size={18} />
            </button>

            <div className="empty-state-icon-frame">
              <img
                src="/synapse-ia-icone-semfundo.png"
                alt=""
                className="empty-state-icon"
                style={{ filter: 'drop-shadow(0 0 22px rgba(139,92,246,0.36))' }}
              />
            </div>

            <div className="empty-state-copy">
              <span className="empty-state-kicker">
                <Sparkles size={13} />
                Canvas neural
              </span>
              <h2>
                Comece com uma ideia central
              </h2>
              <p>
                Transforme um pensamento solto em um mapa visual de causas, riscos e próximos passos.
              </p>
            </div>

            <div className="empty-state-grid">
              {EMPTY_STATE_STEPS.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="empty-state-step-card"
                >
                  <span className="empty-state-step-icon">
                    <Icon size={22} />
                  </span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              ))}
            </div>

            <div className="empty-state-divider" />

            <div className="empty-state-cta">
              <PenLine size={16} />
              <span>Digite sua primeira ideia abaixo</span>
            </div>
          </section>
        </div>
      )}

      {/* Connecting hint overlay */}
      {connectingFrom && (
        <div
          className="synapse-connecting-hint absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium pointer-events-none"
          style={{
            background: 'rgba(139,92,246,0.15)',
            border: '1px solid rgba(139,92,246,0.4)',
            color: '#c4b5fd',
            backdropFilter: 'blur(12px)'
          }}
        >
          <span className="animate-pulse text-purple-400">●</span>
          Clique em outro balão para conectar · ESC para cancelar
        </div>
      )}
    </div>
  );
}
