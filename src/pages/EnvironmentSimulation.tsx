import { useEffect, useRef, useState } from "react";
import { FlaskConical, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { AppSidebar, SidebarProvider, SidebarTrigger } from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import CatalogDevicePicker from "@/components/CatalogDevicePicker";
import SimulationItemEditor from "@/components/simulation/SimulationItemEditor";
import SimulationResults from "@/components/simulation/SimulationResults";
import RegionalTariffHint from "@/components/RegionalTariffHint";
import { useRegionalTariffDefault } from "@/hooks/useRegionalTariff";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { apiRequest } from "@/lib/api";
import { normalizeSearch, STATE_TARIFFS } from "@/lib/energy";
import { copyRoomScenario, copySimulationItem, createSimulationScenario, editSimulationItem, simulationPayload } from "@/lib/simulation-draft";
import { simulationUsageSummary } from "@/lib/simulation-item";
import { ROOM_TYPES } from "@/types/property";
import type { SimulationCalculationResult, SimulationItem, SimulationRoomResponse, SimulationScenario, SimulationSources } from "../../backend/src/modules/simulations/simulations.types";
import type { CatalogDevice } from "../../backend/src/modules/catalog/catalog.types";

const numeric = (value: string) => value.trim() ? Number(value.replace(",", ".")) : NaN;
const errorText = (error: unknown) => error instanceof Error ? error.message : "Não foi possível concluir a operação. Tente novamente.";

function SimulationWorkspace() {
  const { user } = useAuth();
  const { preferences, loadedForUserId } = useUserPreferences();
  const [scenario, setScenario] = useState(() => createSimulationScenario());
  const [tariff, setTariff] = useState("");
  const tariffTouched = useRef(false);
  const [origin, setOrigin] = useState<"NEW" | "EXISTING_ENVIRONMENT">("NEW");
  const [sources, setSources] = useState<SimulationSources>();
  const [sourceError, setSourceError] = useState("");
  const [reload, setReload] = useState(0);
  const [propertyId, setPropertyId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState<"room" | "catalog" | "calculate" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SimulationCalculationResult>();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string>();
  const request = useRef<AbortController>();
  const revision = useRef(0);
  const resultRegion = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const itemButtons = useRef(new Map<string, HTMLButtonElement>());
  const tariffValue = numeric(tariff);
  const validTariff = Number.isFinite(tariffValue) && tariffValue >= 0 && tariffValue <= 100000;
  const ready = origin === "NEW" || (scenario.sourceType === origin && scenario.sourcePropertyId === propertyId && scenario.sourceRoomId === roomId);
  const editingItem = scenario.items.find((item) => item.id === editing);

  useEffect(() => {
    if (tariffTouched.current || origin !== "NEW" || loadedForUserId !== user.id) return;
    const saved = preferences.tariffValue ?? (preferences.tariffState ? STATE_TARIFFS[preferences.tariffState] : undefined);
    if (saved != null && Number.isFinite(saved) && saved >= 0) setTariff(String(saved));
  }, [loadedForUserId, origin, preferences.tariffState, preferences.tariffValue, user.id]);

  useEffect(() => {
    const controller = new AbortController();
    setSources(undefined); setSourceError("");
    apiRequest<SimulationSources>("/api/simulations/sources", { signal: controller.signal, skipErrorToast: true })
      .then((data) => { if (!controller.signal.aborted) setSources(data); })
      .catch((err: unknown) => { if (!controller.signal.aborted) setSourceError(errorText(err)); });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => () => { revision.current++; request.current?.abort(); }, []);
  const applyRegionalTariff = (suggestion: { rate: number }) => {
    tariffTouched.current = true; invalidate(); setTariff(String(suggestion.rate));
  };
  useRegionalTariffDefault(applyRegionalTariff, () => !tariffTouched.current && origin === "NEW");

  function invalidate() {
    revision.current++; request.current?.abort(); setBusy(null); setResult(undefined); setError("");
  }
  function replace(next: SimulationScenario) { invalidate(); setScenario(next); }
  function begin(operation: "room" | "catalog" | "calculate") {
    invalidate(); const controller = new AbortController(); request.current = controller; setBusy(operation);
    return { controller, version: revision.current };
  }
  function active(version: number, controller: AbortController) { return version === revision.current && !controller.signal.aborted; }
  function finishEditing() {
    const id = editing; setEditing(undefined);
    requestAnimationFrame(() => { if (id) itemButtons.current.get(id)?.focus(); });
  }
  function add(item: SimulationItem) {
    if (scenario.items.length >= 100) { setError("O cenário aceita até 100 itens; use a quantidade para unidades iguais."); return; }
    const copy = copySimulationItem(item);
    replace({ ...scenario, items: [...scenario.items, copy] }); setAdding(false); setEditing(copy.id);
  }
  async function loadRoom() {
    if (!propertyId || !roomId) return;
    const { controller, version } = begin("room");
    try {
      const response = await apiRequest<SimulationRoomResponse>(`/api/simulations/properties/${encodeURIComponent(propertyId)}/rooms/${encodeURIComponent(roomId)}`, { signal: controller.signal, skipErrorToast: true });
      if (!active(version, controller)) return;
      tariffTouched.current = true;
      setScenario(copyRoomScenario(response.scenario)); setTariff(String(response.scenario.tariffPerKwh));
    } catch (err) { if (active(version, controller)) setError(errorText(err)); }
    finally { if (active(version, controller)) setBusy(null); }
  }
  async function resolveCatalog(device: CatalogDevice) {
    const { controller, version } = begin("catalog");
    try {
      const response = await apiRequest<{ item: SimulationItem }>("/api/simulations/resolve", { method: "POST", headers: { "X-Wattstatus-User": user.id }, body: JSON.stringify({ catalogDeviceId: device.id }), signal: controller.signal, skipErrorToast: true });
      if (active(version, controller)) add(response.item);
    } catch (err) { if (active(version, controller)) setError(errorText(err)); }
    finally { if (active(version, controller)) setBusy(null); }
  }
  async function calculate() {
    if (!validTariff || !ready || !scenario.items.length) return;
    tariffTouched.current = true;
    const { controller, version } = begin("calculate");
    try {
      const response = await apiRequest<SimulationCalculationResult>("/api/simulations/calculate", { method: "POST", headers: { "X-Wattstatus-User": user.id }, body: JSON.stringify(simulationPayload({ ...scenario, tariffPerKwh: tariffValue })), signal: controller.signal, skipErrorToast: true });
      if (!active(version, controller)) return;
      setResult(response); requestAnimationFrame(() => resultRegion.current?.focus());
    } catch (err) { if (active(version, controller)) setError(errorText(err)); }
    finally { if (active(version, controller)) setBusy(null); }
  }
  const rooms = sources?.rooms.filter((room) => room.propertyId === propertyId) ?? [];
  const ownItems = sources?.appliances.filter((item) => normalizeSearch(item.name).includes(normalizeSearch(search))) ?? [];

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight">Simulação por ambiente</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Monte um ambiente com vários aparelhos e compare padrões de uso. Este cenário é temporário e não altera imóveis, aparelhos, preferências ou medições. Ao sair da página, ele será descartado.</p></div>
    {sourceError && <Alert variant="destructive"><AlertDescription>{sourceError} <Button size="sm" variant="outline" onClick={() => setReload((value) => value + 1)}>Recarregar fontes</Button></AlertDescription></Alert>}
    {!sources && !sourceError && <div role="status" aria-label="Carregando fontes"><Skeleton className="h-12 w-full" /><span className="sr-only">Carregando ambientes e aparelhos…</span></div>}
    <Card><CardHeader><CardTitle className="text-lg">Monte seu cenário</CardTitle><CardDescription>Comece vazio ou copie um ambiente cadastrado. As edições ficam apenas nesta página.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2"><Label htmlFor="simulation-origin">Ponto de partida</Label>
          <Select value={origin} onValueChange={(value: "NEW" | "EXISTING_ENVIRONMENT") => { setOrigin(value); replace(createSimulationScenario(validTariff ? tariffValue : 0)); }} disabled={!!busy}>
            <SelectTrigger id="simulation-origin"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="NEW">Novo ambiente</SelectItem><SelectItem value="EXISTING_ENVIRONMENT">Copiar ambiente cadastrado</SelectItem>
            </SelectContent></Select></div>
        {origin === "EXISTING_ENVIRONMENT" && <div className="grid items-end gap-4 sm:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="simulation-property">Imóvel</Label><Select value={propertyId} onValueChange={(value) => { invalidate(); setPropertyId(value); setRoomId(""); }} disabled={!sources || !!busy}>
            <SelectTrigger id="simulation-property"><SelectValue placeholder="Escolha o imóvel" /></SelectTrigger><SelectContent>{sources?.properties.map((property) => <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="simulation-room">Ambiente</Label><Select value={roomId} onValueChange={(value) => { invalidate(); setRoomId(value); }} disabled={!rooms.length || !!busy}>
            <SelectTrigger id="simulation-room"><SelectValue placeholder="Escolha o ambiente" /></SelectTrigger><SelectContent>{rooms.map((room) => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}</SelectContent></Select></div>
          <Button onClick={() => void loadRoom()} disabled={!roomId || !!busy}>{busy === "room" ? "Copiando…" : "Carregar cenário"}</Button>
          {sources && !sources.properties.length && <p className="text-sm text-muted-foreground sm:col-span-3">Você ainda não tem imóveis cadastrados. É possível simular um novo ambiente.</p>}
          {propertyId && !rooms.length && sources && <p className="text-sm text-muted-foreground sm:col-span-3">Este imóvel ainda não tem ambientes cadastrados.</p>}
        </div>}
        {ready && <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="simulation-name">Nome do cenário</Label><Input id="simulation-name" maxLength={120} value={scenario.name} placeholder="Exemplo: Sala do RH" className="focus:placeholder:text-transparent" onChange={(e) => replace({ ...scenario, name: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="simulation-tariff">Tarifa deste cenário (R$/kWh)</Label><Input id="simulation-tariff" inputMode="decimal" value={tariff} placeholder="Ex.: 0,82" onChange={(e) => { tariffTouched.current = true; invalidate(); setTariff(e.target.value); }} aria-describedby="simulation-tariff-help" aria-invalid={tariff !== "" && !validTariff} />
              <p id="simulation-tariff-help" className="text-xs text-muted-foreground">Use a tarifa da sua conta. Valor entre 0 e 100.000; não altera a tarifa cadastrada.</p></div>
            <div className="sm:col-span-2"><RegionalTariffHint onApply={applyRegionalTariff} /></div>
            {origin === "NEW" && <>
              <div className="space-y-2"><Label htmlFor="simulation-property-type">Tipo de local</Label><Select value={scenario.propertyType} onValueChange={(value: "RESIDENTIAL" | "BUSINESS") => replace({ ...scenario, propertyType: value })}><SelectTrigger id="simulation-property-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="RESIDENTIAL">Residencial</SelectItem><SelectItem value="BUSINESS">Comercial</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="simulation-environment-type">Tipo de ambiente</Label><Select value={scenario.environmentType} onValueChange={(value) => replace({ ...scenario, environmentType: value })}><SelectTrigger id="simulation-environment-type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ROOM_TYPES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            </>}
          </div>
          {scenario.sourceType === "EXISTING_ENVIRONMENT" && <p className="text-sm text-muted-foreground">Cópia independente de {sources?.rooms.find((room) => room.id === scenario.sourceRoomId)?.name ?? "ambiente cadastrado"}. Recarregar o ambiente substitui esta cópia.</p>}
        </>}
      </CardContent></Card>
    {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
    {ready && <Card><CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-lg">Aparelhos do cenário</CardTitle><CardDescription>{scenario.items.length}/100 itens. Cada item aceita até 1.000 unidades.</CardDescription></div>
      <Button ref={addButton} disabled={!sources || !!busy || scenario.items.length >= 100} onClick={() => setAdding(true)}><Plus className="mr-2 h-4 w-4" />Adicionar aparelho</Button></CardHeader>
      <CardContent className="space-y-3">{!scenario.items.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Seu cenário está vazio. Adicione aparelhos da sua conta ou da biblioteca para começar.</p>
        : scenario.items.map((item) => <div key={item.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><h2 className="break-words font-medium">{item.name}</h2><p className="mt-1 text-sm">Quantidade: {item.quantity} · {simulationUsageSummary(item)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.source === "USER_APPLIANCE" ? "Cópia de aparelho cadastrado" : "Biblioteca de aparelhos"} · perfil preservado na fonte</p>
            {item.measurementContext && <p className="mt-1 text-xs text-muted-foreground">Há medição histórica neste aparelho. Ela serve apenas de contexto e não projeta o consumo futuro.</p>}</div>
          <div className="flex shrink-0 gap-2"><Button ref={(node) => { if (node) itemButtons.current.set(item.id, node); else itemButtons.current.delete(item.id); }} size="sm" variant="outline" aria-label={`Editar uso e quantidade de ${item.name}`} onClick={() => setEditing(item.id)} disabled={!!busy}><Pencil className="mr-2 h-4 w-4" />Editar uso</Button>
            <Button size="icon" variant="ghost" aria-label={`Remover ${item.name} do cenário`} onClick={() => replace({ ...scenario, items: scenario.items.filter((entry) => entry.id !== item.id) })} disabled={!!busy}><Trash2 className="h-4 w-4" /></Button></div>
        </div>)}
        <Button className="mt-3 w-full sm:w-auto" onClick={() => void calculate()} disabled={!scenario.items.length || !validTariff || !!busy}>{busy === "calculate" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{busy === "calculate" ? "Calculando…" : "Calcular cenário"}</Button>
        {!validTariff && <p className="text-xs text-muted-foreground">Informe uma tarifa válida para calcular.</p>}
      </CardContent></Card>}
    {result && <div ref={resultRegion} tabIndex={-1} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><SimulationResults result={result} scenario={{ ...scenario, tariffPerKwh: tariffValue }} /></div>}
    <Dialog open={adding} onOpenChange={(open) => { if (!open && busy === "catalog") invalidate(); setAdding(open); }}>
      <DialogContent className="sm:max-w-5xl" onCloseAutoFocus={(event) => { event.preventDefault(); if (!editing) addButton.current?.focus(); }}>
        <DialogHeader><DialogTitle>Adicionar ao cenário</DialogTitle><DialogDescription>Escolha uma fonte. A inclusão cria somente uma cópia temporária.</DialogDescription></DialogHeader>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {busy === "catalog" && <p role="status" className="text-sm">Preparando cópia do aparelho…</p>}
        <Tabs defaultValue="own"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="own">Meus aparelhos</TabsTrigger><TabsTrigger value="catalog">Biblioteca</TabsTrigger></TabsList>
          <TabsContent value="own" className="space-y-3"><Label htmlFor="simulation-appliance-search">Buscar nos meus aparelhos</Label><Input id="simulation-appliance-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome do aparelho" />
            <div className="max-h-[50dvh] space-y-2 overflow-y-auto">{ownItems.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{simulationUsageSummary(item)}</p></div><Button size="sm" variant="outline" disabled={!!busy} aria-label={`Selecionar ${item.name}`} onClick={() => add(item)}>Selecionar</Button></div>)}
              {!ownItems.length && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum aparelho encontrado. Você também pode usar a biblioteca.</p>}</div>
          </TabsContent><TabsContent value="catalog"><CatalogDevicePicker disabled={!!busy} onSelect={(device) => void resolveCatalog(device)} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
    {editingItem && <SimulationItemEditor key={editingItem.id} item={editingItem} onCancel={finishEditing} onSave={(quantity, usage) => { replace(editSimulationItem(scenario, editingItem.id, quantity, usage)); finishEditing(); }} />}
  </div>;
}

export default function EnvironmentSimulation() {
  const { user } = useAuth();
  return <SidebarProvider><AppSidebar /><SidebarInset className="min-w-0"><header className="flex h-16 shrink-0 items-center gap-3 border-b px-4"><SidebarTrigger /><FlaskConical className="h-5 w-5 shrink-0 text-energy-green-light" aria-hidden="true" /><span className="font-semibold">Simulação por ambiente</span></header>
    <main className="container mx-auto min-w-0 max-w-7xl px-4 py-6 sm:py-8"><SimulationWorkspace key={user?.id ?? "no-session"} /></main>
  </SidebarInset></SidebarProvider>;
}
