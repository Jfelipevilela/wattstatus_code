// Normalizes the raw SmartThings status payload into the fields the UI needs.
// Missing readings stay null so clients never mistake "unknown" for zero.

export interface DeviceState {
  switch: "on" | "off" | null;
  powerW: number | null;
  // live: powerMeter reading. report: power field of the ~15 min Samsung
  // powerConsumptionReport. average: deltaEnergy / report window, used when
  // the report carries energy but no power.
  powerSource: "live" | "report" | "average" | null;
  powerAt: string | null;
  energyKWh: number | null;
  temperatureC: number | null;
  humidity: number | null;
  coolingSetpointC: number | null;
  setpointRange: { min: number; max: number } | null;
  mode: string | null;
  supportedModes: string[];
  fanMode: string | null;
  supportedFanModes: string[];
  optionalMode: string | null;
  supportedOptionalModes: string[];
  volume: number | null;
  muted: boolean | null;
  channel: string | null;
  channelName: string | null;
  inputSource: string | null;
  supportedInputSources: string[];
  playback: string | null;
  updatedAt: string | null;
}

type Attribute = { value?: unknown; unit?: unknown; timestamp?: unknown };

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const attribute = (main: Record<string, unknown> | null, capability: string, name: string) =>
  (record(record(main?.[capability])?.[name]) ?? null) as Attribute | null;

const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const textOrNull = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

const celsius = (attr: Attribute | null) => {
  const value = finite(attr?.value);
  if (value === null) return null;
  return attr?.unit === "F" ? Math.round(((value - 32) * 5) / 9 * 10) / 10 : value;
};

export const normalizeDeviceState = (raw: unknown): DeviceState => {
  const main = record(record(record(raw)?.components)?.main);
  const timestamps: string[] = [];
  const read = (capability: string, name: string) => {
    const attr = attribute(main, capability, name);
    if (typeof attr?.timestamp === "string") timestamps.push(attr.timestamp);
    return attr;
  };

  const switchValue = read("switch", "switch")?.value;
  const power = read("powerMeter", "power");
  const energy = read("energyMeter", "energy");
  const report = record(read("powerConsumptionReport", "powerConsumption")?.value);

  let powerW = finite(power?.value);
  if (powerW !== null && power?.unit === "kW") powerW *= 1000;
  let powerSource: DeviceState["powerSource"] = powerW === null ? null : "live";
  let powerAt = powerW === null ? null : typeof power?.timestamp === "string" ? power.timestamp : null;
  if (powerW === null && report) {
    const reportPower = finite(report.power);
    const deltaWh = finite(report.deltaEnergy);
    const start = typeof report.start === "string" ? Date.parse(report.start) : NaN;
    const end = typeof report.end === "string" ? Date.parse(report.end) : NaN;
    const hours = (end - start) / 3600000;
    powerAt = typeof report.end === "string" ? report.end : null;
    if (reportPower !== null && reportPower > 0) {
      powerW = reportPower;
      powerSource = "report";
    } else if (deltaWh !== null && deltaWh > 0 && Number.isFinite(hours) && hours > 0) {
      powerW = Math.round((deltaWh / hours) * 10) / 10;
      powerSource = "average";
    } else if (reportPower !== null) {
      powerW = reportPower;
      powerSource = "report";
    }
  }

  let energyKWh = finite(energy?.value);
  if (energyKWh !== null && energy?.unit === "Wh") energyKWh /= 1000;
  if (energyKWh === null) {
    const wh = finite(report?.energy);
    // Samsung TVs report energy 0 because they keep no running total.
    energyKWh = wh === null || wh <= 0 ? null : wh / 1000;
  }

  const range = record(read("thermostatCoolingSetpoint", "coolingSetpointRange")?.value);
  const min =
    finite(range?.minimum) ?? finite(read("custom.thermostatSetpointControl", "minimumSetpoint")?.value);
  const max =
    finite(range?.maximum) ?? finite(read("custom.thermostatSetpointControl", "maximumSetpoint")?.value);

  return {
    switch: switchValue === "on" || switchValue === "off" ? switchValue : null,
    powerW,
    powerSource,
    powerAt,
    energyKWh,
    temperatureC: celsius(read("temperatureMeasurement", "temperature")),
    humidity: finite(read("relativeHumidityMeasurement", "humidity")?.value),
    coolingSetpointC: celsius(read("thermostatCoolingSetpoint", "coolingSetpoint")),
    setpointRange: min !== null && max !== null && min < max ? { min, max } : null,
    mode: (read("airConditionerMode", "airConditionerMode")?.value as string) ?? null,
    supportedModes: strings(read("airConditionerMode", "supportedAcModes")?.value),
    fanMode: (read("airConditionerFanMode", "fanMode")?.value as string) ?? null,
    supportedFanModes: strings(read("airConditionerFanMode", "supportedAcFanModes")?.value),
    optionalMode: (read("custom.airConditionerOptionalMode", "acOptionalMode")?.value as string) ?? null,
    supportedOptionalModes: strings(
      read("custom.airConditionerOptionalMode", "supportedAcOptionalMode")?.value
    ),
    volume: finite(read("audioVolume", "volume")?.value),
    muted: ((value) => (value === "muted" ? true : value === "unmuted" ? false : null))(
      read("audioMute", "mute")?.value
    ),
    channel: textOrNull(read("tvChannel", "tvChannel")?.value),
    channelName: textOrNull(read("tvChannel", "tvChannelName")?.value),
    inputSource: textOrNull(read("mediaInputSource", "inputSource")?.value),
    supportedInputSources: strings(read("mediaInputSource", "supportedInputSources")?.value),
    playback: textOrNull(read("mediaPlayback", "playbackStatus")?.value),
    updatedAt: timestamps.sort()[timestamps.length - 1] ?? null,
  };
};

// Commands the UI may send. Anything else is rejected before reaching SmartThings.
export const validateCommand = (
  capability: string,
  command: string,
  args: unknown[],
  deviceCapabilities: string[] | undefined,
): string | null => {
  if (deviceCapabilities && !deviceCapabilities.includes(capability)) {
    return "Dispositivo não suporta este comando";
  }
  switch (`${capability}.${command}`) {
    case "switch.on":
    case "switch.off":
    case "audioVolume.volumeUp":
    case "audioVolume.volumeDown":
    case "audioMute.mute":
    case "audioMute.unmute":
    case "tvChannel.channelUp":
    case "tvChannel.channelDown":
    case "mediaPlayback.play":
    case "mediaPlayback.pause":
    case "mediaPlayback.stop":
      return args.length === 0 ? null : "Argumentos inválidos";
    case "thermostatCoolingSetpoint.setCoolingSetpoint": {
      const value = finite(args[0]);
      return args.length === 1 && value !== null && value >= 10 && value <= 35
        ? null
        : "Temperatura fora da faixa permitida";
    }
    case "audioVolume.setVolume": {
      const value = finite(args[0]);
      return args.length === 1 && value !== null && Number.isInteger(value) && value >= 0 && value <= 100
        ? null
        : "Volume inválido";
    }
    case "tvChannel.setTvChannel":
      return args.length === 1 && typeof args[0] === "string" && /^[0-9]{1,5}(-[0-9]{1,3})?$/.test(args[0])
        ? null
        : "Canal inválido";
    case "mediaInputSource.setInputSource":
      return args.length === 1 && typeof args[0] === "string" && /^[A-Za-z0-9_]{1,32}$/.test(args[0])
        ? null
        : "Fonte inválida";
    case "airConditionerMode.setAirConditionerMode":
    case "airConditionerFanMode.setFanMode":
    case "custom.airConditionerOptionalMode.setAcOptionalMode":
      return args.length === 1 && typeof args[0] === "string" && /^[A-Za-z]{1,32}$/.test(args[0])
        ? null
        : "Modo inválido";
    default:
      return "Comando não permitido";
  }
};
