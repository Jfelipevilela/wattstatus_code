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

type RGB = [number, number, number];

// Brand palette, kept in sync with the app's energy tokens.
const INK: RGB = [24, 24, 27];
const MUTED: RGB = [113, 113, 122];
const LINE: RGB = [228, 228, 231];
const SOFT: RGB = [244, 244, 245];
const DARK: RGB = [15, 17, 26];
const GREEN: RGB = [0, 200, 83];
const BLUE: RGB = [41, 121, 255];
const BAR_COLORS: RGB[] = [GREEN, BLUE, [20, 184, 166], [255, 193, 7], [255, 112, 67], [139, 92, 246]];

const number = (value: number, digits = 2) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const money = (value: number) => `R$ ${number(value)}`;

const periodName = (month: string, year: string) => {
  const date = new Date(Number(year), Number(month) - 1, 1);
  const name = date.toLocaleDateString("pt-BR", { month: "long" });
  return Number.isFinite(date.getTime()) ? `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}` : `${month}/${year}`;
};

const totals = (rows: PdfReportRow[]) => ({
  kWh: rows.reduce((sum, row) => sum + row.consumptionKWh, 0),
  cost: rows.every((row) => row.cost !== null) ? rows.reduce((sum, row) => sum + (row.cost ?? 0), 0) : null,
});

export const createReportPdf = (input: PdfReportInput) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const content = width - margin * 2;
  const bottom = height - 20;
  let y = 0;

  const fill = (color: RGB) => pdf.setFillColor(color[0], color[1], color[2]);
  const ink = (color: RGB) => pdf.setTextColor(color[0], color[1], color[2]);
  const stroke = (color: RGB) => pdf.setDrawColor(color[0], color[1], color[2]);
  const font = (size: number, style: "normal" | "bold" = "normal") => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
  };

  const pageHeader = () => {
    fill(DARK);
    pdf.rect(0, 0, width, 14, "F");
    fill(GREEN);
    pdf.rect(0, 14, width, 0.8, "F");
    font(9, "bold");
    ink([255, 255, 255]);
    pdf.text("WattStatus", margin, 9);
    font(8);
    ink([180, 180, 190]);
    pdf.text(`Relatório de energia · ${periodName(input.month, input.year)}`, width - margin, 9, { align: "right" });
    y = 26;
  };
  const ensure = (space: number) => {
    if (y + space > bottom) {
      pdf.addPage("a4", "portrait");
      pageHeader();
      return true;
    }
    return false;
  };

  // Cover band
  fill(DARK);
  pdf.rect(0, 0, width, 62, "F");
  fill(GREEN);
  pdf.rect(0, 62, width, 1.2, "F");
  fill(GREEN);
  pdf.roundedRect(margin, 16, 9, 9, 2, 2, "F");
  font(11, "bold");
  ink(DARK);
  pdf.text("W", margin + 4.5, 22.3, { align: "center" });
  ink([255, 255, 255]);
  font(12, "bold");
  pdf.text("WattStatus", margin + 13, 22.3);
  font(22, "bold");
  pdf.text("Relatório de energia", margin, 40);
  font(11);
  ink([200, 200, 210]);
  pdf.text(periodName(input.month, input.year), margin, 48);
  font(9);
  ink([160, 160, 175]);
  pdf.text(`Cliente: ${input.userName}`, width - margin, 40, { align: "right" });
  pdf.text(`Emitido em ${input.issuedAt}`, width - margin, 48, { align: "right" });
  y = 74;

  // KPI cards
  const estimated = totals(input.estimated);
  const measured = totals(input.measured);
  const cards: Array<{ label: string; value: string; detail: string; accent: RGB }> = [
    { label: "ESTIMADO", value: money(estimated.cost ?? 0), detail: `${number(estimated.kWh, 1)} kWh no mês`, accent: GREEN },
    input.measured.length
      ? {
          label: "MEDIDO",
          value: measured.cost === null ? "Tarifa incompleta" : money(measured.cost),
          detail: `${number(measured.kWh, 1)} kWh medidos`,
          accent: BLUE,
        }
      : { label: "MEDIDO", value: "Sem medição", detail: "Nada substituído por estimativa", accent: BLUE },
    {
      label: "APARELHOS",
      value: String(input.estimated.length),
      detail: `${input.measured.length} com medição`,
      accent: [20, 184, 166],
    },
  ];
  const gap = 5;
  const cardWidth = (content - gap * 2) / 3;
  cards.forEach((card, index) => {
    const x = margin + index * (cardWidth + gap);
    fill(SOFT);
    pdf.roundedRect(x, y, cardWidth, 28, 3, 3, "F");
    fill(card.accent);
    pdf.roundedRect(x, y, 1.6, 28, 0.8, 0.8, "F");
    font(7, "bold");
    ink(MUTED);
    pdf.text(card.label, x + 6, y + 8);
    font(card.value.length > 12 ? 12 : 15, "bold");
    ink(INK);
    pdf.text(card.value, x + 6, y + 17);
    font(8);
    ink(MUTED);
    pdf.text(card.detail, x + 6, y + 23);
  });
  y += 38;

  // Top consumers chart
  const top = [...input.estimated].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0)).slice(0, 6);
  const maxCost = Math.max(...top.map((row) => row.cost ?? 0), 0);
  if (top.length > 0 && maxCost > 0) {
    font(12, "bold");
    ink(INK);
    pdf.text("Maiores custos estimados", margin, y);
    y += 7;
    const labelWidth = 52;
    const valueWidth = 26;
    const barMax = content - labelWidth - valueWidth - 4;
    top.forEach((row, index) => {
      const cost = row.cost ?? 0;
      font(9);
      ink(INK);
      const name = (pdf.splitTextToSize(row.applianceName, labelWidth - 2) as string[])[0];
      pdf.text(name, margin, y + 3.6);
      fill(SOFT);
      pdf.roundedRect(margin + labelWidth, y, barMax, 5, 2.5, 2.5, "F");
      fill(BAR_COLORS[index % BAR_COLORS.length]);
      pdf.roundedRect(margin + labelWidth, y, Math.max(5, (cost / maxCost) * barMax), 5, 2.5, 2.5, "F");
      font(9, "bold");
      pdf.text(money(cost), width - margin, y + 3.6, { align: "right" });
      y += 8.5;
    });
    y += 6;
  }

  // Tables
  const columns = [
    { title: "Aparelho", width: content - 104, align: "left" as const },
    { title: "Origem", width: 26, align: "left" as const },
    { title: "Tarifa R$/kWh", width: 26, align: "right" as const },
    { title: "kWh", width: 22, align: "right" as const },
    { title: "Custo", width: 30, align: "right" as const },
  ];
  const tableHeader = () => {
    fill(DARK);
    pdf.roundedRect(margin, y, content, 8, 2, 2, "F");
    font(8, "bold");
    ink([255, 255, 255]);
    let x = margin + 3;
    for (const column of columns) {
      const tx = column.align === "right" ? x + column.width - 6 : x;
      pdf.text(column.title, tx, y + 5.3, { align: column.align });
      x += column.width;
    }
    y += 10;
  };
  const section = (title: string, accent: RGB, rows: PdfReportRow[], empty: string) => {
    ensure(30);
    fill(accent);
    pdf.circle(margin + 1.5, y - 1.3, 1.5, "F");
    font(12, "bold");
    ink(INK);
    pdf.text(title, margin + 5, y);
    y += 6;
    if (!rows.length) {
      stroke(LINE);
      pdf.setLineDashPattern([1.5, 1.5], 0);
      pdf.roundedRect(margin, y, content, 14, 3, 3, "S");
      pdf.setLineDashPattern([], 0);
      font(9);
      ink(MUTED);
      pdf.text(empty, width / 2, y + 8.5, { align: "center" });
      y += 22;
      return;
    }
    tableHeader();
    rows.forEach((row, index) => {
      const cells = [
        row.applianceName,
        row.source,
        row.tariffValue === null ? "Indisponível" : number(row.tariffValue, 4),
        number(row.consumptionKWh),
        row.cost === null ? "Indisponível" : money(row.cost),
      ];
      font(9);
      const wrapped = cells.map((cell, cellIndex) => pdf.splitTextToSize(cell, columns[cellIndex].width - 6) as string[]);
      const rowHeight = Math.max(...wrapped.map((lines) => lines.length)) * 4.2 + 3.6;
      if (ensure(rowHeight + 2)) tableHeader();
      if (index % 2 === 1) {
        fill([250, 250, 250]);
        pdf.rect(margin, y - 1, content, rowHeight, "F");
      }
      let x = margin + 3;
      wrapped.forEach((lines, cellIndex) => {
        const column = columns[cellIndex];
        font(9, cellIndex === 4 ? "bold" : "normal");
        ink(cellIndex === 0 || cellIndex === 4 ? INK : MUTED);
        const tx = column.align === "right" ? x + column.width - 6 : x;
        pdf.text(lines, tx, y + 3.2, { align: column.align });
        x += column.width;
      });
      y += rowHeight;
    });
    const sum = totals(rows);
    ensure(12);
    stroke(LINE);
    pdf.line(margin, y, width - margin, y);
    y += 6;
    font(10, "bold");
    ink(INK);
    pdf.text("Total", margin + 3, y);
    pdf.text(`${number(sum.kWh)} kWh`, width - margin - 33, y, { align: "right" });
    pdf.text(sum.cost === null ? "Tarifa incompleta" : money(sum.cost), width - margin - 3, y, { align: "right" });
    y += 12;
  };

  section("Consumo estimado", GREEN, input.estimated, "Nenhum aparelho no período selecionado.");
  section("Consumo medido", BLUE, input.measured, "Sem medições suficientes neste período.");

  // Notes
  ensure(26);
  fill(SOFT);
  pdf.roundedRect(margin, y, content, 22, 3, 3, "F");
  font(8, "bold");
  ink(INK);
  pdf.text("Como ler este relatório", margin + 5, y + 6);
  font(8);
  ink(MUTED);
  pdf.text(
    pdf.splitTextToSize(
      "Estimativas usam potência, tempo de uso e tarifa cadastrados hoje. Medições vêm dos intervalos salvos da SmartThings e podem cobrir só parte do mês; períodos sem coleta não significam consumo zero.",
      content - 10,
    ) as string[],
    margin + 5,
    y + 11,
  );

  // Footer on every page
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    stroke(LINE);
    pdf.line(margin, height - 12, width - margin, height - 12);
    font(7);
    ink(MUTED);
    pdf.text("Gerado por WattStatus · wattstatus.netlify.app", margin, height - 7);
    pdf.text(`Página ${page} de ${pages}`, width - margin, height - 7, { align: "right" });
  }
  return pdf;
};
