import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import Reconciler from "react-reconciler";
import { createServer } from "./vite-test-server.mjs";

// Same DOM-free renderer as the other UI tests: HTTP is the only boundary swapped.
const renderer = Reconciler({
  supportsMutation: true,
  isPrimaryRenderer: false,
  getRootHostContext: () => ({}),
  getChildHostContext: () => ({}),
  getPublicInstance: (node) => node,
  prepareForCommit: () => null,
  resetAfterCommit() {},
  createInstance: (type, props) => ({ type, props, children: [], focus() {}, scrollIntoView() {} }),
  createTextInstance: (text) => ({ text }),
  appendInitialChild: (parent, child) => parent.children.push(child),
  appendChild: (parent, child) => parent.children.push(child),
  appendChildToContainer: (parent, child) => parent.children.push(child),
  removeChild: (parent, child) => { parent.children = parent.children.filter((item) => item !== child); },
  removeChildFromContainer: (parent, child) => { parent.children = parent.children.filter((item) => item !== child); },
  insertBefore: (parent, child, before) => parent.children.splice(parent.children.indexOf(before), 0, child),
  insertInContainerBefore: (parent, child, before) => parent.children.splice(parent.children.indexOf(before), 0, child),
  prepareUpdate: (_node, _type, _old, next) => next,
  commitUpdate: (node, props) => { node.props = props; },
  commitTextUpdate: (node, _old, next) => { node.text = next; },
  shouldSetTextContent: () => false,
  clearContainer: (container) => { container.children = []; },
  finalizeInitialChildren: () => false,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  now: Date.now,
  getCurrentEventPriority: () => 16,
  detachDeletedInstance() {},
});
const nodes = (node) => [node, ...(node.children ?? []).flatMap(nodes)];
const textOf = (node) => nodes(node).map((item) => item.text ?? "").join(" ");
const waitFor = async (predicate, label = "A tela não atualizou dentro do prazo") => {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, label);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test("descoberta de dispositivos lista SmartThings e Tuya e repassa o provedor escolhido", async () => {
  const server = await createServer({
    cacheDir: "node_modules/.vite-tuya-test",
    plugins: [{
      name: "tuya-boundaries",
      enforce: "pre",
      load(id) {
        const file = id.replaceAll("\\", "/");
        if (file.endsWith("/src/lib/api.ts"))
          return `export class ApiError extends Error{constructor(s,m){super(m);this.status=s;}}
            export const apiRequest=(...args)=>globalThis.__tuyaApi(...args);`;
      },
    }],
  });
  const { MemoryRouter } = await import("react-router-dom");
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, "", () => {}, null);
  const requested = [];
  globalThis.__tuyaApi = async (url) => {
    requested.push(url);
    if (url === "/api/integrations/smartthings/token") return { hasToken: true };
    if (url === "/api/integrations/tuya/status") return { projectConfigured: true, linked: true, method: "server-link" };
    if (url === "/api/integrations/smartthings/devices") return { devices: [{ id: "st-1", name: "TV da sala", brand: "Samsung", capabilities: ["switch"] }] };
    if (url === "/api/integrations/tuya/devices") return { devices: [{ id: "tuya1", name: "Tomada do ar", brand: "Tuya", model: "Positivo", capabilities: ["switch", "powerMeter"] }] };
    if (url === "/api/integrations/tuya/devices/tuya1/status")
      return { status: { online: true, raw: { components: { main: { powerMeter: { power: { value: 120, unit: "W" } } } } } } };
    throw new Error("unexpected " + url);
  };
  const selected = [];
  try {
    const { default: SmartDeviceDiscovery } = await server.ssrLoadModule("/src/components/SmartDeviceDiscovery.tsx");
    renderer.updateContainer(
      React.createElement(MemoryRouter, null, React.createElement(SmartDeviceDiscovery, { onSelect: (device) => selected.push(device) })),
      root, null,
    );
    renderer.flushPassiveEffects();
    const all = () => nodes(container);
    const buttons = (label) => all().filter((n) => n.type === "button" && textOf(n).trim() === label);
    await waitFor(() => textOf(container).includes("Conectado: Samsung SmartThings e Tuya / Smart Life"));
    buttons("Buscar dispositivos")[0].props.onClick();
    await waitFor(() => textOf(container).includes("2 dispositivo(s) encontrado(s)."));
    assert.match(textOf(container), /Tomada do ar/);
    assert.match(textOf(container), /Tuya \/ Smart Life/);
    const cards = all().filter((n) => n.type === "h3");
    assert.deepEqual(cards.map((n) => textOf(n).trim()), ["TV da sala", "Tomada do ar"]);
    buttons("Selecionar dispositivo")[1].props.onClick();
    await waitFor(() => selected.length === 1, "A seleção não chamou onSelect");
    assert.equal(selected[0].provider, "tuya");
    assert.equal(selected[0].power, 120);
    assert.ok(requested.includes("/api/integrations/tuya/devices/tuya1/status"));
    assert.ok(!requested.some((url) => url.includes("/smartthings/devices/tuya1")));
  } finally {
    renderer.updateContainer(null, root, null);
    await server.close();
  }
});

test("guia de conexão Tuya avisa quando o servidor não tem a integração habilitada", async () => {
  const server = await createServer({ cacheDir: "node_modules/.vite-tuya-test" });
  const { MemoryRouter } = await import("react-router-dom");
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, "", () => {}, null);
  try {
    const { ConnectTuya } = await server.ssrLoadModule("/src/components/tuya/ConnectTuya.tsx");
    const render = (projectConfigured) => {
      renderer.updateContainer(
        React.createElement(MemoryRouter, null, React.createElement(ConnectTuya, { projectConfigured })),
        root, null,
      );
      renderer.flushPassiveEffects();
    };
    render(false);
    assert.match(textOf(container), /ainda não está habilitada neste servidor/);
    assert.match(textOf(container), /Cadastre seus dispositivos/);
    assert.doesNotMatch(textOf(container), /senha/i.source === "senha" ? /Digite sua senha/ : /Digite sua senha/);
    render(true);
    assert.doesNotMatch(textOf(container), /ainda não está habilitada/);
    const anchors = nodes(container).filter((n) => n.type === "a");
    assert.match(textOf(container), /Dispositivos Tuya de qualquer marca/);
    assert.match(textOf(container), /Cor, temperatura, modo e outros recursos ainda não são controlados aqui/);
    const expectedLinks = [
      "https://apps.apple.com/app/smart-life-smart-living/id1115101477",
      "https://play.google.com/store/apps/details?id=com.tuya.smartlife",
      "https://apps.apple.com/app/tuya-smart/id1034649547",
      "https://play.google.com/store/apps/details?id=com.tuya.smart",
    ];
    assert.ok(!anchors.some((a) => a.props.href?.includes("smartlife.tuya.com")));
    const storeLinks = anchors.filter((a) => expectedLinks.includes(a.props.href));
    assert.deepEqual(storeLinks.map((a) => a.props.href).sort(), expectedLinks.sort());
    for (const anchor of storeLinks) {
      assert.equal(anchor.props.target, "_blank");
      assert.ok(anchor.props.rel.split(/\s+/).includes("noopener"));
      assert.ok(anchor.props.rel.split(/\s+/).includes("noreferrer"));
      assert.match(textOf(anchor), /Baixar (na App Store|no Google Play)/);
    }
  } finally {
    renderer.updateContainer(null, root, null);
    await server.close();
  }
});

test("painel Tuya descreve dispositivos e diferencia capacidades sem inventar categorias", async () => {
  const server = await createServer({
    cacheDir: "node_modules/.vite-tuya-panel-test",
    plugins: [{
      name: "tuya-panel-boundaries",
      enforce: "pre",
      load(id) {
        const file = id.replaceAll("\\", "/");
        if (file.endsWith("/src/hooks/useSmartThingsDevices.ts"))
          return `export const useIntegrationDevices=()=>globalThis.__tuyaPanel;`;
        if (file.endsWith("/src/hooks/useAppliances.ts"))
          return `export const useAppliances=()=>({appliances:[],addAppliance:async()=>{},updateAppliance:async()=>{}});`;
        if (file.endsWith("/src/hooks/useUserPreferences.tsx"))
          return `export const useUserPreferences=()=>({preferences:{},updatePreferences:async()=>{}});`;
        if (file.endsWith("/src/components/smartthings/ImportDeviceDialog.tsx"))
          return `export const ImportDeviceDialog=()=>null;`;
        if (file.endsWith("/src/components/smartthings/DeviceDetailsDialog.tsx"))
          return `export const DeviceDetailsDialog=()=>null;`;
      },
    }],
  });
  const { MemoryRouter } = await import("react-router-dom");
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, "", () => {}, null);
  globalThis.__tuyaPanel = {
    items: [], fetchedAt: null, loading: false, error: null, pending: {},
    refresh() {}, refreshDevice() {}, sendCommand: async () => true,
  };
  try {
    const { default: TuyaPanel } = await server.ssrLoadModule("/src/components/tuya/TuyaPanel.tsx");
    const render = () => {
      renderer.updateContainer(React.createElement(MemoryRouter, null, React.createElement(TuyaPanel)), root, null);
      renderer.flushPassiveEffects();
    };
    render();
    assert.match(textOf(container), /Seus dispositivos Tuya/);
    assert.match(textOf(container), /Nenhum dispositivo encontrado/);
    assert.match(textOf(container), /Adicione dispositivos no Smart Life ou Tuya Smart/);
    assert.match(textOf(container), /controle liga\/desliga exige uma chave/);
    assert.doesNotMatch(textOf(container), /[Tt]omadas/);
    globalThis.__tuyaPanel.items = [
      { id: "meter", name: "Medidor do quadro", capabilities: ["powerMeter", "energyMeter"] },
      { id: "switch", name: "Ventilador", capabilities: ["switch"] },
      { id: "generic", name: "Sensor da porta", capabilities: ["contactSensor"] },
    ].map((device) => ({ device: { ...device, brand: "Tuya" }, status: null, error: null }));
    render();
    assert.match(textOf(container), /Dispositivo com medição de energia/);
    assert.match(textOf(container), /Dispositivo com liga\/desliga/);
    assert.match(textOf(container), /Dispositivo Tuya/);
    assert.equal(nodes(container).filter((n) => n.type === "article").length, 3);
    assert.doesNotMatch(textOf(container), /Nenhum dispositivo encontrado/);
    for (const name of ["Medidor do quadro", "Ventilador", "Sensor da porta"])
      assert.ok(textOf(container).includes(name));
  } finally {
    renderer.updateContainer(null, root, null);
    delete globalThis.__tuyaPanel;
    await server.close();
  }
});
