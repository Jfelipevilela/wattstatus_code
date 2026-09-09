import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Download,
  Calendar,
  Loader2,
  ArrowUpDown,
  Filter,
  User,
  Clock,
  Zap,
  DollarSign,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Appliance } from "@/hooks/useAppliances";
import { useAuth } from "@/hooks/useAuth";
import { estimateAppliance, getMonthlyEstimate, formatNumber } from "@/lib/energy";
import { apiRequest } from "@/lib/api";

interface ReportsTabProps {
  appliances: Appliance[];
}

interface ReportData {
  applianceName: string;
  power: number;
  usageHours: number;
  daysInMonth: number;
  tariff: string;
  tariffValue: number;
  consumption: number;
  cost: number;
}

const ReportsTab: React.FC<ReportsTabProps> = ({ appliances }): JSX.Element => {
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedAppliance, setSelectedAppliance] = useState<string>("all");
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [sortColumn, setSortColumn] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [generationTime, setGenerationTime] = useState<string>("");
  const [hasGeneratedReport, setHasGeneratedReport] = useState(false);

  const { user, token } = useAuth();

  const recordReportEvent = (
    event:
      | "generation_started"
      | "generation_completed"
      | "generation_failed"
      | "export_started"
      | "export_completed"
      | "export_failed",
    fields: { itemCount?: number; durationMs?: number } = {}
  ) => {
    void apiRequest(
      "/api/reports/events",
      {
        method: "POST",
        body: JSON.stringify({ event, ...fields }),
        skipErrorToast: true,
      },
      token || undefined
    ).catch(() => undefined);
  };

  // Initialize with current month/year
  useEffect(() => {
    const now = new Date();
    setSelectedMonth((now.getMonth() + 1).toString().padStart(2, "0"));
    setSelectedYear(now.getFullYear().toString());
  }, []);

  // A result and its export must correspond to the currently selected filters.
  useEffect(() => {
    setReportData([]);
    setHasGeneratedReport(false);
  }, [selectedMonth, selectedYear, selectedAppliance, appliances]);

  const getDaysInMonth = (month: number, year: number): number => {
    return new Date(year, month, 0).getDate();
  };

  const generateReport = async () => {
    if (!selectedMonth || !selectedYear) {
      toast({
        title: "Erro ao gerar relatório",
        description: "Selecione mês e ano para gerar o relatório.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    const startedAt = Date.now();
    recordReportEvent("generation_started");

    try {
      const month = parseInt(selectedMonth, 10);
      const year = parseInt(selectedYear, 10);
      const daysInMonth = getDaysInMonth(month, year);

      const availableIds = new Set(getMonthlyEstimate(appliances, year, month).rows.map((row) => row.id));
      const filteredAppliances = appliances.filter((app) => {
        const matchesPeriod = availableIds.has(app.id);
        const matchesAppliance =
          selectedAppliance === "all" || app.id === selectedAppliance;
        return matchesPeriod && matchesAppliance;
      });

      const data: ReportData[] = filteredAppliances.map((appliance) => {
        const { consumption, cost } = estimateAppliance(appliance, daysInMonth);
        const tariffValue = consumption > 0 ? cost / consumption : 0;

        return {
          applianceName: appliance.name,
          power: appliance.power,
          usageHours: appliance.usageHours,
          daysInMonth: Math.min(appliance.days, daysInMonth),
          tariff: appliance.tariff,
          tariffValue,
          consumption,
          cost,
        };
      });

      setGenerationTime(new Date().toLocaleString("pt-BR"));
      setHasGeneratedReport(true);
      setIsGenerating(false);
      recordReportEvent("generation_completed", {
        itemCount: data.length,
        durationMs: Date.now() - startedAt,
      });

      if (data.length === 0) {
        setReportData([]);
        toast({
          title: "Nenhum aparelho encontrado no período",
          description:
            'Tente outro mês/ano ou selecione "Todos os aparelhos" para gerar o relatório.',
        });
        return;
      }

      setReportData(data);

      toast({
        title: "Relatório gerado com sucesso!",
        description: `Relatório de ${month}/${year} gerado com ${data.length} aparelho(s).`,
      });
    } catch {
      setIsGenerating(false);
      recordReportEvent("generation_failed", {
        durationMs: Date.now() - startedAt,
      });
      toast({
        title: "Erro ao gerar relatório",
        description: "Não foi possível gerar o relatório.",
        variant: "destructive",
      });
    }
  };

  const exportToPDF = async () => {
    if (reportData.length === 0) {
      toast({
        title: "Erro na exportação",
        description: "Gere um relatório antes de exportar.",
        variant: "destructive",
      });
      return;
    }

    const startedAt = Date.now();
    recordReportEvent("export_started", { itemCount: reportData.length });
    try {
      const jsPDF = (await import("jspdf")).default;
      const pdf = new jsPDF({ orientation: "landscape" });

      // Title
      pdf.setFontSize(20);
      pdf.text("Relatório Mensal de Consumo Estimado", 20, 30);

      // Client info
      pdf.setFontSize(12);
      pdf.text(`Cliente: ${user?.name || "Usuário"}`, 20, 50);
      pdf.text(`Email: ${user?.email || "usuario@email.com"}`, 20, 60);
      pdf.text(`Mês/Ano: ${selectedMonth}/${selectedYear}`, 20, 70);
      pdf.text(`Data de geração: ${generationTime}`, 20, 80);

      pdf.setFontSize(9);
      pdf.text("Estimativa com os dados atuais de uso e tarifa; não representa medição histórica.", 20, 90);

      // Table header
      let yPosition = 100;
      pdf.setFontSize(10);
      pdf.text("Aparelho", 20, yPosition);
      pdf.text("Potência (W)", 80, yPosition);
      pdf.text("Horas/Dia", 120, yPosition);
      pdf.text("Dias", 150, yPosition);
      pdf.text("Consumo (kWh)", 170, yPosition);
      pdf.text("Custo (R$)", 220, yPosition);

      // Table data
      yPosition += 10;
      reportData.forEach((item) => {
        pdf.text(item.applianceName.substring(0, 15), 20, yPosition);
        pdf.text(item.power.toString(), 80, yPosition);
        pdf.text(formatNumber(item.usageHours), 120, yPosition);
        pdf.text(item.daysInMonth.toString(), 150, yPosition);
        pdf.text(formatNumber(item.consumption), 170, yPosition);
        pdf.text(formatNumber(item.cost), 220, yPosition);
        yPosition += 10;

        if (yPosition > 180) {
          pdf.addPage();
          yPosition = 30;
        }
      });

      // Totals
      const totalConsumption = reportData.reduce(
        (sum, item) => sum + item.consumption,
        0
      );
      const totalCost = reportData.reduce((sum, item) => sum + item.cost, 0);

      yPosition += 10;
      pdf.setFontSize(12);
      pdf.text(
        `Total Consumo: ${formatNumber(totalConsumption)} kWh`,
        20,
        yPosition
      );
      pdf.text(`Total Custo: R$ ${formatNumber(totalCost)}`, 150, yPosition);

      pdf.save(`relatorio_${selectedMonth}_${selectedYear}.pdf`);
      recordReportEvent("export_completed", {
        itemCount: reportData.length,
        durationMs: Date.now() - startedAt,
      });

      toast({
        title: "PDF exportado com sucesso!",
        description: "O relatório foi salvo em PDF.",
      });
    } catch (error) {
      recordReportEvent("export_failed", {
        itemCount: reportData.length,
        durationMs: Date.now() - startedAt,
      });
      toast({
        title: "Erro na exportação",
        description: "Não foi possível exportar o PDF.",
        variant: "destructive",
      });
    }
  };

  const sortData = (column: string) => {
    const direction =
      sortColumn === column && sortDirection === "asc" ? "desc" : "asc";
    setSortColumn(column);
    setSortDirection(direction);

    const sorted = [...reportData].sort((a, b) => {
      let aValue: string | number = a[column as keyof ReportData];
      let bValue: string | number = b[column as keyof ReportData];

      if (typeof aValue === "string" && typeof bValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (direction === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setReportData(sorted);
  };

  const totalConsumption = reportData.reduce(
    (sum, item) => sum + item.consumption,
    0
  );
  const totalCost = reportData.reduce((sum, item) => sum + item.cost, 0);

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          Relatórios Mensais
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Gere relatórios de consumo e custo estimados por aparelho
        </p>
      </div>

      <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Estimativas para um mês completo, com potência, tempo de uso e tarifa cadastrados atualmente.
        Os dias de uso respeitam o limite do mês. Leituras importadas não entram neste relatório;
        alterações no cadastro podem mudar projeções de meses anteriores.
      </p>
      {/* Controls */}
      <Card className="p-6">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-energy-green-light" />
            Configurações do Relatório
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label htmlFor="report-month" className="block text-sm font-medium mb-2">Mês</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger id="report-month">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem
                      key={i + 1}
                      value={(i + 1).toString().padStart(2, "0")}
                    >
                      {new Date(0, i).toLocaleString("pt-BR", {
                        month: "long",
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="report-year" className="block text-sm font-medium mb-2">Ano</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger id="report-year">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 7 }, (_, i) => (
                    <SelectItem key={i} value={(new Date().getFullYear() - 5 + i).toString()}>
                      {new Date().getFullYear() - 5 + i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="report-appliance" className="block text-sm font-medium mb-2">Aparelho</label>
              <Select
                value={selectedAppliance}
                onValueChange={setSelectedAppliance}
              >
                <SelectTrigger id="report-appliance">
                  <SelectValue placeholder="Todos os aparelhos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os aparelhos</SelectItem>
                  {appliances.map((appliance) => (
                    <SelectItem key={appliance.id} value={appliance.id}>
                      {appliance.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={generateReport}
                disabled={isGenerating}
                className="h-11 w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Gerar Relatório
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Display */}
      {reportData.length > 0 && (
        <Card className="p-6">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
              <CardTitle className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-energy-green-dark" />
                Relatório de {selectedMonth}/{selectedYear}
              </CardTitle>
              <Button onClick={exportToPDF} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Exportar PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Client Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-500" />
                <span className="text-sm">
                  <strong>Cliente:</strong> {user?.name || "Usuário"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <span className="text-sm">
                  <strong>Gerado em:</strong> {generationTime}
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => sortData("applianceName")}
                    >
                      <div className="flex items-center gap-2">
                        Aparelho
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => sortData("power")}
                    >
                      <div className="flex items-center gap-2">
                        Potência (W)
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Horas/Dia</TableHead>
                    <TableHead>Dias no Mês</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => sortData("consumption")}
                    >
                      <div className="flex items-center gap-2">
                        Consumo (kWh)
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => sortData("cost")}
                    >
                      <div className="flex items-center gap-2">
                        Custo (R$)
                        <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {item.applianceName}
                      </TableCell>
                      <TableCell>{item.power}</TableCell>
                      <TableCell>{formatNumber(item.usageHours)}</TableCell>
                      <TableCell>{item.daysInMonth}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.tariff}</Badge>
                      </TableCell>
                      <TableCell>{formatNumber(item.consumption)}</TableCell>
                      <TableCell className="font-medium dark:text-green-400 text-green-600">
                        R$ {formatNumber(item.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="mt-6 p-4 bg-energy-green-light/10 dark:bg-energy-green-light/5 rounded-lg border border-energy-green-light/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 dark:text-yellow-300 text-yellow-400" />
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Consumo Total
                    </p>
                    <p className="text-2xl font-bold dark:text-yellow-300 text-yellow-400">
                      {formatNumber(totalConsumption)} kWh
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 dark:text-green-400 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Custo Total
                    </p>
                    <p className="text-2xl font-bold dark:text-green-400 text-green-600" >
                      R$ {formatNumber(totalCost)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasGeneratedReport && reportData.length === 0 && (
        <Card className="p-6 border border-border/60 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4 rounded-lg border border-dashed border-border/80 bg-muted/20 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background shadow-sm">
                <Filter className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold">Nenhum dado para este filtro</p>
                <p className="text-sm text-muted-foreground">
                  Não há aparelhos disponíveis até o fim do período selecionado. Ajuste o
                  mês/ano ou escolha outro aparelho para gerar o relatório.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ReportsTab;
