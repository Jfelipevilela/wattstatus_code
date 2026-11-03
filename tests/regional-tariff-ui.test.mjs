import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import Reconciler from 'react-reconciler';
import { createServer } from './vite-test-server.mjs';

const renderer = Reconciler({
  supportsMutation:true,isPrimaryRenderer:false,getRootHostContext:()=>({}),getChildHostContext:()=>({}),getPublicInstance:n=>n,
  prepareForCommit:()=>null,resetAfterCommit(){},createInstance:(type,props)=>({type,props,children:[]}),createTextInstance:text=>({text}),
  appendInitialChild:(p,c)=>p.children.push(c),appendChild:(p,c)=>p.children.push(c),appendChildToContainer:(p,c)=>p.children.push(c),
  removeChild:(p,c)=>{p.children=p.children.filter(n=>n!==c);},removeChildFromContainer:(p,c)=>{p.children=p.children.filter(n=>n!==c);},
  insertBefore:(p,c,b)=>p.children.splice(p.children.indexOf(b),0,c),insertInContainerBefore:(p,c,b)=>p.children.splice(p.children.indexOf(b),0,c),
  prepareUpdate:(_n,_t,_old,next)=>next,commitUpdate:(n,p)=>{n.props=p;},commitTextUpdate:(n,_old,next)=>{n.text=next;},
  shouldSetTextContent:()=>false,clearContainer:p=>{p.children=[];},finalizeInitialChildren:()=>false,
  scheduleTimeout:setTimeout,cancelTimeout:clearTimeout,noTimeout:-1,now:Date.now,getCurrentEventPriority:()=>16,detachDeletedInstance(){},
});
const nodes=n=>[n,...(n.children??[]).flatMap(nodes)];
const text=n=>nodes(n).map(c=>c.text??'').join('');
const tick=async()=>{await new Promise(setImmediate);renderer.flushPassiveEffects();await new Promise(setImmediate);};

test('sugestão regional é compartilhada após consentimento e preserva edição manual e registros salvos',async()=>{
  const server=await createServer({cacheDir:'node_modules/.vite-regional-tariff-ui-test',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false}});
  const priorNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const priorWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  let requests=0,downloads=0,success,failure;
  const data=readFileSync(new URL('../public/geography/br-uf.json',import.meta.url),'utf8');
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{getCurrentPosition(ok,error){requests++;success=ok;failure=error;}}}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{fetch:async(url)=>{assert.equal(url,'/geography/br-uf.json');downloads++;return new Response(data);}}});
  const container={children:[]};
  const root=renderer.createContainer(container,0,null,false,null,'',()=>{},null);
  try{
    const {useRegionalTariffDefault}=await server.ssrLoadModule('/src/hooks/useRegionalTariff.ts');
    const {default:Hint}=await server.ssrLoadModule('/src/components/RegionalTariffHint.tsx');
    const {PropertyForm}=await server.ssrLoadModule('/src/components/properties/PropertyForm.tsx');
    const savedProperty={id:'saved-property',name:'Imóvel salvo',type:'house',state:'SP',tariffState:'SP',tariffValue:1.5};
    function Form({id,saved}){
      const [value,setValue]=React.useState(saved??'');
      const dirty=React.useRef(saved!==undefined);
      const apply=suggestion=>{dirty.current=true;setValue(String(suggestion.rate));};
      useRegionalTariffDefault(apply,()=>!dirty.current);
      return React.createElement('section',{id},
        React.createElement('input',{value,onChange:e=>{dirty.current=true;setValue(e.target.value);}}),
        React.createElement(Hint,{onApply:apply}));
    }
    const render=async(more=false)=>{renderer.updateContainer(React.createElement('div',null,
      React.createElement(Form,{key:'a',id:'a'}),React.createElement(Form,{key:'b',id:'b'}),
      React.createElement(Form,{key:'saved',id:'saved',saved:'2.5'}),more&&React.createElement(Form,{key:'later',id:'later'}),
      more&&React.createElement('section',{id:'property-new'},React.createElement(PropertyForm,{submitting:false,submitLabel:'Criar',onSubmit(){}})),
      more&&React.createElement('section',{id:'property-existing'},React.createElement(PropertyForm,{initial:savedProperty,submitting:false,submitLabel:'Salvar',onSubmit(){}}))),root,null);await tick();};
    const section=id=>nodes(container).find(n=>n.type==='section'&&n.props.id===id);
    const input=id=>nodes(section(id)).find(n=>n.type==='input');
    const button=(id,label)=>nodes(section(id)).find(n=>n.type==='button'&&text(n)===label);
    await render();assert.equal(requests,0,'Não solicitar localização na montagem');
    button('a','Usar minha localização').props.onClick();await tick();assert.equal(requests,1);
    assert.equal(button('b','Identificando região…').props.disabled,true);
    input('a').props.onChange({target:{value:'1.23'}});await tick();
    success({coords:{latitude:-16.6869,longitude:-49.2648,accuracy:100}});
    for(let i=0;i<20&&input('b').props.value!=='.76'&&input('b').props.value!=='0.76';i++)await tick();
    assert.equal(input('a').props.value,'1.23','Resposta tardia preserva edição do usuário');
    assert.equal(input('b').props.value,'0.76');assert.equal(input('saved').props.value,'2.5');
    assert.match(text(section('b')),/GO · Centro-Oeste/);
    await render(true);assert.equal(input('later').props.value,'0.76');assert.equal(requests,1,'Reutilizar sugestão sem nova permissão');
    const propertyField=(id,field)=>nodes(section(id)).find(n=>n.props?.id===field);
    assert.equal(propertyField('property-new','property-state').props.value,'GO');
    assert.equal(propertyField('property-new','property-tariff').props.value,'0.76','Inicialização do formulário real preserva a sugestão');
    assert.equal(propertyField('property-existing','property-state').props.value,'SP');
    assert.equal(propertyField('property-existing','property-tariff').props.value,'1.5','Imóvel salvo não é sobrescrito automaticamente');
    button('saved','Usar referência local').props.onClick();await tick();assert.equal(input('saved').props.value,'0.76','Registro só muda por ação explícita');
    button('a','Limpar localização').props.onClick();await tick();
    button('a','Usar minha localização').props.onClick();await tick();failure({code:1});await tick();
    assert.match(text(section('a')),/não autorizada/);assert.equal(input('a').props.value,'1.23');assert.equal(downloads,1);
  }finally{
    renderer.updateContainer(null,root,null);renderer.flushPassiveEffects();
    if(priorNavigator)Object.defineProperty(globalThis,'navigator',priorNavigator);else delete globalThis.navigator;
    if(priorWindow)Object.defineProperty(globalThis,'window',priorWindow);else delete globalThis.window;
    await server.close();
  }
});
