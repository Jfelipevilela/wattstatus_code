import { useState } from "react";
import type { Appliance, ApplianceInput } from "@/hooks/useAppliances";
import ApplianceCalculator from "@/components/ApplianceCalculator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function EditApplianceModal({
  appliance,
  isOpen,
  onClose,
  onSave,
}: {
  appliance: Appliance | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updated: ApplianceInput) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar aparelho</DialogTitle>
          <DialogDescription>
            Ajuste os dados e salve suas alterações.
          </DialogDescription>
        </DialogHeader>
        {appliance && (
          <ApplianceCalculator
            key={appliance.id}
            initialAppliance={appliance}
            onSaved={onClose}
            onBusyChange={setBusy}
            onAddAppliance={async (input) => {
              await onSave(appliance.id, input);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
