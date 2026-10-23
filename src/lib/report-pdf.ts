import jsPDF from "jspdf";

export interface PdfReportRow {
  applianceName: string;
  source: string;
  tariffValue: number | null;
  consumptionKWh: number;
  cost: number | null;
}

export interface PdfReportInput {
  userName: string;
  month: string;
  year: string;
  issuedAt: string;
  estimated: PdfReportRow[];
  measured: PdfReportRow[];
}

const number = (value: number, digits = 2) => value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const createReportPdf = (input: PdfReportInput) => {
  const pdf = new jsPDF({ orientation: "landscape" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const columns = [15, 105, 160, 205, 250];
  const limits = [85, 50, 40, 40, 30];
  const headings = ["Aparelho", "Origem", "Tarifa R$/kWh", "kWh", "Custo R$"];
  let y = 20;
  const page = () => { pdf.addPage("a4", "landscape"); y = 20; };
  const line = (text: string, size = 10) => {
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, width - margin * 2) as string[];
    if (y + lines.length * 5 + 2 > height - margin) page();
    pdf.text(lines, margin, y);
    y += lines.length * 5 + 2;
  };
  const drawCells = (cells: string[], maxLines?: number) => {
    const wrapped = cells.map((cell, index) => pdf.splitTextToSize(cell, limits[index]) as string[]);
    const count = Math.min(Math.max(1, ...wrapped.map((part) => part.length)), maxLines ?? Infinity);
    pdf.setFontSize(9);
    wrapped.forEach((part, index) => pdf.text(part.slice(0, count), columns[index], y));
    y += count * 5 + 2;
    return wrapped.map((part) => part.slice(count).join(" "));
  };
  const section = (title: string, rows: PdfReportRow[]) => {
    line(title, 13);
    if (!rows.length) { line("Sem dados para este filtro."); return; }
    drawCells(headings);
    for (const item of rows) {
      let cells = [item.applianceName, item.source, item.tariffValue === null ? "Indisponível" : number(item.tariffValue, 4), number(item.consumptionKWh), item.cost === null ? "Indisponível" : number(item.cost)];
      do {
        if (y > height - margin - 12) { page(); drawCells(headings); }
        const available = Math.max(1, Math.floor((height - margin - y) / 5) - 1);
        cells = drawCells(cells, available);
      } while (cells.some(Boolean));
    }
    const total = rows.reduce((sum, item) => sum + item.consumptionKWh, 0);
    const cost = rows.every((item) => item.cost !== null) ? number(rows.reduce((sum, item) => sum + (item.cost ?? 0), 0)) : "tarifa incompleta";
    line(`Total: ${number(total)} kWh | Custo: ${cost === "tarifa incompleta" ? cost : `R$ ${cost}`}`);
    y += 4;
  };
  line("WattStatus — relatório mensal de energia", 17);
  line(`Cliente: ${input.userName} | Período: ${input.month}/${input.year} | Emissão: ${input.issuedAt}`);
  line("Estimativas usam cadastro atual; medições usam intervalos persistidos da API SmartThings.", 9);
  y += 4;
  section("Consumo estimado", input.estimated);
  section("Consumo medido", input.measured);
  line("Intervalos sem coleta não representam consumo medido zero. A medição pode cobrir apenas parte do mês.", 9);
  return pdf;
};
