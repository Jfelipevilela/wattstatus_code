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

  const { user } = useAuth();

  // Tarifas por estado
  const STATE_TARIFFS = {
    AC: 0.89,
    AL: 0.78,
    AP: 0.85,
    AM: 0.82,
    BA: 0.75,
    CE: 0.71,
    DF: 0.79,
    ES: 0.73,
    GO: 0.76,
    MA: 0.69,
    MT: 0.74,
    MS: 0.72,
    MG: 0.77,
    PA: 0.81,
    PB: 0.7,
    PR: 0.78,
    PE: 0.72,
    PI: 0.68,
    RJ: 0.79,
    RN: 0.71,
    RS: 0.8,
    RO: 0.83,
    RR: 0.84,
    SC: 0.76,
    SP: 0.82,
    SE: 0.7,
    TO: 0.75,
  };

  // Initialize with current month/year
  useEffect(() => {
    const now = new Date();
    setSelectedMonth((now.getMonth() + 1).toString().padStart(2, "0"));
    setSelectedYear(now.getFullYear().toString());
  }, []);

  const getDaysInMonth = (month: number, year: number): number => {
    return new Date(year, month, 0).getDate();
  };

  const generateReport = async () => {
    if (!selectedMonth || !selectedYear) {
      toast({
        title: "Erro",
        description: "Selecione mês e ano para gerar o relatório.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    // Simulate processing time for UX
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const month = parseInt(selectedMonth);
    const year = parseInt(selectedYear);
    const daysInMonth = getDaysInMonth(month, year);

    const filteredAppliances =
      selectedAppliance === "all"
        ? appliances
        : appliances.filter((app) => app.id === selectedAppliance);

    const data: ReportData[] = filteredAppliances.map((appliance) => {
      const tariffValue =
        STATE_TARIFFS[appliance.tariff as keyof typeof STATE_TARIFFS] || 0.82;
      const consumption =
        (appliance.power * appliance.usageHours * daysInMonth) / 1000;
      const cost = consumption * tariffValue;

      return {
        applianceName: appliance.name,
        power: appliance.power,
        usageHours: appliance.usageHours,
        daysInMonth,
        tariff: appliance.tariff,
        tariffValue,
        consumption,
        cost,
      };
    });

    setReportData(data);
    setGenerationTime(new Date().toLocaleString("pt-BR"));
    setIsGenerating(false);

    toast({
      title: "Relatório gerado com sucesso!",
      description: `Relatório de ${month}/${year} gerado com ${data.length} aparelho(s).`,
    });
  };

  const exportToPDF = async () => {
    if (reportData.length === 0) {
      toast({
        title: "Erro",
        description: "Gere um relatório primeiro antes de exportar.",
        variant: "destructive",
      });
      return;
    }

    try {
      const jsPDF = (await import("jspdf")).default;
      const pdf = new jsPDF();

      // Title
      pdf.setFontSize(20);
      pdf.text("Relatório Mensal de Consumo de Energia", 20, 30);

      // Client info
      pdf.setFontSize(12);
      pdf.text(`Cliente: ${user?.name || "Usuário"}`, 20, 50);
      pdf.text(`Email: ${user?.email || "usuario@email.com"}`, 20, 60);
      pdf.text(`Mês/Ano: ${selectedMonth}/${selectedYear}`, 20, 70);
      pdf.text(`Data de geração: ${generationTime}`, 20, 80);

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
        pdf.text(item.usageHours.toString(), 120, yPosition);
        pdf.text(item.daysInMonth.toString(), 150, yPosition);
        pdf.text(item.consumption.toFixed(2), 170, yPosition);
        pdf.text(item.cost.toFixed(2), 220, yPosition);
        yPosition += 10;

        if (yPosition > 270) {
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
        `Total Consumo: ${totalConsumption.toFixed(2)} kWh`,
        20,
        yPosition
      );
      pdf.text(`Total Custo: R$ ${totalCost.toFixed(2)}`, 150, yPosition);

      pdf.save(`relatorio_${selectedMonth}_${selectedYear}.pdf`);

      toast({
        title: "PDF exportado com sucesso!",
        description: "O relatório foi salvo em PDF.",
      });
    } catch (error) {
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
      let aValue: any = a[column as keyof ReportData];
      let bValue: any = b[column as keyof ReportData];

      if (typeof aValue === "string") {
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
          Gere relatórios detalhados do consumo de energia por aparelho
        </p>
      </div>

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
              <label className="block text-sm font-medium mb-2">Mês</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
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
              <label className="block text-sm font-medium mb-2">Ano</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => (
                    <SelectItem key={2024 + i} value={(2024 + i).toString()}>
                      {2024 + i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Aparelho</label>
              <Select
                value={selectedAppliance}
                onValueChange={setSelectedAppliance}
              >
                <SelectTrigger>
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
                className="w-full bg-energy-green-light hover:bg-energy-green-dark"
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
            <div className="flex justify-between items-center">
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
                      <TableCell>{item.usageHours}</TableCell>
                      <TableCell>{item.daysInMonth}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.tariff}</Badge>
                      </TableCell>
                      <TableCell>{item.consumption.toFixed(2)}</TableCell>
                      <TableCell className="font-medium dark:text-green-400 text-green-600">
                        R$ {item.cost.toFixed(2)}
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
                      {totalConsumption.toFixed(2)} kWh
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
                      R$ {totalCost.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ReportsTab;
