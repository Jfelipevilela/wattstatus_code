import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import Reconciler from "react-reconciler";
import { createServer } from "./vite-test-server.mjs";

// Use the React 18 renderer already bundled by react-three/fiber, without a DOM
// or browser dependency. HTTP is the only substituted application boundary.
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
const waitFor = async (predicate) => {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "O catálogo não atualizou dentro do prazo");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test("seletor de catálogo entrega o modelo sem abrir cadastro, preferências ou integração", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  const originalFetch = globalThis.fetch;
  const requests = [];
  const selected = [];
  const device = {
    id: "fixture-led", category: "lighting", subcategory: "Lâmpada",
    displayName: "Lâmpada de teste 9 W", aliases: [], region: "BR", verified: false, isGeneric: true,
    energyProfile: { method: "POWER_TIME", typicalPowerW: 9 },
    source: { type: "WATTSTATUS_GENERIC", reference: "https://example.invalid", verifiedAt: "2026-10-26T00:00:00Z" },
  };
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method ?? "GET" });
    assert.equal(options.method ?? "GET", "GET", "o seletor só pode fazer leituras");
    assert.match(String(url), /\/api\/device-catalog\?/);
    return new Response(JSON.stringify({
      devices: [device], total: 25, totalPages: 3, page: 1, limit: 12,
      categories: [{ id: "lighting", name: "Iluminação", icon: "lightbulb" }],
      brands: [], subcategories: ["Lâmpada"],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, "", () => {}, null);
  try {
    const { default: Picker } = await server.ssrLoadModule("/src/components/CatalogDevicePicker.tsx");
    const render = async (disabled = false) => {
      await new Promise((resolve) => renderer.updateContainer(
        React.createElement(Picker, { onSelect: (value) => selected.push(value), disabled }), root, null, resolve,
      ));
      renderer.flushPassiveEffects();
    };
    await render();
    assert.doesNotMatch(textOf(container), /Conectar dispositivo inteligente|Adicionar manualmente/);
    await waitFor(() => nodes(container).some((node) => node.props?.["aria-label"]?.startsWith("Selecionar Lâmpada")));
    const select = nodes(container).find((node) => node.props?.["aria-label"] === "Selecionar Lâmpada de teste 9 W");
    assert.ok(select, "o catálogo existente exibe o modelo retornado");
    select.props.onClick();
    renderer.flushPassiveEffects();
    assert.deepEqual(selected, [device]);
    assert.match(textOf(container), /Buscar na biblioteca/);
    assert.doesNotMatch(textOf(container), /Configuração do aparelho|Adicionar ao WattStatus|Conectar dispositivo inteligente|Adicionar manualmente/);
    assert.ok(requests.length > 0);
    assert.ok(requests.every((request) => request.method === "GET" && request.url.includes("/api/device-catalog?")));
    assert.match(requests[0].url, /page=1&limit=12/);

    await render(true);
    assert.equal(nodes(container).find((node) => node.type === "input" && node.props.type === "search").props.disabled, true);
    assert.equal(nodes(container).find((node) => node.type === "fieldset").props.disabled, true);
    const disabledSelection = nodes(container).find((node) => node.props?.["aria-label"] === "Selecionar Lâmpada de teste 9 W");
    assert.equal(disabledSelection.props.disabled, true);
    disabledSelection.props.onClick();
    assert.equal(selected.length, 1, "bloqueio também impede selecionar pelo handler");
  } finally {
    await new Promise((resolve) => renderer.updateContainer(null, root, null, resolve));
    renderer.flushPassiveEffects();
    globalThis.fetch = originalFetch;
    await server.close();
  }
});
