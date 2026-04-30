import { ExportPanelContent, type ExportBackgroundMode } from './ExportPopover';
import { Sheet, SheetContent } from './ui/sheet';

type ExportSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ExportBackgroundMode;
  onChange: (value: ExportBackgroundMode) => void;
  onExport: () => void;
  isExporting: boolean;
  showBranding: boolean;
  brandingPlanLabel: string;
  error?: string | null;
};

export function ExportSheet({
  open,
  onOpenChange,
  value,
  onChange,
  onExport,
  isExporting,
  showBranding,
  brandingPlanLabel,
  error
}: ExportSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="export-sheet-content">
        <div className="export-sheet-handle" aria-hidden="true" />
        <ExportPanelContent
          value={value}
          onChange={onChange}
          onExport={onExport}
          isExporting={isExporting}
          showBranding={showBranding}
          brandingPlanLabel={brandingPlanLabel}
          error={error}
          variant="sheet"
        />
      </SheetContent>
    </Sheet>
  );
}
