import ApplianceCard from "@/components/ApplianceCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  CircleAlert,
  CircleX,
  Edit,
  Grid3X3,
  List,
  Plus,
  Settings,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import React, { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface Appliance {
  id: number;
  name: string;
  power: number;
  status: "critical" | "normal" | "warning";
  usageHours: number;
  monthlyCost: number;
  monthlyConsumption: number;
  tariff: string;
  createdAt: string;
}

interface AppliancesTabProps {
  appliances: Appliance[];
  onEdit: (appliance: Appliance) => void;
  onDelete: (appliance: Appliance) => void;
  onAddAppliance: (appliance: {
    id: number;
    name: string;
    power: number;
    status: "critical" | "normal" | "warning";
    usageHours: number;
    monthlyCost: number;
    tariff: string;
    createdAt: string;
  }) => void;
  onNavigateToCalculator: () => void;
}

const AppliancesTab: React.FC<AppliancesTabProps> = ({
  appliances,
  onEdit,
  onDelete,
  onAddAppliance,
  onNavigateToCalculator,
}) => {
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const totalPower = appliances.reduce((sum, app) => sum + app.power, 0);
  const totalMonthlyConsumption = appliances.reduce(
    (sum, app) => sum + app.monthlyConsumption,
    0
  );
  const totalMonthlyCost = appliances.reduce(
    (sum, app) => sum + app.monthlyCost,
    0
  );
  const criticalCount = appliances.filter(
    (app) => app.status === "critical"
  ).length;
  const warningCount = appliances.filter(
    (app) => app.status === "warning"
  ).length;

  const totalPages = Math.ceil(appliances.length / itemsPerPage);
  const paginatedAppliances = appliances.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          Seus Aparelhos
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Gerencie e monitore todos os seus equipamentos elétricos
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-green-light ">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-energy-green-light/10 dark:bg-energy-green-light/5 rounded-lg">
              <Zap className="h-5 w-5 text-energy-green-dark dark:text-energy-green-light" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground dark:text-white ">
                Total Aparelhos
              </p>
              <p className="text-2xl font-bold text-energy-green-dark dark:text-energy-green-light">
                {appliances.length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-yellow">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-energy-yellow/10 dark:bg-energy-yellow/5 rounded-lg">
              <TrendingUp className="h-5 w-5 text-energy-yellow dark:text-energy-yellow" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground dark:text-white">
                Potência Total
              </p>
              <p className="text-2xl font-bold text-energy-yellow dark:text-energy-yellow">
                {totalPower}W
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-teal">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-energy-blue-light/10 dark:bg-energy-blue-light/5 rounded-lg">
              <Settings className="h-5 w-5 text-energy-teal dark:text-energy-teal" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground dark:text-white">
                Consumo Mensal
              </p>
              <p className="text-2xl font-bold text-energy-teal dark:text-energy-teal">
                {totalMonthlyConsumption.toFixed(2)} kWh
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-red ">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
              <Plus className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground dark:text-white">
                Alertas
              </p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {criticalCount + warningCount}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* View Toggle */}
      {appliances.length > 0 && (
        <div className="flex justify-center mb-6 p-4 rounded-lg">
          <div className="hidden sm:flex flex-col sm:flex-row rounded-lg gap-2 p-1 shadow-sm w-full max-w-xs">
            <Button
              variant={viewMode === "cards" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("cards")}
              className={cn(
                "flex items-center gap-2 hover:bg-energy-400 flex-1",
                viewMode === "cards" && "bg-energy-green-light"
              )}
            >
              <Grid3X3 className="h-4 w-4" />
              Cards
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-2 hover:bg-energy-400 flex-1",
                viewMode === "list" && "bg-energy-green-light"
              )}
            >
              <List className="h-4 w-4" />
              Lista
            </Button>
          </div>
        </div>
      )}

      {/* Appliances Display */}
      {appliances.length > 0 ? (
        viewMode === "cards" ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {paginatedAppliances.map((appliance) => (
                <ApplianceCard
                  key={appliance.id}
                  name={appliance.name}
                  power={appliance.power}
                  status={appliance.status}
                  usageHours={appliance.usageHours}
                  monthlyCost={appliance.monthlyCost}
                  monthlyConsumption={appliance.monthlyConsumption}
                  tariff={appliance.tariff}
                  onEdit={() => onEdit(appliance)}
                  onDelete={() => onDelete(appliance)}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <Pagination className="mt-8">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() =>
                        setCurrentPage(Math.max(1, currentPage - 1))
                      }
                      className={cn(
                        currentPage === 1 && "pointer-events-none opacity-50"
                      )}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() =>
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
                      }
                      className={cn(
                        currentPage === totalPages &&
                          "pointer-events-none opacity-50"
                      )}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        ) : (
          <>
            <Card className="bg-white dark:bg-muted">
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Potência</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Consumo Mensal</TableHead>
                      <TableHead>Custo Mensal</TableHead>
                      <TableHead>Tarifa</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedAppliances.map((appliance) => (
                      <TableRow
                        key={appliance.id}
                        className={cn(
                          appliance.status === "critical" &&
                            "animate-pulse bg-red-900/20 dark:bg-red-900/20"
                        )}
                      >
                        <TableCell className="font-medium">
                          {appliance.name}
                        </TableCell>
                        <TableCell>{appliance.power} W</TableCell>
                        <TableCell>
                          <div
                            className={cn(
                              "flex items-center gap-2",
                              appliance.status === "critical" && "animate-pulse"
                            )}
                          >
                            {appliance.status === "normal" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <CheckCircle className="h-5 w-5 text-energy-green-light" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Status normal</p>
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {appliance.status === "warning" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <CircleAlert className="h-5 w-5 text-orange-400" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Consumo acima do ideal</p>
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {appliance.status === "critical" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <CircleX className="h-5 w-5 text-energy-red " />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Consumo crítico!</p>
                                </TooltipContent>
                              </Tooltip>
                            )}

                            <span
                              className={cn(
                                "text-sm",
                                appliance.status === "normal"
                                  ? "text-energy-green-dark dark:text-energy-green-light"
                                  : appliance.status === "warning"
                                  ? "text-orange-400 dark:text-orange-400"
                                  : "text-energy-red dark:text-energy-red"
                              )}
                            >
                              {appliance.status === "normal"
                                ? "Normal"
                                : appliance.status === "warning"
                                ? "Atenção"
                                : "Crítico"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {appliance.monthlyConsumption.toFixed(2)} kWh
                        </TableCell>
                        <TableCell>
                          R$ {appliance.monthlyCost.toFixed(2)}
                        </TableCell>
                        <TableCell>{appliance.tariff}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEdit(appliance)}
                              className="h-8 w-8 p-0 hover:text-energy-yellow hover:bg-energy-yellow/20"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onDelete(appliance)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
            {totalPages > 1 && (
              <Pagination className="mt-8">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() =>
                        setCurrentPage(Math.max(1, currentPage - 1))
                      }
                      className={cn("cuisor-pointer",
                        currentPage === 1 && "pointer-events-none opacity-50"
                      )}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          className="cursor-pointer"
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                    
                      onClick={() =>
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
                      }
                      className={cn("cuisor-pointer",
                        currentPage === totalPages &&
                          "pointer-events-none opacity-50 "
                      )}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )
      ) : (
        <Card className="p-12 text-center bg-white dark:bg-muted">
          <div className="max-w-md mx-auto">
            <div className="w-24 h-24 bg-gradient-to-br from-energy-green-light to-blue-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Zap className="h-12 w-12 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">
              Nenhum aparelho cadastrado
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Adicione seus aparelhos elétricos para começar a monitorar o
              consumo de energia.
            </p>
            <Button
              onClick={onNavigateToCalculator}
              className="bg-gradient-to-r from-energy-green-light to-blue-800 hover:from-blue-800 hover:to-energy-green-light transition-all duration-300 transform hover:scale-105"
            >
              <Plus className="h-5 w-5 mr-2" />
              Adicionar Primeiro Aparelho
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AppliancesTab;
