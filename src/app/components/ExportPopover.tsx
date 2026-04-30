import { Download, ImageIcon, Info, X } from 'lucide-react';
import { PopoverContent } from './ui/popover';

export type ExportBackgroundMode = 'current' | 'white' | 'transparent';

type ExportPanelContentProps = {
  value: ExportBackgroundMode;
  onChange: (value: ExportBackgroundMode) => void;
  onExport: () => void;
  isExporting: boolean;
  showBranding: boolean;
  brandingPlanLabel: string;
  error?: string | null;
  onClose?: () => void;
  variant?: 'popover' | 'sheet';
};

const backgroundOptions: Array<{
  value: ExportBackgroundMode;
  label: string;
  description: string;
  icon: 'image' | 'white' | 'transparent';
}> = [
  {
    value: 'current',
    label: 'Atual',
    description: 'Mantem o fundo atual do mapa.',
    icon: 'image'
  },
  {
    value: 'white',
    label: 'Branco',
    description: 'Exporta com fundo branco.',
    icon: 'white'
  },
  {
    value: 'transparent',
    label: 'Transparente',
    description: 'Exporta com fundo transparente.',
    icon: 'transparent'
  }
];

function OptionIcon({ icon }: { icon: 'image' | 'white' | 'transparent' }) {
  if (icon === 'image') {
    return (
      <span className="export-option__icon" aria-hidden="true">
        <ImageIcon size={19} />
      </span>
    );
  }

  return (
    <span
      className={`export-option__swatch export-option__swatch--${icon}`}
      aria-hidden="true"
    />
  );
}

export function ExportPanelContent({
  value,
  onChange,
  onExport,
  isExporting,
  showBranding,
  brandingPlanLabel,
  error,
  onClose,
  variant = 'popover'
}: ExportPanelContentProps) {
  return (
    <div className={`export-panel export-panel--${variant}`}>
      <div className="export-panel__header">
        <span className="export-panel__title-icon" aria-hidden="true">
          <Download size={18} />
        </span>
        <div className="export-panel__title">
          <h2>Exportar imagem</h2>
          <p>Escolha o fundo da sua imagem</p>
        </div>
        {onClose && (
          <button
            type="button"
            className="export-panel__close"
            onClick={onClose}
            aria-label="Fechar exportacao"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <fieldset className="export-panel__fieldset">
        <legend>Fundo</legend>
        <div className="export-panel__options" role="radiogroup" aria-label="Fundo da imagem">
          {backgroundOptions.map(option => {
            const selected = value === option.value;

            return (
              <button
                key={option.value}
                type="button"
                className={`export-option ${selected ? 'is-selected' : ''}`}
                onClick={() => onChange(option.value)}
                role="radio"
                aria-checked={selected}
              >
                <OptionIcon icon={option.icon} />
                <span className="export-option__copy">
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </span>
                <span className="export-option__radio" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </fieldset>

      {showBranding && (
        <div className="export-branding-note">
          <div className="export-branding-note__top">
            <span>
              Inclui marca Synapse <Info size={13} />
            </span>
            <strong>{brandingPlanLabel}</strong>
          </div>
          <p>A imagem exportada incluira a marca Synapse IA no topo.</p>
          <div className="export-branding-preview" aria-hidden="true">
            <b>Synapse IA</b>
            <span>synapse.onexustech.com</span>
          </div>
        </div>
      )}

      {error && <p className="export-panel__error">{error}</p>}

      <button
        type="button"
        className="export-panel__submit"
        onClick={onExport}
        disabled={isExporting}
      >
        <Download size={18} />
        {isExporting ? 'Exportando...' : 'Exportar imagem'}
      </button>
    </div>
  );
}

type ExportPopoverProps = Omit<ExportPanelContentProps, 'variant'>;

export function ExportPopover(props: ExportPopoverProps) {
  return (
    <PopoverContent
      side="left"
      align="end"
      sideOffset={14}
      className="canvas-export-popover"
    >
      <ExportPanelContent {...props} variant="popover" />
    </PopoverContent>
  );
}
