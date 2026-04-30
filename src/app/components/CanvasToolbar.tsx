import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Crosshair, Download, Minus, Plus, RotateCcw } from 'lucide-react';
import { ExportSheet } from './ExportSheet';
import { ExportPopover, type ExportBackgroundMode } from './ExportPopover';
import { Popover, PopoverTrigger } from './ui/popover';
import { useIsMobile } from './ui/use-mobile';

type CanvasToolbarProps = {
  zoom: number;
  showGrid: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleGrid: () => void;
  onExportImage: (background: ExportBackgroundMode) => Promise<void>;
  showBranding: boolean;
  brandingPlanLabel: string;
};

const CANVAS_TOOLBAR_COLLAPSED_KEY = 'synapse:canvasToolbarCollapsed';

function getInitialCollapsedState() {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(CANVAS_TOOLBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(function ToolbarButton(
  { label, onClick, active, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`canvas-toolbar__button ${active ? 'is-active' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      {...props}
    >
      {children}
    </button>
  );
});

export function CanvasToolbar({
  zoom,
  showGrid,
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleGrid,
  onExportImage,
  showBranding,
  brandingPlanLabel
}: CanvasToolbarProps) {
  const isMobile = useIsMobile();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [background, setBackground] = useState<ExportBackgroundMode>('current');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(getInitialCollapsedState);

  const handleExport = async () => {
    setError(null);
    setIsExporting(true);

    try {
      await onExportImage(background);
      setIsExportOpen(false);
    } catch (err) {
      console.error(err);
      setError('Nao foi possivel exportar agora.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportButton = (
    <ToolbarButton label="Exportar imagem" active={isExportOpen}>
      <Download size={21} />
    </ToolbarButton>
  );

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;

      try {
        window.localStorage.setItem(CANVAS_TOOLBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Keep the in-session state even if localStorage is unavailable.
      }

      if (next) setIsExportOpen(false);
      return next;
    });
  };

  return (
    <>
      <div className={`canvas-toolbar-wrap ${isCollapsed ? 'is-collapsed' : ''}`}>
        <button
          type="button"
          className="canvas-toolbar-toggle"
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? 'Mostrar ferramentas do canvas' : 'Esconder ferramentas do canvas'}
          title={isCollapsed ? 'Mostrar ferramentas' : 'Esconder ferramentas'}
        >
          {isCollapsed ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
        </button>

        {!isCollapsed && (
          <div className="canvas-toolbar" aria-label="Ferramentas do canvas">
            <ToolbarButton label="Aumentar zoom" onClick={onZoomIn}>
              <Plus size={23} />
            </ToolbarButton>

            <ToolbarButton label="Diminuir zoom" onClick={onZoomOut}>
              <Minus size={23} />
            </ToolbarButton>

            <ToolbarButton label={`Resetar visualizacao (${Math.round(zoom * 100)}%)`} onClick={onResetView}>
              <RotateCcw size={19} />
            </ToolbarButton>

            <ToolbarButton label={showGrid ? 'Ocultar plano cartesiano' : 'Mostrar plano cartesiano'} onClick={onToggleGrid} active={showGrid}>
              <Crosshair size={20} />
            </ToolbarButton>

            {isMobile ? (
              <ToolbarButton label="Exportar imagem" onClick={() => setIsExportOpen(true)} active={isExportOpen}>
                <Download size={21} />
              </ToolbarButton>
            ) : (
              <Popover open={isExportOpen} onOpenChange={setIsExportOpen}>
                <PopoverTrigger asChild>
                  {exportButton}
                </PopoverTrigger>
                <ExportPopover
                  value={background}
                  onChange={setBackground}
                  onExport={handleExport}
                  isExporting={isExporting}
                  showBranding={showBranding}
                  brandingPlanLabel={brandingPlanLabel}
                  error={error}
                  onClose={() => setIsExportOpen(false)}
                />
              </Popover>
            )}
          </div>
        )}
      </div>

      <ExportSheet
        open={isMobile && isExportOpen}
        onOpenChange={setIsExportOpen}
        value={background}
        onChange={setBackground}
        onExport={handleExport}
        isExporting={isExporting}
        showBranding={showBranding}
        brandingPlanLabel={brandingPlanLabel}
        error={error}
      />
    </>
  );
}

export type { ExportBackgroundMode };
