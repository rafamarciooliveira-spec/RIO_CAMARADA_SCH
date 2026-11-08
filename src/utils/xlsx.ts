/**
 * Planilha do Excel (.xlsx) sem biblioteca: gera um arquivo simples (texto, cabeçalho em negrito,
 * largura das colunas) e lê a primeira aba de um arquivo enviado (Excel, Google Planilhas, LibreOffice).
 * O .xlsx é um zip de XML; a descompressão usa o DecompressionStream do navegador.
 * Proteções: arquivo de até 5 MB, cada parte descompactada até 8 MB, até 2.000 linhas e 30 colunas.
 */

export type Cell = string | number;
export interface SheetSpec {
  name: string;
  rows: Cell[][];
  widths?: number[]; // largura em caracteres
  boldHeader?: boolean;
}

const MAX_FILE = 5 * 1024 * 1024;
const MAX_PART = 8 * 1024 * 1024;
const MAX_ROWS = 2000;
const MAX_COLS = 30;

// ---------- CRC32 e zip ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const out = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(out).arrayBuffer());
  } catch {
    return null;
  }
}

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não consegue abrir planilhas. Salve como CSV e envie de novo.');
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new Error('Planilha grande demais.');
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Zip com as partes dadas (comprimidas quando o navegador permite) */
export async function zip(files: { name: string; data: Uint8Array }[], compress = true): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const packed = compress ? await deflateRaw(f.data) : null;
    const method = packed && packed.length < f.data.length ? 8 : 0;
    const body = method === 8 ? packed! : f.data;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, method, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, body);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, method, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, body.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of all) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Lê as partes de um zip pelo diretório central (só as pedidas) */
export async function unzip(buf: Uint8Array, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('O arquivo não é uma planilha do Excel (.xlsx).');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let k = 0; k < count && k < 500; k++) {
    if (p + 46 > buf.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('Planilha danificada.');
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true);
    const xlen = v.getUint16(p + 30, true);
    const clen = v.getUint16(p + 32, true);
    const loc = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!want(name)) continue;
    if (usize > MAX_PART) throw new Error('Planilha grande demais.');
    if (loc + 30 > buf.length || v.getUint32(loc, true) !== 0x04034b50) throw new Error('Planilha danificada.');
    const start = loc + 30 + v.getUint16(loc + 26, true) + v.getUint16(loc + 28, true);
    const body = buf.subarray(start, start + csize);
    if (method === 0) out.set(name, body.slice());
    else if (method === 8) out.set(name, await inflateRaw(body, MAX_PART));
    else throw new Error('Formato de compressão da planilha não suportado. Salve de novo no Excel.');
  }
  return out;
}

// ---------- XML ----------
const esc = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex -- tira caracteres de controle que o XML não aceita
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const n = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
  });
}

export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetXml(s: SheetSpec): string {
  const cols = s.widths?.length ? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const rows = s.rows
    .map((r, ri) => {
      const cells = r
        .map((c, ci) => {
          const ref = `${colName(ci)}${ri + 1}`;
          const style = s.boldHeader && ri === 0 ? ' s="1"' : '';
          if (typeof c === 'number' && Number.isFinite(c)) return `<c r="${ref}"${style}><v>${c}</v></c>`;
          const text = String(c ?? '');
          if (!text) return '';
          return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  const freeze = s.boldHeader ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

/** Gera o .xlsx (Blob) com as abas dadas */
export async function writeXlsx(sheets: SheetSpec[]): Promise<Blob> {
  const enc = new TextEncoder();
  const names = sheets.map((s, i) => esc(s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Aba ${i + 1}`));
  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>',
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  const bytes = await zip(files.map(f => ({ name: f.name, data: enc.encode(f.data) })));
  return new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Texto de um <si> ou <is> (junta as partes <t> do texto com formatação) */
function textOf(xml: string): string {
  let s = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) s += unescapeXml(m[1] || '');
  return s;
}

/** Linhas da primeira aba de um .xlsx (todas as células como texto) */
export async function readXlsx(input: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (buf.length > MAX_FILE) throw new Error('Planilha grande demais (máximo de 5 MB).');
  const dec = new TextDecoder();
  const meta = await unzip(buf, n => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml');
  const wb = dec.decode(meta.get('xl/workbook.xml') || new Uint8Array());
  const rels = dec.decode(meta.get('xl/_rels/workbook.xml.rels') || new Uint8Array());
  const firstRid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  let target = 'xl/worksheets/sheet1.xml';
  if (firstRid) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(r => r.includes(`Id="${firstRid}"`));
    const t = rel && /Target="([^"]+)"/.exec(rel)?.[1];
    if (t) target = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
  }
  const sheet = await unzip(buf, n => n === target);
  const xml = dec.decode(sheet.get(target) || new Uint8Array());
  if (!xml) throw new Error('Não achei a primeira aba da planilha.');
  const shared = [...dec.decode(meta.get('xl/sharedStrings.xml') || new Uint8Array()).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1]));
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= MAX_ROWS) break;
    const rNum = Number(/\br="(\d+)"/.exec(rm[1])?.[1]) || rows.length + 1;
    const row: string[] = [];
    let next = 0;
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const ref = /\br="([A-Z]+)\d*"/i.exec(attrs)?.[1];
      const ci = ref ? colIndex(ref) : next;
      next = ci + 1;
      if (ci >= MAX_COLS) continue;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] || 'n';
      const inner = cm[2] || '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let val = '';
      if (type === 's') val = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') val = textOf(inner);
      else if (type === 'b') val = v === '1' ? 'sim' : 'não';
      else val = v !== undefined ? unescapeXml(v) : '';
      row[ci] = val;
    }
    while (rows.length < rNum - 1 && rows.length < MAX_ROWS) rows.push([]);
    rows.push(Array.from(row, x => (x ?? '').trim()));
  }
  return rows;
}

/** Baixa um Blob como arquivo (sem rede) */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
