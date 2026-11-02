import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { SocietyEvent, SocietyEventType } from '../types/index.ts';
import { db } from '../firebase/config.ts';
import { doc, setDoc } from 'firebase/firestore';
import {
  FileSpreadsheet,
  UploadCloud,
  Download,
  CheckCircle2,
  AlertTriangle,
  X,
  FileCheck,
  Building,
  Lock,
  Calendar,
  Clock,
  MapPin,
  Trash2,
  RefreshCw,
  Info,
} from 'lucide-react';

interface ExcelEventsImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ParsedRow {
  index: number;
  selected: boolean;
  title: string;
  date: string; // YYYY-MM-DD
  rawDate: string;
  startTime: string;
  endTime: string;
  type: SocietyEventType;
  location: string;
  notes: string;
  isValid: boolean;
  error?: string;
}

// Convert Excel Serial Date or Date string to YYYY-MM-DD
function parseExcelDate(val: any): { isoDate: string; displayDate: string; isValid: boolean } {
  if (!val) return { isoDate: '', displayDate: '', isValid: false };

  // If number (Excel serial date, e.g. 45820)
  if (typeof val === 'number') {
    try {
      const excelEpoch = new Date(1899, 11, 30);
      const millisPerDay = 86400000;
      const targetDate = new Date(excelEpoch.getTime() + val * millisPerDay);
      if (!isNaN(targetDate.getTime())) {
        const y = targetDate.getFullYear();
        const m = String(targetDate.getMonth() + 1).padStart(2, '0');
        const d = String(targetDate.getDate()).padStart(2, '0');
        return {
          isoDate: `${y}-${m}-${d}`,
          displayDate: `${d}/${m}/${y}`,
          isValid: true,
        };
      }
    } catch (e) {}
  }

  const str = String(val).trim();

  // If DD/MM/YYYY or DD-MM-YYYY
  const brMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3];
    return {
      isoDate: `${year}-${month}-${day}`,
      displayDate: `${day}/${month}/${year}`,
      isValid: true,
    };
  }

  // If YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return {
      isoDate: `${year}-${month}-${day}`,
      displayDate: `${day}/${month}/${year}`,
      isValid: true,
    };
  }

  // Try standard Date parsing
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return {
        isoDate: `${y}-${m}-${day}`,
        displayDate: `${day}/${m}/${y}`,
        isValid: true,
      };
    }
  } catch (e) {}

  return { isoDate: '', displayDate: str, isValid: false };
}

// Convert Excel time representation or string to HH:mm
function parseExcelTime(val: any, fallback: string): string {
  if (!val) return fallback;

  // Decimal time fraction in Excel (e.g. 0.5 = 12:00)
  if (typeof val === 'number' && val >= 0 && val < 1) {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const str = String(val).trim();
  const timeMatch = str.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }
  return fallback;
}

// Detect Event Type
function detectEventType(val: any): SocietyEventType {
  if (!val) return 'sociedade';
  const str = String(val).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (
    str.includes('terceiro') ||
    str.includes('locacao') ||
    str.includes('aluguel') ||
    str.includes('externo') ||
    str.includes('privado') ||
    str.includes('ocupado')
  ) {
    return 'terceiro';
  }
  return 'sociedade';
}

export const ExcelEventsImporterModal: React.FC<ExcelEventsImporterModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentUser, currentMember, isAdmin, isSuperAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successCount, setSuccessCount] = useState<number | null>(null);

  if (!isOpen) return null;

  // Helper to parse CSV text into row objects (supports semicolons, commas, tabs, quotes)
  const parseCSVText = (text: string): Record<string, any>[] => {
    const cleanText = text.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    // Detect separator
    const firstLine = lines[0];
    const semiCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const delimiter = semiCount >= commaCount && semiCount >= tabCount ? ';' : (tabCount > commaCount ? '\t' : ',');

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]).map(h => h.replace(/^["']|["']$/g, '').trim());
    const records: Record<string, any>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      const record: Record<string, any> = {};
      headers.forEach((h, idx) => {
        let val = values[idx] || '';
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1).replace(/""/g, '"');
        }
        record[h] = val;
      });
      records.push(record);
    }
    return records;
  };

  // Generate and download pre-formatted CSV template (opens seamlessly in Excel)
  const handleDownloadTemplate = () => {
    const headers = [
      'Data (AAAA-MM-DD ou DD/MM/AAAA)',
      'Nome do Evento',
      'Tipo (Sociedade ou Terceiro)',
      'Horario Inicio',
      'Horario Termino',
      'Local',
      'Observacoes',
    ];
    const templateRows = [
      [
        '2025-06-21',
        'Festa Junina Tradicional dos Sócios',
        'Sociedade',
        '19:00',
        '23:30',
        'Salão Nobre / Festas',
        'Apresentação de quadrilhas, comidas típicas e barracas de pescaria.',
      ],
      [
        '2025-07-05',
        'Locação Salão de Festas - Casamento Privado (Família Silva)',
        'Terceiro',
        '16:00',
        '23:00',
        'Espaço Gourmet & Churrasqueira',
        'Contrato nº 104/2025. Locatário externo. Fica exibido como "Ocupado" para sócios.',
      ],
      [
        '2025-07-19',
        'Torneio Interno de Futebol Society',
        'Sociedade',
        '08:30',
        '14:00',
        'Campo de Futebol / Poliesportivo',
        'Inscrições gratuitas para associados em dia.',
      ],
    ];

    const csvContent =
      '\uFEFF' +
      [
        headers.map(h => `"${h}"`).join(';'),
        ...templateRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';')),
      ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'modelo_eventos_sociedade.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Process uploaded Excel / CSV file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    setErrorMsg('');
    setSuccessCount(null);

    try {
      const text = await file.text();
      const rawJson = parseCSVText(text);

      if (rawJson.length === 0) {
        setErrorMsg('O arquivo CSV selecionado está vazio ou não contém registros válidos.');
        setParsing(false);
        return;
      }

      // Map rows with intelligent column detection
      const rows: ParsedRow[] = [];

      rawJson.forEach((row, idx) => {
        // Find best match for each field
        let titleVal = '';
        let dateVal = '';
        let typeVal = '';
        let startTimeVal = '';
        let endTimeVal = '';
        let locationVal = '';
        let notesVal = '';

        for (const key of Object.keys(row)) {
          const cleanKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const val = row[key];

          if (cleanKey.includes('data') || cleanKey.includes('date') || cleanKey.includes('dia')) {
            dateVal = val;
          } else if (cleanKey.includes('nome') || cleanKey.includes('titulo') || cleanKey.includes('evento') || cleanKey.includes('title')) {
            titleVal = String(val).trim();
          } else if (cleanKey.includes('tipo') || cleanKey.includes('categoria') || cleanKey.includes('sociedade') || cleanKey.includes('type')) {
            typeVal = val;
          } else if (cleanKey.includes('inicio') || cleanKey.includes('comeco') || cleanKey.includes('start')) {
            startTimeVal = val;
          } else if (cleanKey.includes('fim') || cleanKey.includes('termino') || cleanKey.includes('end')) {
            endTimeVal = val;
          } else if (cleanKey.includes('local') || cleanKey.includes('espaco') || cleanKey.includes('salao') || cleanKey.includes('location')) {
            locationVal = String(val).trim();
          } else if (cleanKey.includes('obs') || cleanKey.includes('nota') || cleanKey.includes('detalhe') || cleanKey.includes('notes')) {
            notesVal = String(val).trim();
          }
        }

        // If title not found by header, fallback to 2nd column or first non-empty string
        if (!titleVal) {
          const keys = Object.keys(row);
          if (keys.length > 1 && row[keys[1]]) {
            titleVal = String(row[keys[1]]).trim();
          }
        }

        const dateParsed = parseExcelDate(dateVal);
        const eventType = detectEventType(typeVal);
        const startTime = parseExcelTime(startTimeVal, '09:00');
        const endTime = parseExcelTime(endTimeVal, '18:00');

        let isValid = true;
        let error = '';

        if (!titleVal) {
          isValid = false;
          error = 'Nome do evento ausente';
        } else if (!dateParsed.isValid) {
          isValid = false;
          error = `Data inválida (${dateVal || 'vazia'})`;
        }

        rows.push({
          index: idx,
          selected: isValid,
          title: titleVal,
          date: dateParsed.isoDate,
          rawDate: dateParsed.displayDate,
          startTime,
          endTime,
          type: eventType,
          location: locationVal || 'Sede da Associação',
          notes: notesVal || '',
          isValid,
          error,
        });
      });

      setParsedRows(rows);
    } catch (err: any) {
      console.error('Erro ao processar planilha Excel:', err);
      setErrorMsg('Falha ao processar o arquivo. Verifique se o formato é .xlsx, .xls ou .csv.');
    } finally {
      setParsing(false);
    }
  };

  // Toggle selection
  const handleToggleSelectRow = (idx: number) => {
    setParsedRows(prev =>
      prev.map(r => (r.index === idx ? { ...r, selected: !r.selected } : r))
    );
  };

  const handleSelectAll = (select: boolean) => {
    setParsedRows(prev =>
      prev.map(r => (r.isValid ? { ...r, selected: select } : r))
    );
  };

  // Execute Firestore Batch Import
  const handleExecuteImport = async () => {
    const toImport = parsedRows.filter(r => r.selected && r.isValid);
    if (toImport.length === 0) {
      setErrorMsg('Nenhum evento válido selecionado para importação.');
      return;
    }

    setImporting(true);
    setErrorMsg('');
    setImportProgress({ current: 0, total: toImport.length });

    try {
      const nowIso = new Date().toISOString();
      const creatorEmail = currentUser?.email || 'Importação Excel';
      const creatorName = currentMember?.fullName || (isAdmin || isSuperAdmin ? 'Diretoria / Admin' : 'Membro da Diretoria');

      let saved = 0;

      for (const row of toImport) {
        const eventId = `evt_xl_${Date.now()}_${row.index}_${Math.random().toString(36).substring(2, 6)}`;
        const eventDoc: SocietyEvent = {
          id: eventId,
          title: row.title,
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          type: row.type,
          location: row.location,
          notes: row.notes,
          createdBy: creatorEmail,
          createdByName: creatorName,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        await setDoc(doc(db, 'events', eventId), eventDoc);
        saved++;
        setImportProgress({ current: saved, total: toImport.length });
      }

      setSuccessCount(saved);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Erro ao salvar eventos no banco de dados:', err);
      setErrorMsg(err.message || 'Erro ao persistir eventos no Firestore.');
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = parsedRows.filter(r => r.selected && r.isValid).length;
  const sociedadeCount = parsedRows.filter(r => r.selected && r.isValid && r.type === 'sociedade').length;
  const terceiroCount = parsedRows.filter(r => r.selected && r.isValid && r.type === 'terceiro').length;

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto cursor-pointer animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-4xl w-full p-5 sm:p-7 space-y-6 shadow-2xl relative my-6 max-h-[92vh] flex flex-col cursor-default animate-scale-in"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                Importação em Lote
              </span>
              <span className="text-xs text-zinc-400 font-mono">Excel (.xlsx, .xls) & CSV</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white">
              Subir Eventos da Sociedade de Planilha Excel
            </h3>
            <p className="text-xs text-zinc-400 max-w-2xl">
              Importe múltiplos eventos, assembleias ou reservas de uma só vez. Eventos marcados como <strong>Terceiro</strong> serão configurados para exibir automaticamente <strong>"Ocupado"</strong> aos sócios.
            </p>
          </div>

          {/* Download Model Button */}
          <button
            onClick={handleDownloadTemplate}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs font-bold transition-all border border-zinc-700 shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
            title="Baixar planilha Excel com cabeçalhos e exemplos prontos"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar Planilha Modelo (.csv / Excel)</span>
          </button>
        </div>

        {/* Success Alert */}
        {successCount !== null && (
          <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 flex items-center justify-between gap-3 shadow-lg shrink-0">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-white">
                  🎉 {successCount} Evento(s) Importado(s) com Sucesso!
                </h4>
                <p className="text-xs text-emerald-300 mt-0.5">
                  Os eventos já foram gravados no banco de dados e estão disponíveis no calendário oficial da sociedade.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition-colors"
            >
              Fechar & Ver Calendário
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* File Upload Zone */}
        {parsedRows.length === 0 && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-zinc-700 hover:border-emerald-500 rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-colors bg-zinc-950/40 hover:bg-zinc-950/80 group shrink-0"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform shadow-inner">
              <UploadCloud className="w-8 h-8" />
            </div>

            <h4 className="text-base font-bold text-white">
              Clique aqui ou arraste sua planilha de eventos
            </h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
              Suporta arquivos nos formatos <strong>.xlsx</strong>, <strong>.xls</strong> e <strong>.csv</strong>.
              O sistema detecta automaticamente as colunas de data, nome, tipo, horários e observações.
            </p>

            <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Compatível com Excel & Google Planilhas
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Detecção inteligente de cabeçalhos
              </span>
            </div>
          </div>
        )}

        {/* Parsed Rows Preview Table */}
        {parsedRows.length > 0 && (
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            {/* Summary Chips & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-white bg-zinc-800 px-3 py-1.5 rounded-xl border border-zinc-700">
                  Arquivo: <span className="text-emerald-400">{fileName}</span> ({parsedRows.length} linhas)
                </span>

                <span className="text-xs font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-xl flex items-center gap-1">
                  <Building className="w-3 h-3" />
                  {sociedadeCount} Sociedade
                </span>

                <span className="text-xs font-semibold text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2.5 py-1 rounded-xl flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {terceiroCount} Terceiro (Ocupado)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSelectAll(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors cursor-pointer"
                >
                  Marcar Todos
                </button>
                <span className="text-zinc-600">•</span>
                <button
                  onClick={() => handleSelectAll(false)}
                  className="text-xs text-zinc-400 hover:text-white font-medium transition-colors cursor-pointer"
                >
                  Desmarcar
                </button>
                <span className="text-zinc-600">•</span>
                <button
                  onClick={() => {
                    setParsedRows([]);
                    setFileName('');
                    setErrorMsg('');
                    setSuccessCount(null);
                  }}
                  className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors cursor-pointer"
                >
                  Trocar Arquivo
                </button>
              </div>
            </div>

            {/* Scrollable Table */}
            <div className="flex-1 overflow-y-auto overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950/60 text-xs">
              <table className="w-full text-left">
                <thead className="bg-zinc-950 text-[10px] font-bold uppercase tracking-wider text-zinc-400 sticky top-0 border-b border-zinc-800 z-10">
                  <tr>
                    <th className="p-3 w-10 text-center">Sel.</th>
                    <th className="p-3">Data</th>
                    <th className="p-3">Nome do Evento</th>
                    <th className="p-3">Classificação</th>
                    <th className="p-3">Horário</th>
                    <th className="p-3">Local</th>
                    <th className="p-3">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {parsedRows.map(row => (
                    <tr
                      key={row.index}
                      onClick={() => row.isValid && handleToggleSelectRow(row.index)}
                      className={`transition-colors cursor-pointer ${
                        !row.isValid
                          ? 'bg-red-950/20 text-zinc-400 opacity-60'
                          : row.selected
                          ? 'bg-emerald-950/20 hover:bg-emerald-950/30'
                          : 'hover:bg-zinc-900/60'
                      }`}
                    >
                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={!row.isValid}
                          onChange={() => handleToggleSelectRow(row.index)}
                          className="w-4 h-4 rounded text-emerald-500 border-zinc-700 focus:ring-emerald-500"
                        />
                      </td>

                      <td className="p-3 whitespace-nowrap font-mono">
                        {row.isValid ? (
                          <span className="text-emerald-300 font-bold">{row.rawDate}</span>
                        ) : (
                          <span className="text-red-400 font-semibold">{row.error}</span>
                        )}
                      </td>

                      <td className="p-3 font-semibold text-white max-w-xs truncate">
                        {row.title || <span className="text-red-400 italic">Sem título</span>}
                      </td>

                      <td className="p-3 whitespace-nowrap">
                        {row.type === 'sociedade' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1">
                            <Building className="w-2.5 h-2.5" /> Sociedade
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Terceiro (Ocupado)
                          </span>
                        )}
                      </td>

                      <td className="p-3 whitespace-nowrap text-zinc-400 font-mono">
                        {row.startTime} - {row.endTime}
                      </td>

                      <td className="p-3 text-zinc-300 whitespace-nowrap">
                        {row.location}
                      </td>

                      <td className="p-3 text-zinc-400 max-w-xs truncate" title={row.notes}>
                        {row.notes || <span className="text-zinc-600">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-zinc-800 shrink-0">
          <div className="text-xs text-zinc-400 text-center sm:text-left">
            {parsedRows.length > 0 ? (
              <span>
                <strong>{selectedCount}</strong> evento(s) selecionado(s) para gravação no banco de dados.
              </span>
            ) : (
              <span>Baixe o modelo acima para conferir o padrão de colunas recomendado.</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            {parsedRows.length > 0 && (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={importing || selectedCount === 0}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Importando ({importProgress.current}/{importProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Gravar {selectedCount} Eventos no Banco</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
