/**
 * PDFs com a identidade da sociedade (jsPDF carregado sob demanda): cabeçalho com nome e cores,
 * rodapé com data/hora de geração e fuso. Recibo, prestação de contas, ata e relatório de evento.
 */
import type { jsPDF as JsPDF } from 'jspdf';
import type { ChargeDoc, EventDoc, MemberDoc, MemberPiiDoc, MinuteDoc, TenantDoc } from '../shared/types.ts';
import { formatBRL } from '../shared/money.ts';
import { formatDate, formatDateTime, tzLabel } from '../shared/dates.ts';
import type { BudgetComparison, CashFlowRow, Dre, TrialBalanceRow } from '../shared/finance/reports.ts';

type Tenant = Pick<TenantDoc, 'name' | 'branding' | 'timezone' | 'publicPage'>;

const W = 210;
const M = 16;

function rgb(hex: string): [number, number, number] {
  const h = (hex || '#1f3b2d').replace('#', '');
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}

function onColor(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? [17, 17, 17] : [255, 255, 255];
}

// O logo pode estar no Storage: a camada de dados registra aqui como obter o endereço público
let storageResolver: ((path: string) => Promise<string | null>) | null = null;
export function setPdfStorageResolver(fn: ((path: string) => Promise<string | null>) | null): void {
  storageResolver = fn;
}

const logoCache = new Map<string, Promise<{ data: string; format: 'PNG' | 'JPEG'; ratio: number } | null>>();

/** Logo da sociedade como imagem embutida (só foto enviada; ícones prontos não entram no PDF) */
function loadLogo(value: string | undefined) {
  if (!value || !(value.startsWith('tenants/') || /^https?:|^data:image/.test(value))) return Promise.resolve(null);
  if (!logoCache.has(value)) {
    logoCache.set(
      value,
      (async () => {
        try {
          const url = value.startsWith('tenants/') ? await storageResolver?.(value) : value;
          if (!url) return null;
          // Desenha no canvas e embute como PNG (o Storage precisa liberar o domínio no CORS)
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = url;
          await img.decode();
          const c = document.createElement('canvas');
          const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
          c.width = Math.round(img.naturalWidth * scale);
          c.height = Math.round(img.naturalHeight * scale);
          c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
          return { data: c.toDataURL('image/png'), format: 'PNG' as const, ratio: c.width / Math.max(1, c.height) };
        } catch {
          return null; // sem logo o documento sai só com o nome
        }
      })()
    );
  }
  return logoCache.get(value)!;
}

export interface PdfWriter {
  doc: JsPDF;
  y: number;
  title(text: string, sub?: string): void;
  heading(text: string): void;
  para(text: string, opts?: { size?: number; bold?: boolean; color?: [number, number, number] }): void;
  kv(pairs: [string, string][]): void;
  table(headers: string[], rows: string[][], opts?: { widths?: number[]; alignRight?: number[]; boldLast?: boolean }): void;
  space(mm?: number): void;
  ensure(mm: number): void;
  save(filename: string): void;
}

export async function createPdf(tenant: Tenant): Promise<PdfWriter> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const brand = tenant.branding?.primaryColor || '#1f3b2d';
  const accent = tenant.branding?.accentColor || '#d4a64a';
  const generated = `Gerado em ${formatDateTime(new Date().toISOString(), tenant.timezone)} (${tzLabel(tenant.timezone)})`;
  const H = doc.internal.pageSize.getHeight();
  const logo = await loadLogo(tenant.branding?.logoUrl);

  const header = () => {
    doc.setFillColor(...rgb(brand));
    doc.rect(0, 0, W, 22, 'F');
    doc.setFillColor(...rgb(accent));
    doc.rect(0, 22, W, 1.2, 'F');
    let x = M;
    if (logo) {
      const h = 16;
      const lw = Math.min(30, h * logo.ratio);
      doc.addImage(logo.data, logo.format, M, 3, lw, lw / logo.ratio);
      x = M + lw + 4;
    }
    doc.setTextColor(...onColor(brand));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(tenant.name, x, 11);
    if (tenant.publicPage?.city) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(tenant.publicPage.city, x, 17);
    }
    doc.setTextColor(20, 20, 20);
  };
  header();

  const w: PdfWriter = {
    doc,
    y: 32,
    ensure(mm) {
      if (w.y + mm > H - 18) {
        doc.addPage();
        header();
        w.y = 32;
      }
    },
    space(mm = 4) {
      w.y += mm;
    },
    title(text, sub) {
      w.ensure(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(20, 20, 20);
      doc.text(text, M, w.y);
      w.y += 7;
      if (sub) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(90, 90, 90);
        doc.text(sub, M, w.y);
        w.y += 6;
      }
      doc.setTextColor(20, 20, 20);
      w.y += 2;
    },
    heading(text) {
      w.ensure(12);
      w.y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...rgb(brand));
      doc.text(text.toUpperCase(), M, w.y);
      doc.setDrawColor(...rgb(accent));
      doc.line(M, w.y + 1.5, W - M, w.y + 1.5);
      doc.setTextColor(20, 20, 20);
      w.y += 7;
    },
    para(text, opts = {}) {
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.setFontSize(opts.size || 10);
      doc.setTextColor(...(opts.color || [20, 20, 20]));
      const lines = doc.splitTextToSize(text || '', W - 2 * M) as string[];
      const lh = (opts.size || 10) * 0.45;
      for (const l of lines) {
        w.ensure(lh + 1);
        doc.text(l, M, w.y);
        w.y += lh;
      }
      doc.setTextColor(20, 20, 20);
      w.y += 2;
    },
    kv(pairs) {
      doc.setFontSize(10);
      for (const [k, v] of pairs) {
        w.ensure(7);
        doc.setFont('helvetica', 'bold');
        doc.text(k, M, w.y);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(v || '', W - 2 * M - 50) as string[];
        doc.text(lines, M + 50, w.y);
        w.y += Math.max(6, lines.length * 4.6);
      }
    },
    table(headers, rows, opts = {}) {
      const total = W - 2 * M;
      const widths = opts.widths || headers.map(() => total / headers.length);
      const right = new Set(opts.alignRight || []);
      const drawRow = (cells: string[], bold: boolean, fill?: [number, number, number]) => {
        const wrapped = cells.map((c, i) => doc.splitTextToSize(c || '', widths[i] - 3) as string[]);
        const h = Math.max(...wrapped.map(l => l.length)) * 4.4 + 2.6;
        w.ensure(h);
        if (fill) {
          doc.setFillColor(...fill);
          doc.rect(M, w.y - 4, total, h, 'F');
        }
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        let x = M;
        wrapped.forEach((l, i) => {
          if (right.has(i)) doc.text(l, x + widths[i] - 1.5, w.y, { align: 'right' });
          else doc.text(l, x + 1.5, w.y);
          x += widths[i];
        });
        doc.setDrawColor(220, 220, 220);
        doc.line(M, w.y + h - 4, M + total, w.y + h - 4);
        w.y += h;
      };
      doc.setFontSize(9);
      drawRow(headers, true, [238, 238, 232]);
      rows.forEach((r, i) => drawRow(r, !!opts.boldLast && i === rows.length - 1));
      w.y += 3;
    },
    save(filename) {
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        doc.text(generated, M, H - 8);
        doc.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: 'right' });
      }
      doc.save(filename);
    },
  };
  return w;
}

const brl = (c: number) => formatBRL(c);

export async function receiptPdf(tenant: Tenant, c: ChargeDoc): Promise<void> {
  const w = await createPdf(tenant);
  w.title(`Recibo nº ${c.receiptNumber ?? ''}`, 'Comprovante de pagamento');
  w.kv([
    ['Recebemos de', c.memberName],
    ['Referente a', c.description],
    ['Vencimento', formatDate(c.dueDate)],
    ['Pago em', formatDate(c.paidAt, tenant.timezone)],
    ['Forma de pagamento', METHOD_LABEL[c.method || ''] || ''],
  ]);
  w.space(2);
  w.table(
    ['Composição', 'Valor'],
    [
      ...(c.items?.length ? c.items.map(i => [i.label, brl(i.amountCents)]) : [['Valor', brl(c.amountCents)]]),
      ...(c.discountCents ? [['Desconto', `-${brl(c.discountCents)}`]] : []),
      ...(c.lateFeeCents ? [['Multa', brl(c.lateFeeCents)]] : []),
      ...(c.interestCents ? [['Juros', brl(c.interestCents)]] : []),
      ['Total pago', brl(c.paidAmountCents || 0)],
    ],
    { widths: [120, W - 2 * M - 120], alignRight: [1], boldLast: true }
  );
  w.space(10);
  w.para(`${tenant.name} dá plena quitação do valor acima.`, { size: 10 });
  signatures(w, [{ name: '', role: 'Tesouraria' }]);
  w.save(`recibo-${c.receiptNumber || c.id}.pdf`);
}

export const METHOD_LABEL: Record<string, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  cartao: 'Cartão',
};

export async function accountabilityPdf(
  tenant: Tenant,
  data: { periodLabel: string; cashFlow: CashFlowRow[]; dre: Dre; trial: { rows: TrialBalanceRow[]; total: Omit<TrialBalanceRow, 'accountId' | 'name'> }; delinquencyCents?: number; notes?: string }
): Promise<void> {
  const w = await createPdf(tenant);
  w.title('Prestação de contas', data.periodLabel);
  if (data.notes) w.para(data.notes);
  w.heading('Fluxo de caixa');
  w.table(
    ['Mês', 'Receitas', 'Despesas', 'Resultado', 'Acumulado'],
    data.cashFlow.map(r => [`${r.periodKey.slice(5)}/${r.periodKey.slice(0, 4)}`, brl(r.inCents), brl(r.outCents), brl(r.netCents), brl(r.cumulativeCents)]),
    { alignRight: [1, 2, 3, 4] }
  );
  w.heading('Demonstração do resultado (simplificada)');
  w.table(
    ['Conta', 'Valor'],
    [
      ...data.dre.receitas.map(l => [`${l.code} ${l.name}`, brl(l.cents)]),
      ['Total de receitas', brl(data.dre.totalReceitasCents)],
      ...data.dre.despesas.map(l => [`${l.code} ${l.name}`, brl(l.cents)]),
      ['Total de despesas', brl(data.dre.totalDespesasCents)],
      [data.dre.resultadoCents >= 0 ? 'Superávit do período' : 'Déficit do período', brl(data.dre.resultadoCents)],
    ],
    { widths: [130, W - 2 * M - 130], alignRight: [1], boldLast: true }
  );
  w.heading('Balancete por conta');
  w.table(
    ['Conta', 'Saldo inicial', 'Entradas', 'Saídas', 'Saldo final'],
    [
      ...data.trial.rows.map(r => [r.name, brl(r.openingCents), brl(r.inCents), brl(r.outCents), brl(r.finalCents)]),
      ['Total', brl(data.trial.total.openingCents), brl(data.trial.total.inCents), brl(data.trial.total.outCents), brl(data.trial.total.finalCents)],
    ],
    { alignRight: [1, 2, 3, 4], boldLast: true }
  );
  if (data.delinquencyCents !== undefined) w.para(`Inadimplência em aberto na data de geração: ${brl(data.delinquencyCents)}.`);
  w.space(14);
  w.para('______________________________          ______________________________', { color: [80, 80, 80] });
  w.para('Tesouraria                                                   Conselho fiscal', { size: 9, color: [80, 80, 80] });
  w.save(`prestacao-de-contas-${data.periodLabel.replace(/[^0-9a-zA-Z]+/g, '-')}.pdf`);
}

export async function minutePdf(tenant: Tenant, m: MinuteDoc): Promise<void> {
  const w = await createPdf(tenant);
  w.title(m.number ? `Ata nº ${m.number}` : 'Ata (minuta)', m.title);
  w.para(m.body);
  if (m.deliberations.length) {
    w.heading('Deliberações');
    m.deliberations.forEach((d, i) => w.para(`${i + 1}. ${d.text}`));
  }
  w.heading('Assinaturas eletrônicas');
  if (!m.signatures.length) w.para('Ainda sem assinaturas.', { color: [110, 110, 110] });
  for (const s of m.signatures) w.para(`${s.name} (${s.role}), em ${formatDateTime(s.at, tenant.timezone)}`, { bold: true });
  const missing = m.signers.filter(s => !m.signatures.some(x => x.uid === s.uid));
  for (const s of missing) w.para(`${s.name} (${s.role}): assinatura pendente`, { color: [150, 90, 0] });
  if (m.contentHash) {
    w.space(2);
    w.para(`Código de integridade (SHA-256 do texto): ${m.contentHash}`, { size: 8, color: [90, 90, 90] });
    w.para('Assinatura eletrônica simples (Lei 14.063/2020): cada signatário confirmou o texto acima pela própria conta autenticada no portal.', { size: 8, color: [90, 90, 90] });
  }
  w.save(`ata-${(m.number || m.id).replace('/', '-')}.pdf`);
}

export async function eventReportPdf(
  tenant: Tenant,
  ev: EventDoc,
  data: { budget: BudgetComparison; guests: number; checkins: number; ticketsSold: number; sponsors: { name: string; amountCents: number }[] }
): Promise<void> {
  const w = await createPdf(tenant);
  w.title('Relatório pós-evento', ev.name);
  w.kv([
    ['Data', `${formatDateTime(ev.start, tenant.timezone)}`],
    ['Local', ev.location],
    ['Público', `${data.guests} na lista, ${data.checkins} entradas registradas, ${data.ticketsSold} ingressos vendidos`],
  ]);
  w.heading('Orçado x realizado');
  w.table(
    ['', 'Orçado', 'Realizado'],
    [
      ['Receitas', brl(data.budget.plannedInCents), brl(data.budget.actualInCents)],
      ['Despesas', brl(data.budget.plannedOutCents), brl(data.budget.actualOutCents)],
      [data.budget.actualResultCents >= 0 ? 'Lucro' : 'Prejuízo', brl(data.budget.plannedResultCents), brl(data.budget.actualResultCents)],
    ],
    { alignRight: [1, 2], boldLast: true }
  );
  if (data.sponsors.length) {
    w.heading('Patrocinadores');
    w.table(['Patrocinador', 'Valor'], data.sponsors.map(s => [s.name, brl(s.amountCents)]), { widths: [130, W - 2 * M - 130], alignRight: [1] });
  }
  if (ev.team?.length) {
    w.heading('Equipe e voluntários');
    w.table(['Nome', 'Função', 'Voluntário'], ev.team.map(t => [t.name, t.role, t.volunteer ? 'Sim' : 'Não']));
  }
  if (ev.report) {
    w.heading('Relato');
    w.para(ev.report);
  }
  w.save(`relatorio-${ev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.pdf`);
}

/** Segunda via da cobrança com o Pix copia e cola (ou linha digitável) */
export async function chargeSlipPdf(tenant: Tenant, c: ChargeDoc, totalCents: number): Promise<void> {
  const w = await createPdf(tenant);
  w.title('Segunda via de cobrança', c.description);
  w.kv([
    ['Sócio(a)', c.memberName],
    ['Vencimento', formatDate(c.dueDate)],
    ['Valor a pagar', brl(totalCents)],
  ]);
  if (c.provider?.pixCopyPaste) {
    w.heading('Pix copia e cola');
    w.para(c.provider.pixCopyPaste, { size: 8 });
  }
  if (c.provider?.boletoLine) {
    w.heading('Linha digitável do boleto');
    w.para(c.provider.boletoLine, { size: 10 });
  }
  if (c.provider?.name === 'sandbox') w.para('Documento de teste (sandbox): não use para pagamento real.', { size: 9, color: [180, 60, 0] });
  w.save(`segunda-via-${c.id}.pdf`);
}

/** Linhas de assinatura lado a lado */
function signatures(w: PdfWriter, people: { name: string; role: string }[]) {
  w.space(18);
  w.ensure(20);
  const doc = w.doc;
  const span = (W - 2 * M) / people.length;
  people.forEach((p, i) => {
    const cx = M + span * i + span / 2;
    doc.setDrawColor(120, 120, 120);
    doc.line(cx - span / 2 + 8, w.y, cx + span / 2 - 8, w.y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    if (p.name) doc.text(p.name, cx, w.y + 5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(p.role, cx, w.y + (p.name ? 10 : 5), { align: 'center' });
  });
  w.y += 14;
}

type MemberLike = Pick<MemberDoc, 'fullName' | 'categoryName' | 'membershipNumber' | 'joinedAt' | 'validUntil' | 'status'>;

/** Declaração de que a pessoa é sócia (pedida para clube, escola, federação, banco...) */
export async function memberDeclarationPdf(tenant: Tenant, m: MemberLike, o: { memberLabel: string; signer?: { name: string; role: string } }): Promise<void> {
  const w = await createPdf(tenant);
  const today = formatDate(new Date().toISOString(), tenant.timezone);
  w.title('Declaração', `${o.memberLabel} da ${tenant.name}`);
  w.space(4);
  const since = m.joinedAt ? ` desde ${formatDate(m.joinedAt)}` : '';
  const valid = m.validUntil ? `, com cadastro válido até ${formatDate(m.validUntil)}` : '';
  w.para(
    `Declaramos, para os devidos fins, que ${m.fullName}${m.membershipNumber ? `, matrícula ${m.membershipNumber},` : ''} faz parte do quadro de ${o.memberLabel.toLowerCase()}s da ${tenant.name}${since}, na categoria ${m.categoryName}${valid}.`,
    { size: 12 }
  );
  w.para(`Situação na data desta declaração: ${m.status === 'em_atraso' ? 'ativa, com pendência financeira' : 'ativa'}.`, { size: 12 });
  w.space(4);
  w.para(`${tenant.publicPage?.city ? `${tenant.publicPage.city}, ` : ''}${today}.`, { size: 11 });
  signatures(w, [o.signer || { name: '', role: 'Diretoria' }]);
  w.para('A situação atual pode ser conferida a qualquer momento pelo QR Code da carteirinha digital.', { size: 8, color: [110, 110, 110] });
  w.save(`declaracao-${(m.membershipNumber || m.fullName).replace(/\W+/g, '-').toLowerCase()}.pdf`);
}

/** Ficha de inscrição impressa (para arquivo físico ou assinatura no papel) */
export async function memberFormPdf(
  tenant: Tenant,
  m: MemberLike & { dependentOf?: string },
  pii: Pick<MemberPiiDoc, 'cpfMasked' | 'birthDate' | 'email' | 'phone' | 'address'> | null,
  dependents: { fullName: string; relation?: string; birthDate?: string }[],
  o: { memberLabel: string; cpfFull?: string }
): Promise<void> {
  const w = await createPdf(tenant);
  w.title('Ficha de inscrição', `${o.memberLabel} ${m.membershipNumber ? `· matrícula ${m.membershipNumber}` : ''}`);
  const a = pii?.address;
  w.heading('Dados pessoais');
  w.kv([
    ['Nome completo', m.fullName],
    ['CPF', o.cpfFull || pii?.cpfMasked || ''],
    ['Nascimento', pii?.birthDate ? formatDate(pii.birthDate) : ''],
    ['E-mail', pii?.email || ''],
    ['Telefone', pii?.phone || ''],
    ['Endereço', a ? [a.street, a.number, a.district, a.city, a.state, a.zip].filter(Boolean).join(', ') : ''],
  ]);
  w.heading('Associação');
  w.kv([
    ['Categoria', m.categoryName],
    ['Entrada', m.joinedAt ? formatDate(m.joinedAt) : ''],
    ['Validade', m.validUntil ? formatDate(m.validUntil) : ''],
  ]);
  if (dependents.length) {
    w.heading('Dependentes');
    w.table(
      ['Nome', 'Parentesco', 'Nascimento'],
      dependents.map(d => [d.fullName, d.relation || '', d.birthDate ? formatDate(d.birthDate) : '']),
      { widths: [95, 45, W - 2 * M - 140] }
    );
  }
  w.space(4);
  w.para(`Declaro que as informações acima são verdadeiras e que li e aceito o estatuto e a política de privacidade da ${tenant.name}.`, { size: 10 });
  signatures(w, [
    { name: m.fullName, role: o.memberLabel },
    { name: '', role: 'Diretoria' },
  ]);
  w.save(`ficha-${(m.membershipNumber || m.fullName).replace(/\W+/g, '-').toLowerCase()}.pdf`);
}

/** Certificado em paisagem com a moldura nas cores da sociedade */
export interface CertificateItem {
  title: string;
  name: string;
  text: string;
  date: string;
  signers: { name: string; role: string }[];
  code?: string;
}

/** Um certificado por página (um só arquivo para a turma inteira ou o pódio) */
export async function certificatePdf(tenant: Tenant, items: CertificateItem[], filename: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const PW = 297;
  const PH = 210;
  const brand = tenant.branding?.primaryColor || '#1f3b2d';
  const accent = tenant.branding?.accentColor || '#d4a64a';
  const logo = await loadLogo(tenant.branding?.logoUrl);
  items.forEach((c, n) => {
    if (n > 0) doc.addPage();
    doc.setFillColor(...rgb(brand));
    doc.rect(0, 0, PW, PH, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(10, 10, PW - 20, PH - 20, 'F');
    doc.setDrawColor(...rgb(accent));
    doc.setLineWidth(1.2);
    doc.rect(15, 15, PW - 30, PH - 30);
    doc.setLineWidth(0.3);
    doc.rect(17.5, 17.5, PW - 35, PH - 35);
    let y = 36;
    if (logo) {
      const h = 24;
      const lw = Math.min(48, h * logo.ratio);
      doc.addImage(logo.data, logo.format, PW / 2 - lw / 2, 24, lw, lw / logo.ratio);
      y = 24 + lw / logo.ratio + 10;
    }
    doc.setTextColor(...rgb(brand));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(tenant.name.toUpperCase(), PW / 2, y, { align: 'center' });
    doc.setFontSize(30);
    doc.text(c.title, PW / 2, y + 16, { align: 'center' });
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text('Certificamos que', PW / 2, y + 28, { align: 'center' });
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text(c.name, PW / 2, y + 41, { align: 'center' });
    doc.setDrawColor(...rgb(accent));
    doc.line(PW / 2 - 70, y + 44, PW / 2 + 70, y + 44);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    const lines = doc.splitTextToSize(c.text, PW - 80) as string[];
    doc.text(lines, PW / 2, y + 54, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`${tenant.publicPage?.city ? `${tenant.publicPage.city}, ` : ''}${c.date}`, PW / 2, y + 56 + lines.length * 5.5, { align: 'center' });
    const sy = PH - 38;
    const span = (PW - 60) / Math.max(1, c.signers.length);
    c.signers.forEach((p, i) => {
      const cx = 30 + span * i + span / 2;
      doc.setDrawColor(120, 120, 120);
      doc.line(cx - 35, sy, cx + 35, sy);
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      if (p.name) doc.text(p.name, cx, sy + 5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(p.role, cx, sy + (p.name ? 10 : 5), { align: 'center' });
    });
    if (c.code) {
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      doc.text(`Registro ${c.code}`, PW - 22, PH - 21, { align: 'right' });
    }
  });
  doc.save(filename);
}

/** Assinatura padrão: quem ocupa a presidência no organograma */
export function presidentSigner(chart: { positions: { title: string; roleId?: string; personName?: string }[] } | null | undefined): { name: string; role: string } {
  const p = chart?.positions.find(x => x.roleId === 'presidente') || chart?.positions.find(x => /^presidente/i.test(x.title));
  return { name: p?.personName || '', role: p?.title || 'Presidência' };
}
