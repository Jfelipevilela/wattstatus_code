import type { CatalogDevice } from "../../backend/src/modules/catalog/catalog.types";
import AddApplianceFlow from "./AddApplianceFlow";

export interface CatalogDevicePickerProps {
  onSelect: (device: CatalogDevice) => void;
  disabled?: boolean;
}

// Selection returns catalog data only; registration and preferences stay outside
// this flow, so it can also be used for temporary simulation items.
export default function CatalogDevicePicker({ onSelect, disabled }: CatalogDevicePickerProps) {
  return <AddApplianceFlow onSelectCatalog={onSelect} disabled={disabled} />;
}
