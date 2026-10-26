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
        import CatalogPagination from '/src/components/CatalogPagination.tsx';
        import { catalogPresentation } from '/src/lib/catalog-presentation.ts';
        import { catalogSourceInfo } from '/src/lib/catalog-source-info.ts';
        export const presentation = catalogPresentation;
        export const sourceInfo = catalogSourceInfo;
        const wrap = child => React.createElement(QueryClientProvider, { client: new QueryClient() },
          React.createElement(AuthProvider, null, React.createElement(UserPreferencesProvider, null, child)));
        export const flow = () => renderToString(wrap(React.createElement(Flow, { onAddAppliance: async () => {}, onSaved: () => {}, onBusyChange: () => {} })));
        export const pagination = (page,totalPages) => renderToString(React.createElement(CatalogPagination,{page,totalPages,onPageChange:()=>{}}));
        export const manual = () => renderToString(wrap(React.createElement(Manual, { onAddAppliance: async () => {} })));
        const appliance = profile => ({ id: 'test', name: 'Modelo de teste', power: 0, usageHours: 0, days: 30,
          tariff: 'SP', tariffValue: .82, monthlyConsumption: 0, monthlyCost: 0, status: 'normal',
          createdAt: '2026-01-01T00:00:00Z', energyProfile: profile, cyclesPerMonth: 10,
          catalogDeviceId: 'test', source: { type: 'PBE' }, measuredConsumptionKWh: 0 });
        export const card = (profile, extra = {}) => renderToString(wrap(React.createElement(ApplianceCard, {
          appliance: { ...appliance(profile), ...extra }, consumption: 40.5, cost: 33.21, rank: 1, share: 100 })));
        export const appliances = profile => renderToString(wrap(React.createElement(AppliancesTab, {
          appliances: [appliance(profile)], onAddAppliance: async () => {}, onEdit: () => {}, onDelete: () => {} })));
        export const reports = profile => renderToString(wrap(React.createElement(ReportsTab, { appliances: [appliance(profile)] })));
        export const smart = integration => renderToString(wrap(React.createElement(Config, { integration,
          onAddAppliance: async () => {}, onSaved: () => {} })));
        export const describedConfig = device => renderToString(wrap(React.createElement(Config, { device,
          onAddAppliance: async () => {}, onSaved: () => {} })));
        export const config = (profile, type = 'PBE', editing = false) => {
          const device = { id: 'test', displayName: 'Teste sintético', region: type === 'ENERGY_STAR' ? 'US' : 'BR', isGeneric: type === 'WATTSTATUS_GENERIC', verified: type !== 'WATTSTATUS_GENERIC',
            source: { type, reference: 'https://example.invalid', verifiedAt: '2026-10-23T00:00:00.000Z' }, energyProfile: profile };
          return renderToString(wrap(React.createElement(Config, { device,
            ...(editing ? { initialAppliance: { ...appliance(profile), source: device.source, catalogSnapshot: device, estimateByUsage: false } } : {}),
            onAddAppliance: async () => {}, onSaved: () => {} })));
        };
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
    assert.match(html, /value="" selected="">Todas as regiões/);
    const pagination=render.pagination(25,736);
    assert.match(pagination,/aria-current="page"[^]*?>25/);
    assert.match(pagination,/Ir para página/);assert.match(pagination,/max="736"/);
    assert.match(pagination,/Página 1"/);assert.match(pagination,/Página 736"/);
    assert.ok((pagination.match(/aria-label="Página /g)||[]).length<=7,'paginação não renderiza centenas de botões');
    const power = render.config({ method: "POWER_TIME", typicalPowerW: 120 });
    assert.match(power, /Potência do modelo/);
    assert.match(power, /120,00/);
    assert.match(power, /Horas por dia/);
    const monthly = render.config({
      method: "REFERENCE_MONTHLY",
      referenceMonthlyKwh: 40.5,
    }, 'PBE', true);
    assert.match(monthly, /40,50/);
    assert.doesNotMatch(monthly, /Horas por dia/);
    const cycle = render.config({
      method: "PER_CYCLE",
      energyPerCycleKwh: 0.143,
    });
    assert.match(cycle, /Ciclos por semana/);
    assert.match(cycle, /Um ciclo é uma execução completa/);
    assert.doesNotMatch(cycle, /Horas por dia|Dias por mês/);
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
    assert.match(render.reports(cycleProfile), /10,00 ciclos\/mês/);
    assert.match(render.reports(cycleProfile), /PBE \/ Inmetro/);
    const annualProfile = { method: "REFERENCE_PERIOD", value: 402, unit: "kWh", period: "YEAR", measurementType: "ESTIMATED" };
    for (const html of [render.config(annualProfile, 'PBE', true), render.card(annualProfile), render.reports(annualProfile)]) {
      assert.match(html, /402,00 kWh\/ano/);
      assert.match(html, /Média mensal derivada da referência anual/);
    }
    assert.doesNotMatch(render.config(annualProfile), /Horas por dia/);
    assert.match(render.config(annualProfile), /value="REFERENCE" selected="">Usar referência de ensaio/);
    assert.match(render.config(annualProfile), /Não encontramos potência elétrica oficial em watts/);
    assert.match(render.config(annualProfile), /informar os watts da etiqueta/);
    assert.doesNotMatch(render.config(annualProfile, 'PBE', true), /Horas por dia/, 'edição preserva a escolha anterior');
    assert.match(render.config(annualProfile), /Como estimar o consumo/);
    assert.match(render.config(annualProfile), /Calcular pelo meu uso/);
    assert.match(render.config(annualProfile, 'PBE', true), /referência média padronizada de ensaio, usada apenas para comparação/);
    assert.match(render.config(annualProfile, 'ENERGY_STAR', true), /ENERGY STAR.*referência internacional/);
    assert.match(render.config(annualProfile, 'MANUFACTURER', true), /Fabricante/);
    assert.match(render.config({method:'POWER_TIME',typicalPowerW:80}, 'WATTSTATUS_GENERIC'), /Valor típico estimado/);
    const powerOnly = render.smart({id:'synthetic',name:'Fixture',brand:'Fixture',power:83});
    assert.match(powerOnly,/Potência atual:.*83,00/);
    assert.doesNotMatch(powerOnly,/Medição real disponível/);
    assert.match(render.smart({id:'synthetic',name:'Fixture',brand:'Fixture',power:0,counterKWh:0}),/Medição real disponível/);
    const live=render.smart({id:'synthetic',name:'Fixture',brand:'Fixture',counterKWh:127.85,
      energyInterval:{kWh:2.65,startAt:'2026-10-25T00:00:00Z',endAt:'2026-10-25T01:00:00Z'}});
    assert.match(live,/Medição real prioritária/);
    assert.match(live,/Sem estimativa mensal/);
    assert.doesNotMatch(live,/Horas por dia|Potência estimada \(W\)|Ciclos por semana/);
    assert.match(render.config(annualProfile,'EPREL',true),/União Europeia/);
    assert.match(render.config({method:'POWER_TIME',typicalPowerW:100,standbyPowerW:.5}),/Fica em standby/);
    assert.match(html,/Região|Modelo exato/);
    const tv = { id: 'samsung-test', category: 'entertainment', subcategory: 'TV', brand: 'Samsung', model: 'QN115QN90FF',
      displayName: 'TV Samsung QN115QN90FF', aliases: [], region: 'US', verified: true, isGeneric: false,
      source: { type: 'ENERGY_STAR', reference: 'https://www.energystar.gov/', verifiedAt: '2026-10-25T00:00:00.000Z' },
      energyProfile: annualProfile, specifications: { screenSizeInches: 114.4, nativeResolution: '3840 × 2160', displayTechnology: 'QD-LED (QLED)' } };
    const description = render.presentation(tv);
    assert.match(description.title, /Smart TV Samsung Vision AI 115" Neo QLED 4K QN90F/);
    assert.match(description.manufacturerUrl, /^https:\/\/www\.samsung\.com\/us\//);
    assert.equal(render.presentation({ ...tv, region: 'EU' }).manufacturerUrl, undefined, 'nome regional não é associado por prefixo');
    assert.equal(render.presentation({ ...tv, model: 'QN115QN90FF-OUTRO' }).manufacturerUrl, undefined);
    const described = render.describedConfig(tv);
    assert.match(described, /Smart TV Samsung Vision AI/);
    assert.match(described, /Modelo:.*QN115QN90FF/);
    assert.match(described, /114,4/);
    assert.match(described, /Ver produto no fabricante/);
    assert.doesNotMatch(described, /Horas por dia/);
    const documentedPower = { ...tv, profiles: [{ profile: { method: 'POWER_TIME', typicalPowerW: 80 }, source: tv.source }] };
    assert.match(render.describedConfig(documentedPower), /value="USAGE" selected="">Calcular pelo meu uso/);
    assert.match(render.describedConfig(documentedPower), /Horas por dia/);
    for (const typicalPowerW of [undefined, 0, NaN, Infinity]) {
      const unavailable = { ...tv, profiles: [{ profile: { method: 'POWER_TIME', typicalPowerW }, source: tv.source }] };
      assert.match(render.describedConfig(unavailable), /value="REFERENCE" selected="">Usar referência de ensaio/);
    }
    for (const source of [{ ...tv.source, official: false }, { ...tv.source, type: 'WATTSTATUS_GENERIC' }]) {
      const estimatedPower = { ...tv, profiles: [{ profile: { method: 'POWER_TIME', typicalPowerW: 80 }, source }] };
      assert.match(render.describedConfig(estimatedPower), /value="REFERENCE" selected="">Usar referência de ensaio/, 'potência sem fonte oficial não ativa o uso por padrão');
    }
    const noEnergyData = render.describedConfig({ ...tv, energyProfile: { method: 'POWER_TIME' }, profiles: [] });
    assert.match(noEnergyData, /Não encontramos potência elétrica oficial nem referência de ensaio/);
    assert.doesNotMatch(noEnergyData, /value="REFERENCE"/, 'não inventa referência quando a fonte não fornece energia');
    assert.equal(render.presentation({ ...tv, isGeneric: true }).title, tv.displayName);
    const unknown = { ...tv, brand: 'Outra marca', model: 'EXACT-123', specifications: undefined };
    assert.equal(render.presentation(unknown).title, unknown.displayName, 'sem dados mantém o nome original');
    assert.equal(render.presentation({ ...unknown, specifications: { screenSizeInches: 1778.9 } }).title, unknown.displayName);
    const ac = render.presentation({ ...unknown, subcategory: 'Ar-condicionado', specifications: { capacityBtuH: 8000, productType: 'Window', heatingMode: 'No', variableSpeedCompressor: 'Yes' }, variant: { voltage: 115 } });
    assert.match(ac.title, /8\.000 BTU\/h/);
    assert.ok(ac.details.includes('Instalação em janela'));
    assert.ok(ac.details.includes('Somente frio'));
    assert.ok(ac.details.includes('Compressor de velocidade variável'));
    const freezer = render.presentation({ ...unknown, subcategory: 'Freezer', specifications: { productType: 'Upright Freezer', volumeFt3: 13.8, defrostType: 'Automatic' } });
    assert.match(freezer.title, /Freezer vertical.*391 L/);
    assert.ok(freezer.details.includes('Degelo automático'));
    const unsafeText = render.describedConfig({ ...unknown, specifications: { displayTechnology: '<img src=x onerror=alert(1)>' } });
    assert.match(unsafeText, /&lt;img/);
    assert.doesNotMatch(unsafeText, /<img src=x/);
    const inherited = render.presentation({ ...unknown, specifications: { displayTechnology: 'constructor', productType: '__proto__' } });
    assert.ok(inherited.details.includes('Painel: constructor'));
    assert.equal(inherited.manufacturerUrl, undefined);
    const sourceInfo = render.sourceInfo({ type: 'ENERGY_STAR', reference: 'https://data.energystar.gov/api/v3/views/pd96-rr3d/export.csv',
      metrics: { value: 'https://data.energystar.gov/api/v3/views/pd96-rr3d/export.csv', typicalPowerW: 'https://data.energystar.gov/api/v3/views/pd96-rr3d/export.csv' } }, annualProfile);
    assert.equal(sourceInfo.url, 'https://data.energystar.gov/d/pd96-rr3d');
    assert.deepEqual(sourceInfo.metrics, ['Consumo anual de referência', 'Potência em funcionamento']);
    const mixedSource = render.sourceInfo({ type: 'PBE', reference: 'https://example.invalid/primary', metrics: { typicalPowerW: 'https://manufacturer.invalid/product' } }, annualProfile);
    assert.equal(mixedSource.entries[0].url, 'https://manufacturer.invalid/product');
    assert.equal(mixedSource.entries[0].complementary, true);
    assert.equal(render.sourceInfo({ type: 'MANUFACTURER', reference: 'javascript:alert(1)' }, annualProfile).url, undefined);
    assert.equal(render.sourceInfo({ type: 'MANUFACTURER', reference: 'https://example.invalid/specs.csv' }, annualProfile).url, undefined);
    const sourced = render.describedConfig({ ...tv, source: { ...tv.source, reference: 'https://data.energystar.gov/api/v3/views/pd96-rr3d/export.csv', metrics: { value: 'https://data.energystar.gov/api/v3/views/pd96-rr3d/export.csv' } } });
    assert.match(sourced, /Consumo anual de referência/);
    assert.doesNotMatch(sourced, /export\.csv|>value:/);
    const sourcedCard = render.card(annualProfile, { source: { ...tv.source, reference: 'https://data.energystar.gov/api/v3/views/pd96-rr3d/export.csv', metrics: { value: 'https://data.energystar.gov/api/v3/views/pd96-rr3d/export.csv' } } });
    assert.match(sourcedCard, /Consumo anual de referência/);
    assert.doesNotMatch(sourcedCard, /export\.csv|>value:/);
  } finally {
    await server.close();
  }
});
