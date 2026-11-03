import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import Reconciler from "react-reconciler";
import { createServer } from "./vite-test-server.mjs";

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

test("editor valida entradas, converte minutos e aplica somente dados locais por método", async () => {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false },
    plugins: [{
      name: "editor-dialog-host", enforce: "pre",
      // Replace only primitives that require a browser DOM. The editor's state,
      // inputs, validation, profile choice and callbacks remain real.
      load: (id) => id.replaceAll("\\", "/").endsWith("/src/components/ui/select.tsx") ? `
        import React from 'react';
        const host = tag => ({ children, ...props }) => React.createElement(tag, props, children);
        export const Select = host('select-host');
        export const SelectTrigger = host('button');
        export const SelectValue = host('span');
        export const SelectContent = host('section');
        export const SelectGroup = host('div');
        export const SelectItem = host('option');
      ` : id.replaceAll("\\", "/").endsWith("/src/components/ui/dialog.tsx") ? `
        import React from 'react';
        const host = tag => ({ children, ...props }) => React.createElement(tag, props, children);
        export const Dialog = host('dialog');
        export const DialogContent = host('section');
        export const DialogHeader = host('header');
        export const DialogFooter = host('footer');
        export const DialogTitle = host('h2');
        export const DialogDescription = host('p');
        export const DialogIcon = host('span');
      ` : undefined,
    }],
  });
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("O editor não deve acessar a rede"); };
  const saved = [];
  let cancelled = 0;
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, "", () => {}, null);
  try {
    const { default: Editor } = await server.ssrLoadModule("/src/components/simulation/SimulationItemEditor.tsx");
    const item = {
      id: "lamp", source: "USER_APPLIANCE", userApplianceId: "lamp", sourceFingerprint: "fixture",
      name: "Lâmpada", quantity: 5, energyProfileSnapshot: { method: "POWER_TIME", typicalPowerW: 9 },
      defaultUsage: { power: 9, usageHours: 6, days: 30 }, canEstimateByUsage: false,
    };
    const original = structuredClone(item);
    const render = async (value) => {
      await new Promise((resolve) => renderer.updateContainer(React.createElement(Editor, {
        key: value.id, item: value, onSave: (quantity, usage) => saved.push({ quantity, usage }), onCancel: () => { cancelled++; },
      }), root, null, resolve));
      renderer.flushPassiveEffects();
    };
    const input = (suffix) => nodes(container).find((node) => node.type === "input" && node.props.id?.endsWith(`-${suffix}`));
    const submit = () => nodes(container).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    await render(item);
    input("quantity").props.onChange({ target: { value: "0" } });
    input("power").props.onChange({ target: { value: "" } });
    submit();
    assert.equal(saved.length, 0);
    assert.equal(input("quantity").props["aria-invalid"], true);
    assert.equal(input("power").props["aria-invalid"], true);
    assert.match(textOf(container), /Confira os campos indicados/);
    input("quantity").props.onChange({ target: { value: "5" } });
    input("power").props.onChange({ target: { value: "9" } });
    submit();
    assert.deepEqual(saved[0], { quantity: 5, usage: { power: 9, usageHours: 6, days: 30, standbyEnabled: false } });
    assert.deepEqual(item, original);

    await render({ ...item, id: "microwave", catalogSnapshot: {
      id: "catalog", displayName: "Micro-ondas", category: "cooking", subcategory: "Micro-ondas", aliases: [], region: "BR", verified: false, isGeneric: true,
      energyProfile: item.energyProfileSnapshot,
      source: { type: "WATTSTATUS_GENERIC", reference: "https://example.invalid", verifiedAt: "2026-10-26T00:00:00Z" },
    }, defaultUsage: { power: 1200, usageHours: .25, days: 30 } });
    assert.equal(input("time").props.value, "15");
    input("time").props.onChange({ target: { value: "30" } });
    submit();
    assert.equal(saved[1].usage.usageHours, .5);

    await render({ ...item, id: "washer", energyProfileSnapshot: { method: "PER_CYCLE", energyPerCycleKwh: .45 }, defaultUsage: { cyclesPerWeek: 5 }, usage: { cyclesPerMonth: 12 } });
    assert.equal(input("cycles").props.value, "12");
    assert.doesNotMatch(textOf(container), /Horas por dia|Dias por mês/);
    submit();
    assert.deepEqual(saved[2].usage, { cyclesPerMonth: 12 });

    await render({ ...item, id: "reference", canEstimateByUsage: true,
      energyProfileSnapshot: { method: "REFERENCE_PERIOD", value: 402, unit: "kWh", period: "YEAR" }, defaultUsage: {} });
    assert.match(textOf(container), /402,00 kWh\/ano/);
    assert.doesNotMatch(textOf(container), /Horas por dia|Dias por mês/);
    submit();
    assert.deepEqual(saved[3].usage, { estimateByUsage: false });
    nodes(container).find((node) => node.type === "select-host" && node.props.value === "REFERENCE").props.onValueChange("USAGE");
    assert.equal(input("power").props.value, "", "não inventa watts ao sair da referência");
    submit();
    assert.equal(saved.length, 4, "uso personalizado sem watts permanece inválido");
    input("power").props.onChange({ target: { value: "100" } });
    submit();
    assert.deepEqual(saved[4].usage, { estimateByUsage: true, power: 100, usageHours: 4, days: 30, standbyEnabled: false });
    nodes(container).find((node) => node.type === "select-host" && node.props.value === "USAGE").props.onValueChange("REFERENCE");
    submit();
    assert.deepEqual(saved[5].usage, { estimateByUsage: false }, "voltar à referência não envia horas nem escala anual arbitrária");
    nodes(container).find((node) => node.type === "button" && textOf(node).trim() === "Cancelar").props.onClick();
    assert.equal(cancelled, 1);
    assert.equal(networkCalls, 0);
  } finally {
    await new Promise((resolve) => renderer.updateContainer(null, root, null, resolve));
    renderer.flushPassiveEffects();
    globalThis.fetch = originalFetch;
    await server.close();
  }
});
