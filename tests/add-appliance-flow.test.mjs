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

test("voltar à biblioteca preserva rascunho por modelo e só confirma depois de salvar", async () => {
  const server = await createServer({ cacheDir: 'node_modules/.vite-add-flow-test', server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [{name:'flow-context',enforce:'pre',load(id){
      if(id.replaceAll('\\','/').endsWith('/src/hooks/useAuth.tsx')) return `export const useAuth=()=>({token:null,user:{id:'fixture'}});`;
      if(id.replaceAll('\\','/').endsWith('/src/hooks/useUserPreferences.tsx')) return `export const useUserPreferences=()=>({preferences:{tariffState:'SP',tariffValue:.82},updatePreferences:async()=>{}});`;
    }}],
  });
  const originalFetch=globalThis.fetch;
  const device={id:'fixture-led',category:'lighting',subcategory:'Lâmpada',displayName:'Lâmpada de teste 9 W',aliases:[],region:'BR',verified:false,isGeneric:true,
    energyProfile:{method:'POWER_TIME',typicalPowerW:9},source:{type:'WATTSTATUS_GENERIC',reference:'https://example.invalid',verifiedAt:'2026-10-26T00:00:00Z'}};
  globalThis.fetch=async(url)=>new Response(JSON.stringify(String(url).includes('/auth/csrf')?{csrfToken:'synthetic-csrf'}:String(url).includes('/calculations/')?{result:{consumptionKWh:1.62,cost:1.3284}}:
    {devices:[device],total:1,totalPages:1,page:1,limit:12,categories:[{id:'lighting',name:'Iluminação',icon:'lightbulb'}],brands:[],subcategories:['Lâmpada']}),{status:200,headers:{'Content-Type':'application/json'}});
  const container={children:[]};
  const root=renderer.createContainer(container,0,null,false,null,'',()=>{},null);
  let closed=0;const created=[];let saveFailure=true,attempts=0;
  try{
    const {default:Flow}=await server.ssrLoadModule('/src/components/AddApplianceFlow.tsx');
    renderer.updateContainer(React.createElement(Flow,{onAddAppliance:async(input)=>{attempts++;if(saveFailure)throw new Error('Falha sintética de gravação');created.push(input);return {...input,id:'created'};},onSaved:()=>{closed++;},onBusyChange:()=>{}}),root,null);
    renderer.flushPassiveEffects();
    const all=()=>nodes(container);
    const button=(label)=>all().find(n=>n.type==='button'&&textOf(n).trim()===label);
    const select=()=>all().find(n=>n.type==='button'&&n.props['aria-label']?.startsWith('Selecionar Lâmpada'));
    const input=(suffix)=>all().find(n=>n.type==='input'&&n.props.id?.endsWith('-'+suffix));
    await waitFor(()=>select());select().props.onClick();renderer.flushPassiveEffects();
    input('name').props.onChange({target:{value:'Lâmpada da sala'}});
    input('hours').props.onChange({target:{value:'6'}});renderer.flushPassiveEffects();
    button('Escolher outro aparelho').props.onClick();renderer.flushPassiveEffects();
    select().props.onClick();renderer.flushPassiveEffects();
    assert.equal(input('name').props.value,'Lâmpada da sala');
    assert.equal(input('hours').props.value,'6','Voltar e selecionar o mesmo modelo conserva o uso');
    const form=all().find(n=>n.type==='form'&&n.props.onSubmit&&nodes(n).includes(input('name')));
    await form.props.onSubmit({preventDefault(){}});renderer.flushPassiveEffects();
    assert.match(textOf(container),/Falha sintética de gravação/);
    assert.equal(input('name').props.value,'Lâmpada da sala');assert.equal(created.length,0);assert.equal(closed,0);
    saveFailure=false;
    const first=form.props.onSubmit({preventDefault(){}});
    const duplicate=form.props.onSubmit({preventDefault(){}});
    await Promise.all([first,duplicate]);renderer.flushPassiveEffects();
    await waitFor(()=>textOf(container).includes('Aparelho adicionado'));
    assert.equal(created.length,1);assert.equal(created[0].name,'Lâmpada da sala');assert.equal(attempts,2,'Duplo clique não gera segunda gravação');
    assert.equal(closed,0,'Sucesso é visível antes de concluir');
    button('Concluir').props.onClick();assert.equal(closed,1);
  }finally{renderer.updateContainer(null,root,null);renderer.flushPassiveEffects();globalThis.fetch=originalFetch;await server.close();}
});

