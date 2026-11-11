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
  createInstance: (type, props) => ({
    type,
    props,
    children: [],
    focus() {},
    scrollIntoView() {},
  }),
  createTextInstance: (text) => ({ text }),
  appendInitialChild: (parent, child) => parent.children.push(child),
  appendChild: (parent, child) => parent.children.push(child),
  appendChildToContainer: (parent, child) => parent.children.push(child),
  removeChild: (parent, child) => {
    parent.children = parent.children.filter((item) => item !== child);
  },
  removeChildFromContainer: (parent, child) => {
    parent.children = parent.children.filter((item) => item !== child);
  },
  insertBefore: (parent, child, before) =>
    parent.children.splice(parent.children.indexOf(before), 0, child),
  insertInContainerBefore: (parent, child, before) =>
    parent.children.splice(parent.children.indexOf(before), 0, child),
  prepareUpdate: (_node, _type, _old, next) => next,
  commitUpdate: (node, props) => {
    node.props = props;
  },
  commitTextUpdate: (node, _old, next) => {
    node.text = next;
  },
  shouldSetTextContent: () => false,
  clearContainer: (container) => {
    container.children = [];
  },
  finalizeInitialChildren: () => false,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  now: Date.now,
  getCurrentEventPriority: () => 16,
  detachDeletedInstance() {},
});
const nodes = (node) => [node, ...(node.children ?? []).flatMap(nodes)];
const textOf = (node) =>
  nodes(node)
    .map((item) => item.text ?? "")
    .join(" ");
const waitFor = async (predicate) => {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(
      Date.now() < deadline,
      "O catálogo não atualizou dentro do prazo",
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test("desligamento exige confirmação, congela escopo, impede duplo envio e apresenta resultados e erros sem trocar de conta", async () => {
  const server = await createServer({
    cacheDir: "node_modules/.vite-group-off-test",
    plugins: [
      {
        name: "group-off-boundaries",
        enforce: "pre",
        load(id) {
          const file = id.replaceAll("\\", "/");
          if (file.endsWith("/src/hooks/useAuth.tsx"))
            return `export const useAuth=()=>globalThis.__groupAuth;`;
          // The stream client keeps its contract: same URL, header and body as /power, plus live events.
          if (file.endsWith("/src/lib/power-stream.ts"))
            return `export const streamPower=(propertyId,userId,_token,body,onEvent)=>{globalThis.__onPowerEvent=onEvent;return globalThis.__offApi('/api/properties/'+propertyId+'/power',{method:'POST',headers:{'X-WattStatus-User':userId},body:JSON.stringify(body)});};`;
          if (file.endsWith("/src/lib/api.ts"))
            return `export const apiRequest=(...args)=>{if(args[0].endsWith("/preview")){const body=JSON.parse(args[1].body);if(!["on","off"].includes(body.action)||!body.scope.type||body.scope.scope)throw Error("Invalid preview contract");return globalThis.__powerPreview ? globalThis.__powerPreview() : Promise.resolve({controllableCount:4});}return globalThis.__offApi(...args);};`;
          // Substitute only the overlay/select DOM boundary. Test the real control state and callbacks.
          if (file.endsWith("/src/components/ui/alert-dialog.tsx"))
            return `import React from 'react';
      const Context=React.createContext(()=>{});
      export const AlertDialog=({open,onOpenChange,children})=>React.createElement(Context.Provider,{value:onOpenChange},open?React.createElement('div',{role:'alertdialog'},children):null);
      export const AlertDialogContent=({children})=>React.createElement('section',null,children);
      export const AlertDialogHeader=({children})=>React.createElement('header',null,children);
      export const AlertDialogTitle=({children})=>React.createElement('h2',null,children);
      export const AlertDialogDescription=({children})=>React.createElement('p',null,children);
      export const AlertDialogFooter=({children})=>React.createElement('footer',null,children);
      export const AlertDialogCancel=props=>{const close=React.useContext(Context);return React.createElement('button',{...props,onClick:()=>close(false)});};
      export const AlertDialogAction=props=>React.createElement('button',props);`;
          if (file.endsWith("/src/components/ui/select.tsx"))
            return `import React from 'react';
      export const Select=({value,onValueChange,children,disabled})=>React.createElement('select',{value,disabled,onChange:e=>onValueChange(e.target.value)},children);
      export const SelectTrigger=({children})=>React.createElement('span',null,children);
      export const SelectValue=()=>null;
      export const SelectContent=({children})=>React.createElement(React.Fragment,null,children);
      export const SelectGroup=SelectContent;
      export const SelectItem=({value,children})=>React.createElement('option',{value},children);`;
        },
      },
    ],
  });
  const { QueryClient, QueryClientProvider } =
    await import("@tanstack/react-query");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = { children: [] };
  const root = renderer.createContainer(
    container,
    0,
    null,
    false,
    null,
    "",
    () => {},
    null,
  );
  globalThis.__groupAuth = { user: { id: "account-a" }, token: undefined };
  let resolve,
    calls = [];
  globalThis.__offApi = (...args) => {
    calls.push(args);
    return new Promise((done) => {
      resolve = done;
    });
  };
  const props = {
    propertyId: "home",
    propertyName: "Casa",
    floors: [{ id: "floor", name: "Térreo", block: "Bloco A" }],
    rooms: [{ id: "room", name: "Sala" }],
  };
  try {
    const { GroupOffControl } = await server.ssrLoadModule(
      "/src/components/properties/GroupOffControl.tsx",
    );
    const render = (input = props) => {
      renderer.updateContainer(
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(GroupOffControl, input),
        ),
        root,
        null,
      );
      renderer.flushPassiveEffects();
    };
    const all = () => nodes(container);
    const buttons = (label) =>
      all().filter((n) => n.type === "button" && textOf(n).trim() === label);
    const click = (node) => {
      node.props.onClick({ preventDefault() {} });
      renderer.flushPassiveEffects();
    };
    render();
    click(buttons("Controlar aparelhos")[0]);
    assert.match(textOf(container), /Bloco\/local: Bloco A/);
    all()
      .find((n) => n.type === "select")
      .props.onChange({ target: { value: "floor:floor" } });
    assert.equal(calls.length, 0, "Abrir confirmação não envia comando");
    assert.match(textOf(container), /Pavimento: Bloco A \/ Térreo/);
    render({ ...props, floors: [] });
    await waitFor(() => textOf(container).includes("4 aparelhos controláveis"));
    const confirm = buttons("Desligar tudo").at(-1);
    click(confirm);
    click(confirm);
    assert.equal(calls.length, 1, "Repetir o callback não duplica comandos");
    assert.equal(calls[0][0], "/api/properties/home/power");
    assert.deepEqual(JSON.parse(calls[0][1].body), {
      action: "off", scope: { type: "floor", floorId: "floor" },
    });
    assert.equal(calls[0][1].headers["X-WattStatus-User"], "account-a");
    assert.match(textOf(container), /Desligando e conferindo cada aparelho/);
    // The queue appears as soon as the server lists the devices and updates per device.
    globalThis.__onPowerEvent({ type: "start", total: 2, items: [{ applianceId: "1", name: "Luz", state: "na-fila" }, { applianceId: "2", name: "TV", state: "na-fila" }] });
    await waitFor(() => textOf(container).includes("Na fila"));
    globalThis.__onPowerEvent({ type: "item", applianceId: "1", state: "desligado-confirmado" });
    globalThis.__onPowerEvent({ type: "item", applianceId: "2", state: "conferindo" });
    await waitFor(() => textOf(container).includes("Conferindo estado") && /1 de 2/.test(textOf(container)));
    assert.ok(buttons("Cancelar")[0].props.disabled);
    resolve({
      summary: {
        "desligado-confirmado": 1,
        "comando-enviado-sem-confirmacao": 1,
        falhou: 1,
        "nao-controlavel": 1,
      },
      results: [
        { applianceId: "1", name: "Luz", outcome: "desligado-confirmado" },
        {
          applianceId: "2",
          name: "TV",
          outcome: "comando-enviado-sem-confirmacao",
        },
        { applianceId: "3", name: "Ar", outcome: "falhou" },
        { applianceId: "4", name: "Manual", outcome: "nao-controlavel" },
      ],
    });
    await waitFor(() => textOf(container).includes("1 desligados e confirmados"));
    renderer.flushPassiveEffects();
    assert.doesNotMatch(textOf(container), /Enviaremos o comando/);
    assert.match(textOf(container), /1 sem confirmação, 1 falharam, 1 manuais/);
    for (const label of [
      "Desligado confirmado",
      "Comando enviado, sem confirmação",
      "Falhou",
      "Não controlável",
    ])
      assert.match(textOf(container), new RegExp(label));
    click(buttons("Fechar")[0]);
    render();
    click(buttons("Controlar aparelhos")[0]);
    globalThis.__offApi = async () => {
      throw new Error("Falha sintética");
    };
    await waitFor(() => textOf(container).includes("4 aparelhos controláveis"));
    click(buttons("Desligar tudo").at(-1));
    await waitFor(() => textOf(container).includes("Falha sintética"));
    assert.match(textOf(container), /Alguns comandos podem ter sido enviados/);
    click(buttons("Fechar")[0]);
    click(buttons("Controlar aparelhos")[0]);
    globalThis.__offApi = () =>
      new Promise((done) => {
        resolve = done;
      });
    await waitFor(() => textOf(container).includes("4 aparelhos controláveis"));
    click(buttons("Desligar tudo").at(-1));
    globalThis.__groupAuth = { user: { id: "account-b" } };
    render();
    resolve({
      results: [
        {
          applianceId: "private",
          name: "Privado da conta A",
          outcome: "falhou",
        },
      ],
      summary: { "desligado-confirmado": 0 },
    });
    await new Promise((done) => setTimeout(done, 10));
    assert.doesNotMatch(
      textOf(container),
      /Privado da conta A|Resultado do controle/,
    );
    // Empty scopes return a useful message instead of an empty list.
    click(buttons("Controlar aparelhos")[0]);
    globalThis.__offApi = async () => ({ results: [], summary: {} });
    await waitFor(() => textOf(container).includes("4 aparelhos controláveis"));
    click(buttons("Desligar tudo").at(-1));
    await waitFor(() =>
      textOf(container).includes("Nenhum aparelho neste escopo."),
    );
    assert.ok(all().some(node => node.type === "a" && node.props.href === "/apps"));
    click(buttons("Fechar")[0]);
    const roomProps = { ...props, room: { id: "room", name: "Sala" } };
    render(roomProps);
    const onCalls = [];
    globalThis.__offApi = async (...args) => { onCalls.push(args); return { results: [{ applianceId: "lamp", name: "Luz", outcome: "ligado-confirmado" }], summary: { "ligado-confirmado": 1 } }; };
    click(buttons("Ligar")[0]);
    assert.equal(onCalls.length, 0);
    await waitFor(() => textOf(container).includes("4 aparelhos controláveis para ligar"));
    click(buttons("Ligar tudo").at(-1));
    await waitFor(() => textOf(container).includes("Ligado confirmado"));
    assert.deepEqual(JSON.parse(onCalls[0][1].body), { action: "on", scope: { type: "room", roomId: "room" } });
    assert.match(textOf(container), /1 ligados e confirmados/);
    click(buttons("Fechar")[0]);
    globalThis.__powerPreview = async () => ({ controllableCount: 0 });
    click(buttons("Ligar")[0]);
    await waitFor(() => textOf(container).includes("0 aparelhos controláveis"));
    assert.equal(buttons("Ligar tudo").at(-1).props.disabled, true);
    click(buttons("Ligar tudo").at(-1));
    assert.equal(onCalls.length, 1);
    click(buttons("Cancelar")[0]);
    globalThis.__powerPreview = async () => { throw new Error("preview unavailable"); };
    click(buttons("Ligar")[0]);
    await waitFor(() => textOf(container).includes("Não foi possível verificar os aparelhos"));
    assert.equal(buttons("Ligar tudo").at(-1).props.disabled, true);
    assert.equal(onCalls.length, 1);
  } finally {
    renderer.updateContainer(null, root, null);
    renderer.flushPassiveEffects();
    client.clear();
    delete globalThis.__groupAuth;
    delete globalThis.__offApi;
    delete globalThis.__powerPreview;
    await server.close();
  }
});
