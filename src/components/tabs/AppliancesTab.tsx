import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Grid3X3, List, Edit, Trash2 } from "lucide-react";
import ApplianceCard from "@/components/ApplianceCard";
import ApplianceCalculator from "@/components/ApplianceCalculator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Appliance, ApplianceInput } from "@/hooks/useAppliances";
import {
  estimateAppliance,
  formatNumber,
  formatCurrency,
  normalizeSearch,
} from "@/lib/energy";

interface Props {
  appliances: Appliance[];
  onEdit: (appliance: Appliance) => void;
  onDelete: (appliance: Appliance) => void;
  onAddAppliance: (appliance: ApplianceInput) => Promise<Appliance | void>;
  onNavigateToCalculator?: () => void;
  initialAddOpen?: boolean;
}
export default function AppliancesTab({
  appliances,
  onEdit,
  onDelete,
  onAddAppliance,
  initialAddOpen = false,
}: Props) {
  const [adding, setAdding] = useState(initialAddOpen);
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("cost");
  const [currentPage, setCurrentPage] = useState(1);
  const estimates = appliances.map((appliance) => ({
    appliance,
    ...estimateAppliance(appliance),
  }));
  const filtered = estimates
    .filter(
      ({ appliance }) =>
        normalizeSearch(appliance.name).includes(normalizeSearch(search)) &&
        (source === "all" ||
          (source === "connected"
            ? Boolean(appliance.integrationProvider)
            : !appliance.integrationProvider)),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.appliance.name.localeCompare(b.appliance.name, "pt-BR")
        : sort === "consumption"
          ? b.consumption - a.consumption
          : b.cost - a.cost,
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const page = Math.min(currentPage, pages);
  const visible = filtered.slice((page - 1) * 8, page * 8);
  const clearFilters = () => {
    setSearch("");
    setSource("all");
    setCurrentPage(1);
  };
  const selectClass =
    "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Seus aparelhos</h1>
          <p className="mt-2 text-muted-foreground">
            Encontre os maiores gastos e ajuste sua estimativa de consumo.
          </p>
        </div>
        <Dialog open={adding} onOpenChange={(open) => { if (!busy) setAdding(open); }}>
          <DialogTrigger asChild>
            <Button className="h-11 shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar aparelho
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Adicionar aparelho</DialogTitle>
              <DialogDescription>
                Escolha um modelo ou preencha os dados do seu equipamento.
              </DialogDescription>
            </DialogHeader>
            <ApplianceCalculator
              onAddAppliance={onAddAppliance}
              onSaved={() => setAdding(false)}
              onBusyChange={setBusy}
            />
          </DialogContent>
        </Dialog>
      </div>
      {appliances.length === 0 ? (
        <Card className="space-y-4 p-6 text-center sm:p-10">
          <h2 className="text-xl font-semibold">
            Comece pelo seu primeiro aparelho
          </h2>
          <p className="mx-auto max-w-lg text-muted-foreground">
            Cadastre um equipamento para estimar seus gastos ou conecte uma
            integração para importar dispositivos.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button className="h-11" onClick={() => setAdding(true)}>
              Cadastrar primeiro aparelho
            </Button>
            <Button asChild variant="outline" className="h-11">
              <Link to="/apps">Conectar integração</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Aparelhos cadastrados",
                value: formatNumber(appliances.length, 0),
              },
              {
                label: "Consumo mensal estimado",
                value: `${formatNumber(estimates.reduce((sum, row) => sum + row.consumption, 0))} kWh`,
              },
              {
                label: "Custo mensal estimado",
                value: formatCurrency(
                  estimates.reduce((sum, row) => sum + row.cost, 0),
                ),
              },
            ].map((item) => (
              <Card key={item.label} className="min-w-0 p-5">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 break-words text-2xl font-bold">
                  {item.value}
                </p>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Estimativas de todos os aparelhos, calculadas com os dias de uso
            cadastrados. Leituras importadas aparecem separadamente nos detalhes
            de cada aparelho.
          </p>
          <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2 lg:col-span-2">
              <Label htmlFor="appliance-search">Buscar aparelho</Label>
              <Input
                id="appliance-search"
                type="search"
                placeholder="Digite o nome do aparelho"
                className="h-11"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appliance-source">Origem</Label>
              <select
                id="appliance-source"
                className={selectClass}
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">Todos os aparelhos</option>
                <option value="manual">Cadastro manual</option>
                <option value="connected">Integrações</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appliance-sort">Ordenar por</Label>
              <select
                id="appliance-sort"
                className={selectClass}
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="cost">Maior custo estimado</option>
                <option value="consumption">Maior consumo estimado</option>
                <option value="name">Nome (A–Z)</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-muted-foreground">
              {filtered.length} de {appliances.length} aparelhos
            </p>
            <div
              className="flex gap-2"
              role="group"
              aria-label="Visualização dos aparelhos"
            >
              <Button
                variant={viewMode === "cards" ? "default" : "outline"}
                aria-pressed={viewMode === "cards"}
                className="h-11"
                onClick={() => setViewMode("cards")}
              >
                <Grid3X3 className="mr-2 h-4 w-4" />
                Cartões
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                aria-pressed={viewMode === "list"}
                className="h-11"
                onClick={() => setViewMode("list")}
              >
                <List className="mr-2 h-4 w-4" />
                Lista
              </Button>
            </div>
          </div>
          {filtered.length === 0 ? (
            <Card className="space-y-3 p-8 text-center">
              <h2 className="font-semibold">Nenhum aparelho encontrado</h2>
              <p className="text-sm text-muted-foreground">
                Tente outro nome ou remova o filtro de origem.
              </p>
              <Button variant="outline" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </Card>
          ) : viewMode === "cards" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map(({ appliance }) => (
                <ApplianceCard
                  key={appliance.id}
                  {...appliance}
                  onEdit={() => onEdit(appliance)}
                  onDelete={() => onDelete(appliance)}
                />
              ))}
            </div>
          ) : (
            <Card className="min-w-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aparelho</TableHead>
                    <TableHead>Consumo estimado/mês</TableHead>
                    <TableHead>Custo estimado/mês</TableHead>
                    <TableHead>Origem / leitura</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map(({ appliance, consumption, cost }) => (
                    <TableRow key={appliance.id}>
                      <TableCell className="font-medium">
                        {appliance.name}
                      </TableCell>
                      <TableCell>{formatNumber(consumption)} kWh</TableCell>
                      <TableCell>{formatCurrency(cost)}</TableCell>
                      <TableCell>
                        {appliance.integrationProvider || "Manual"}
                        {appliance.measuredConsumptionKWh > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Medido:{" "}
                            {formatNumber(appliance.measuredConsumptionKWh)} kWh
                            (período não informado)
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11"
                            aria-label={`Editar ${appliance.name}`}
                            onClick={() => onEdit(appliance)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-destructive"
                            aria-label={`Excluir ${appliance.name}`}
                            onClick={() => onDelete(appliance)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          {pages > 1 && (
            <nav
              aria-label="Paginação dos aparelhos"
              className="flex items-center justify-center gap-3"
            >
              <Button
                variant="outline"
                className="h-11"
                disabled={page === 1}
                onClick={() => setCurrentPage(page - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm">
                Página {page} de {pages}
              </span>
              <Button
                variant="outline"
                className="h-11"
                disabled={page === pages}
                onClick={() => setCurrentPage(page + 1)}
              >
                Próxima
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
