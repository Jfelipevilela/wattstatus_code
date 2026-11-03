import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import Reconciler from "react-reconciler";
import ts from "typescript";

// Exercise the actual page state without starting Vite or sharing its dev cache.
// Network, identity and DOM-dependent components are the substituted boundaries.
const nativeRequire = createRequire(import.meta.url);
const load = (path, dependency = nativeRequire) => {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  new Function("require", "exports", code)(dependency, exports);
  return exports;
};
const renderer = Reconciler({
  supportsMutation: true, isPrimaryRenderer: false,
  getRootHostContext: () => ({}), getChildHostContext: () => ({}), getPublicInstance: (node) => node,
  prepareForCommit: () => null, resetAfterCommit() {},
  createInstance: (type, props) => ({ type, props, children: [], focus() {} }), createTextInstance: (text) => ({ text }),
  appendInitialChild: (parent, child) => parent.children.push(child), appendChild: (parent, child) => parent.children.push(child),
  appendChildToContainer: (parent, child) => parent.children.push(child),
  removeChild: (parent, child) => { parent.children = parent.children.filter((item) => item !== child); },
  removeChildFromContainer: (parent, child) => { parent.children = parent.children.filter((item) => item !== child); },
  insertBefore: (parent, child, before) => parent.children.splice(parent.children.indexOf(before), 0, child),
  insertInContainerBefore: (parent, child, before) => parent.children.splice(parent.children.indexOf(before), 0, child),
  prepareUpdate: (_node, _type, _old, next) => next, commitUpdate: (node, props) => { node.props = props; },
  commitTextUpdate: (node, _old, next) => { node.text = next; }, shouldSetTextContent: () => false,
  clearContainer: (container) => { container.children = []; }, finalizeInitialChildren: () => false,
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, now: Date.now,
  getCurrentEventPriority: () => 16, detachDeletedInstance() {},
});
const nodes = (node) => [node, ...(node.children ?? []).flatMap(nodes)];
const textOf = (node) => nodes(node).map((item) => item.text ?? "").join(" ");
const tick = async () => { await new Promise(setImmediate); renderer.flushPassiveEffects(); await new Promise(setImmediate); };
const host = (type) => React.forwardRef(({ children, ...props }, ref) => React.createElement(type, { ...props, ref }, children));
const hostModule = (overrides = {}) => new Proxy(overrides, { get: (module, name) => module[name] ??= host(String(name)) });

test("página isola contas, adota tarifa tardia e descarta respostas antigas após edição", async () => {
  let auth = { user: { id: "a" } };
  let preferences = { preferences: {}, loadedForUserId: undefined };
  const item = { id: "lamp", source: "USER_APPLIANCE", userApplianceId: "lamp", name: "Lâmpada",
    sourceFingerprint: "fixture", quantity: 1, defaultUsage: { power: 9, usageHours: 6, days: 30 },
    energyProfileSnapshot: { method: "POWER_TIME", typicalPowerW: 9 }, canEstimateByUsage: false };
  const original = structuredClone(item);
  const calls = [];
  const apiRequest = async (path, options = {}) => {
    if (path.endsWith("/sources")) return { properties: [], rooms: [], appliances: [item] };
    assert.equal(path, "/api/simulations/calculate", "Nenhuma escrita no cadastro deve ser solicitada");
    return new Promise((resolve) => calls.push({ options, resolve }));
  };
  const helpers = load("../src/lib/simulation-draft.ts");
  const Page = load("../src/pages/EnvironmentSimulation.tsx", (id) => {
    if (id === "react" || id === "react/jsx-runtime") return nativeRequire(id);
    if (id === "@/hooks/useAuth") return { useAuth: () => auth };
    if (id === "@/hooks/useUserPreferences") return { useUserPreferences: () => preferences };
    if (id === "@/hooks/useRegionalTariff") return { useRegionalTariffDefault: () => {} };
    if (id === "@/lib/api") return { apiRequest };
    if (id === "@/lib/simulation-draft") return helpers;
    if (id === "@/lib/simulation-item") return { simulationUsageSummary: () => "Uso do cenário" };
    if (id === "@/lib/energy") return { normalizeSearch: (s) => s.toLowerCase(), STATE_TARIFFS: { SP: .82 } };
    if (id === "@/types/property") return { ROOM_TYPES: { living: "Sala" } };
    if (id.endsWith("SimulationItemEditor")) return { default: host("item-editor") };
    if (id.endsWith("SimulationResults")) return { default: host("scenario-result") };
    if (id.endsWith("CatalogDevicePicker")) return { default: host("catalog-picker") };
    if (id.includes("/ui/dialog")) return hostModule({ Dialog: ({ open, children }) => open ? React.createElement("dialog", null, children) : null });
    if (id === "lucide-react" || id.includes("/components/")) return hostModule();
    throw new Error(`Unexpected dependency: ${id}`);
  }).default;
  const previousFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => { callback(); return 0; };
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, "", () => {}, null);
  const render = async () => { renderer.updateContainer(React.createElement(Page), root, null); await tick(); };
  const input = (id) => nodes(container).find((node) => node.props?.id === id);
  const button = (label) => nodes(container).find((node) => node.type === "Button" && textOf(node).trim() === label);
  const result = () => nodes(container).find((node) => node.type === "scenario-result");
  try {
    await render();
    assert.equal(input("simulation-tariff").props.value, "");
    assert.equal(input("simulation-name").props.value, "");
    assert.equal(input("simulation-name").props.placeholder, "Exemplo: Sala do RH");
    assert.match(input("simulation-name").props.className, /focus:placeholder:text-transparent/);
    preferences = { preferences: { tariffValue: 99 }, loadedForUserId: "b" }; await render();
    assert.equal(input("simulation-tariff").props.value, "", "Não usar tarifa de outra conta");
    preferences = { preferences: { tariffValue: 2 }, loadedForUserId: "a" }; await render();
    assert.equal(input("simulation-tariff").props.value, "2", "Aplicar preferência que chegou depois");
    button("Adicionar aparelho").props.onClick(); await tick();
    const select = nodes(container).find((node) => node.props?.["aria-label"] === "Selecionar Lâmpada");
    select.props.onClick(); await tick();
    nodes(container).find((node) => node.type === "item-editor").props.onSave(5, { power: 9, usageHours: 6, days: 30 }); await tick();
    const first = button("Calcular cenário").props.onClick(); await tick();
    assert.equal(calls.length, 1); assert.equal(JSON.parse(calls[0].options.body).items[0].quantity, 5);
    assert.equal(calls[0].options.headers["X-Wattstatus-User"], "a");
    preferences = { preferences: { tariffValue: 9 }, loadedForUserId: "a" }; await render();
    assert.equal(input("simulation-tariff").props.value, "2", "Preferência tardia não altera cálculo iniciado");
    input("simulation-tariff").props.onChange({ target: { value: "3" } }); await tick();
    assert.equal(calls[0].options.signal.aborted, true);
    calls[0].resolve({ monthlyKwh: 8.1, monthlyCost: 16.2, unavailableCount: 0, items: [] }); await first; await tick();
    assert.equal(result(), undefined, "Resposta antiga não reaparece mesmo quando a rede ignora abort");
    const second = button("Calcular cenário").props.onClick(); await tick();
    calls[1].resolve({ monthlyKwh: 8.1, monthlyCost: 24.3, unavailableCount: 0, items: [] }); await second; await tick();
    assert.equal(result().props.scenario.tariffPerKwh, 3);
    input("simulation-name").props.onChange({ target: { value: "Outro cenário" } }); await tick();
    assert.equal(result(), undefined, "Editar invalida resultado");
    auth = { user: { id: "b" } }; await render();
    assert.equal(input("simulation-tariff").props.value, "");
    assert.match(textOf(container), /Seu cenário está vazio/);
    assert.deepEqual(item, original, "A fonte original permanece intocada");
  } finally {
    renderer.updateContainer(null, root, null); renderer.flushPassiveEffects();
    globalThis.requestAnimationFrame = previousFrame;
  }
});
