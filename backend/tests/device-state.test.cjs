const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDeviceState, validateCommand } = require('../dist/modules/integrations/device-state');

test('normalizes an air conditioner status payload', () => {
  const state = normalizeDeviceState({
    components: {
      main: {
        switch: { switch: { value: 'on', timestamp: '2026-10-23T10:00:00Z' } },
        temperatureMeasurement: { temperature: { value: 79, unit: 'F', timestamp: '2026-10-23T10:05:00Z' } },
        thermostatCoolingSetpoint: {
          coolingSetpoint: { value: 23, unit: 'C' },
          coolingSetpointRange: { value: { minimum: 16, maximum: 30 } },
        },
        airConditionerMode: { airConditionerMode: { value: 'cool' }, supportedAcModes: { value: ['cool', 'dry', 42] } },
        airConditionerFanMode: { fanMode: { value: 'auto' }, supportedAcFanModes: { value: ['auto', 'low'] } },
        powerConsumptionReport: { powerConsumption: { value: { energy: 12500, power: 850 } } },
      },
    },
  });
  assert.equal(state.switch, 'on');
  assert.equal(state.temperatureC, 26.1);
  assert.equal(state.coolingSetpointC, 23);
  assert.deepEqual(state.setpointRange, { min: 16, max: 30 });
  assert.deepEqual(state.supportedModes, ['cool', 'dry']);
  assert.equal(state.fanMode, 'auto');
  assert.equal(state.powerW, 850);
  assert.equal(state.energyKWh, 12.5);
  assert.equal(state.updatedAt, '2026-10-23T10:05:00Z');
});

test('keeps missing readings as null instead of zero', () => {
  const state = normalizeDeviceState({ components: { main: { switch: { switch: { value: 'off' } } } } });
  assert.equal(state.powerW, null);
  assert.equal(state.energyKWh, null);
  assert.equal(state.temperatureC, null);
  assert.equal(state.setpointRange, null);
  assert.equal(normalizeDeviceState(null).switch, null);
});

test('allows only known commands with valid arguments', () => {
  assert.equal(validateCommand('switch', 'on', [], ['switch']), null);
  assert.equal(validateCommand('thermostatCoolingSetpoint', 'setCoolingSetpoint', [22], undefined), null);
  assert.match(validateCommand('thermostatCoolingSetpoint', 'setCoolingSetpoint', [99], undefined), /faixa/);
  assert.match(validateCommand('airConditionerMode', 'setAirConditionerMode', ['cool; drop'], undefined), /inv/);
  assert.match(validateCommand('switch', 'on', [], ['powerMeter']), /suporta/);
  assert.match(validateCommand('lock', 'unlock', [], undefined), /permitido/);
});

test('normalizes TV status and validates TV commands', () => {
  const state = normalizeDeviceState({ components: { main: {
    audioVolume: { volume: { value: 18, unit: '%' } },
    audioMute: { mute: { value: 'unmuted' } },
    tvChannel: { tvChannel: { value: '7' }, tvChannelName: { value: 'Globo' } },
    mediaInputSource: { inputSource: { value: 'HDMI1' }, supportedInputSources: { value: ['digitalTv', 'HDMI1'] } },
  } } });
  assert.equal(state.volume, 18);
  assert.equal(state.muted, false);
  assert.equal(state.channelName, 'Globo');
  assert.deepEqual(state.supportedInputSources, ['digitalTv', 'HDMI1']);
  assert.equal(validateCommand('audioVolume', 'setVolume', [30], undefined), null);
  assert.match(validateCommand('audioVolume', 'setVolume', [130], undefined), /Volume/);
  assert.equal(validateCommand('tvChannel', 'setTvChannel', ['13-1'], undefined), null);
  assert.match(validateCommand('tvChannel', 'setTvChannel', ['abc'], undefined), /Canal/);
  assert.equal(validateCommand('mediaInputSource', 'setInputSource', ['HDMI2'], undefined), null);
});

test('derives average power from the Samsung report when power is zero', () => {
  const state = normalizeDeviceState({ components: { main: { powerConsumptionReport: { powerConsumption: { value: {
    start: '2026-10-23T10:00:00Z', end: '2026-10-23T10:15:00Z', energy: 50000, deltaEnergy: 30, power: 0,
  } } } } } });
  assert.equal(state.powerW, 120);
  assert.equal(state.powerSource, 'average');
  assert.equal(state.powerAt, '2026-10-23T10:15:00Z');
  const idle = normalizeDeviceState({ components: { main: { powerConsumptionReport: { powerConsumption: { value: {
    start: '2026-10-23T10:00:00Z', end: '2026-10-23T10:15:00Z', deltaEnergy: 0, power: 0,
  } } } } } });
  assert.equal(idle.powerW, 0);
  assert.equal(idle.powerSource, 'report');
  const live = normalizeDeviceState({ components: { main: { powerMeter: { power: { value: 0.5, unit: 'kW' } } } } });
  assert.equal(live.powerW, 500);
  assert.equal(live.powerSource, 'live');
});
