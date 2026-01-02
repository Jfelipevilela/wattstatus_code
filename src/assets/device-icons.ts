import {
  MdOutlineAcUnit,
  MdOutlineLightbulb,
  MdOutlineDeviceHub,
  MdOutlineWaterDrop,
  MdOutlineTv,
  MdOutlineBolt,
} from "react-icons/md";
import { LuAirVent } from "react-icons/lu";



export const deviceIconForCapabilities = (caps?: string[]) => {
  const capabilities = caps || [];
  if (capabilities.includes("airConditionerMode")) return LuAirVent;
  // if (capabilities.includes("switch")) return MdOutlineBolt;
  if (
    capabilities.includes("colorTemperature") ||
    capabilities.includes("colorControl")
  )
    return MdOutlineLightbulb;
  if (capabilities.includes("tvChannel") || capabilities.includes("audioVolume"))
    return MdOutlineTv;

  if (capabilities.includes("waterMeter") || capabilities.includes("waterSensor"))
    return MdOutlineWaterDrop;
  return MdOutlineDeviceHub;
};
