import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

// Render real React components with their existing contexts. Not a substitute for browser E2E.
test("renderização do fluxo mantém biblioteca padrão, alternativas e formulários por método", async () => {
  const moduleId = "virtual:wattstatus-catalog-render";
  const server = await createServer({
    server: { middlewareMode: true, hmr: false },
    plugins: [
      {
        name: "catalog-render-test",
        resolveId: (id) => (id === moduleId ? moduleId : undefined),
        load: (id) =>
          id === moduleId
            ? `
        import React from 'react';
        import { renderToString } from 'react-dom/server';
        import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
        import { AuthProvider } from '/src/hooks/useAuth.tsx';
        import { UserPreferencesProvider } from '/src/hooks/useUserPreferences.tsx';
        import Flow from '/src/components/AddApplianceFlow.tsx';
        import Config from '/src/components/DeviceConfigurationPanel.tsx';
        import Manual from '/src/components/ApplianceCalculator.tsx';
        import ApplianceCard from '/src/components/ApplianceCard.tsx';
        import AppliancesTab from '/src/components/tabs/AppliancesTab.tsx';
        import ReportsTab from '/src/components/tabs/ReportsTab.tsx';
        const wrap = child => React.createElement(QueryClientProvider, { client: new QueryClient() },
          React.createElement(AuthProvider, null, React.createElement(UserPreferencesProvider, null, child)));
        export const flow = () => renderToString(wrap(React.createElement(Flow, { onAddAppliance: async () => {}, onSaved: () => {}, onBusyChange: () => {} })));
        export const manual = () => renderToString(wrap(React.createElement(Manual, { onAddAppliance: async () => {} })));
        const appliance = profile => ({ id: 'test', name: 'Modelo de teste', power: 0, usageHours: 0, days: 30,
          tariff: 'SP', tariffValue: .82, monthlyConsumption: 0, monthlyCost: 0, status: 'normal',
          createdAt: '2026-01-01T00:00:00Z', energyProfile: profile, cyclesPerMonth: 10,
          catalogDeviceId: 'test', source: { type: 'PBE' }, measuredConsumptionKWh: 0 });
        export const card = profile => renderToString(wrap(React.createElement(ApplianceCard, {
          appliance: appliance(profile), consumption: 40.5, cost: 33.21, rank: 1, share: 100 })));
        export const appliances = profile => renderToString(wrap(React.createElement(AppliancesTab, {
          appliances: [appliance(profile)], onAddAppliance: async () => {}, onEdit: () => {}, onDelete: () => {} })));
        export const reports = profile => renderToString(wrap(React.createElement(ReportsTab, { appliances: [appliance(profile)] })));
        export const smart = integration => renderToString(wrap(React.createElement(Config, { integration,
          onAddAppliance: async () => {}, onSaved: () => {} })));
        export const config = (profile, type = 'PBE') => renderToString(wrap(React.createElement(Config, {
          device: { id: 'test', displayName: 'Teste sintético', region: type === 'ENERGY_STAR' ? 'US' : 'BR', isGeneric: type === 'WATTSTATUS_GENERIC', verified: type !== 'WATTSTATUS_GENERIC',
            source: { type, reference: 'https://example.invalid', verifiedAt: '2026-10-23T00:00:00.000Z' }, energyProfile: profile },
          onAddAppliance: async () => {}, onSaved: () => {} })));
      `
            : undefined,
      },
    ],
  });
  try {
    const render = await server.ssrLoadModule(moduleId);
    const html = render.flow();
    assert.match(html, /aria-pressed="true"[^]*?Biblioteca de aparelhos/);
    assert.match(html, /Conectar dispositivo inteligente/);
    assert.match(html, /Adicionar manualmente/);
    assert.match(html, /Buscar na biblioteca/);
    assert.match(html, /Categoria/);
    assert.match(html, /Tipo de aparelho/);
    assert.match(html, /Marca/);
    assert.match(html, /lg:grid-cols-/);
    const power = render.config({ method: "POWER_TIME", typicalPowerW: 120 });
    assert.match(power, /Potência estimada/);
    assert.match(power, /value="120"/);
    assert.match(power, /Horas por dia/);
    const monthly = render.config({
      method: "REFERENCE_MONTHLY",
      referenceMonthlyKwh: 40.5,
    });
    assert.match(monthly, /40,50/);
    assert.doesNotMatch(monthly, /Horas por dia/);
    const cycle = render.config({
      method: "PER_CYCLE",
      energyPerCycleKwh: 0.143,
    });
    assert.match(cycle, /Ciclos por mês/);
    assert.match(cycle, /0,143/);
    assert.match(render.manual(), /Simular sem salvar/);
    const monthlyProfile = { method: "REFERENCE_MONTHLY", referenceMonthlyKwh: 40.5 };
    const monthlyCard = render.card(monthlyProfile);
    assert.match(monthlyCard, /Biblioteca de aparelhos/);
    assert.match(monthlyCard, /PBE \/ Inmetro/);
    assert.match(monthlyCard, /Referência mensal/);
    assert.doesNotMatch(monthlyCard, /Uso\/dia/);
    assert.match(monthlyCard, /Medidor:/); // A real zero counter must remain visible.
    const cycleProfile = { method: "PER_CYCLE", energyPerCycleKwh: .143 };
    assert.match(render.card(cycleProfile), /Ciclos\/mês/);
    assert.match(render.appliances(monthlyProfile), /Biblioteca/);
    assert.match(render.reports(monthlyProfile), /Referência mensal/);
    assert.match(render.reports(cycleProfile), /10 ciclos\/mês/);
    assert.match(render.reports(cycleProfile), /PBE \/ Inmetro/);
    const annualProfile = { method: "REFERENCE_PERIOD", value: 402, unit: "kWh", period: "YEAR", measurementType: "ESTIMATED" };
    for (const html of [render.config(annualProfile), render.card(annualProfile), render.reports(annualProfile)]) {
      assert.match(html, /402,00 kWh\/ano/);
      assert.match(html, /Média mensal derivada da referência anual/);
    }
    assert.doesNotMatch(render.config(annualProfile), /Horas por dia/);
    assert.match(render.config(annualProfile, 'ENERGY_STAR'), /ENERGY STAR.*referência internacional/);
    assert.match(render.config(annualProfile, 'MANUFACTURER'), /Fabricante/);
    assert.match(render.config({method:'POWER_TIME',typicalPowerW:80}, 'WATTSTATUS_GENERIC'), /Valor típico estimado/);
    const powerOnly = render.smart({id:'synthetic',name:'Fixture',brand:'Fixture',power:83});
    assert.match(powerOnly,/Potência atual:.*83,00/);
    assert.doesNotMatch(powerOnly,/Medição real disponível/);
    assert.match(render.smart({id:'synthetic',name:'Fixture',brand:'Fixture',power:0,counterKWh:0}),/Medição real disponível/);
  } finally {
    await server.close();
  }
});
