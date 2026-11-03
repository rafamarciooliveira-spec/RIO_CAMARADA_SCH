import React, { useState } from 'react';
import { Member, MemberCategory } from '../types/index.ts';
import { DEFAULT_OFFICIAL_EXPIRY } from '../utils/security.ts';
import { validateCPF, cleanCPF, maskCPF } from '../utils/cpf.ts';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useDialog } from '../context/DialogContext.tsx';
import {
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  X,
  FileCheck,
  Users,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  existingMembersCount?: number;
}

interface ParsedRow {
  line: number;
  fullName: string;
  cpf: string;
  birthDate: string;
  email: string;
  phone?: string;
  category: MemberCategory;
  isValid: boolean;
  errors: string[];
}

export const MemberExcelImporterModal: React.FC<Props> = ({
  isOpen,
  onClose,
  existingMembersCount = 0,
}) => {
  const { currentUser, syncPublicCard } = useAuth();
  const dialog = useDialog();

  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);

  if (!isOpen) return null;

  const handleParseData = (text: string) => {
    setRawText(text);
    if (!text.trim()) {
      setParsedRows([]);
      return;
    }

    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    const parsed: ParsedRow[] = [];

    lines.forEach((lineStr, idx) => {
      // Skip header if line contains 'nome' or 'cpf'
      if (idx === 0 && (lineStr.toLowerCase().includes('nome') || lineStr.toLowerCase().includes('cpf'))) {
        return;
      }

      // Detect separator: tab, comma, or semicolon
      let parts = lineStr.split('\t');
      if (parts.length < 3) parts = lineStr.split(';');
      if (parts.length < 3) parts = lineStr.split(',');

      const fullName = (parts[0] || '').trim();
      const rawCpf = (parts[1] || '').trim();
      const rawBirth = (parts[2] || '').trim();
      const email = (parts[3] || '').trim().toLowerCase();
      const phone = (parts[4] || '').trim();
      const category = (parts[5] || 'Sócio Efetivo').trim();

      const errors: string[] = [];

      if (!fullName || fullName.length < 3) {
        errors.push('Nome completo inválido ou muito curto');
      }

      const cleanedCpf = cleanCPF(rawCpf);
      if (!cleanedCpf || !validateCPF(cleanedCpf)) {
        errors.push(`CPF inválido (${rawCpf || 'vazio'})`);
      }

      if (!email || !email.includes('@')) {
        errors.push('E-mail inválido');
      }

      parsed.push({
        line: idx + 1,
        fullName,
        cpf: cleanedCpf,
        birthDate: rawBirth,
        email,
        phone: phone || undefined,
        category,
        isValid: errors.length === 0,
        errors,
      });
    });

    setParsedRows(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      if (content) handleParseData(content);
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      await dialog.alert('Nenhuma linha válida encontrada para importar.');
      return;
    }

    const confirmed = await dialog.confirm(
      `Confirma a importação de ${validRows.length} sócios válidos para o banco de dados?`,
      { title: 'Confirmar Importação de Sócios' }
    );
    if (!confirmed) return;

    setImporting(true);
    try {
      let importedCount = 0;
      let nextNum = existingMembersCount + 1;

      for (const row of validRows) {
        const id = 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const membershipNumber = `SOC-${String(nextNum).padStart(6, '0')}`;
        nextNum++;

        const newMember: Member = {
          id,
          userId: '',
          fullName: row.fullName,
          cpf: row.cpf,
          birthDate: row.birthDate,
          email: row.email,
          phone: row.phone,
          membershipNumber,
          category: row.category,
          status: 'aprovado',
          lgpdConsent: true,
          lgpdConsentDate: new Date().toISOString(),
          allowBirthdayPublic: false,
          allowEventPhotos: true,
          allowCommunications: true,
          consentVersion: 'v2_importacao_planilha',
          validUntil: DEFAULT_OFFICIAL_EXPIRY,
          renewalCount: 0,
          mustChangePassword: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await setDoc(doc(db, 'members', id), newMember);
        await syncPublicCard(newMember);
        importedCount++;
      }

      await dialog.alert(
        `Importação concluída com sucesso! ${importedCount} novos sócios cadastrados e aprovados com matrículas sequenciais.`,
        { title: 'Importação Finalizada' }
      );
      onClose();
    } catch (err: any) {
      await dialog.alert(`Erro na importação: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Importação de Sócios por Planilha</h2>
              <p className="text-xs text-zinc-400">
                Importe lotes com validação de CPF linha a linha e geração de matrícula automática
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Instructions */}
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 text-xs text-zinc-300 leading-relaxed">
            <strong>Formato das Colunas (separado por vírgula, ponto-e-vírgula ou tabulação):</strong>
            <p className="font-mono text-emerald-400 mt-1">
              Nome Completo | CPF | Data Nascimento (AAAA-MM-DD ou DD/MM/AAAA) | E-mail | Telefone | Categoria
            </p>
          </div>

          {/* File Upload or Textarea */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-semibold">Colar Dados ou Carregar Arquivo CSV:</label>
              <label className="cursor-pointer text-xs font-semibold text-emerald-400 hover:underline flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" /> Escolher arquivo CSV
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            <textarea
              rows={4}
              value={rawText}
              onChange={e => handleParseData(e.target.value)}
              placeholder="Cole aqui as linhas da sua planilha..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Validation Counters */}
          {parsedRows.length > 0 && (
            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" /> {validCount} linha(s) válida(s)
              </span>
              {invalidCount > 0 && (
                <span className="flex items-center gap-1.5 text-rose-400">
                  <XCircle className="w-4 h-4" /> {invalidCount} linha(s) com erro
                </span>
              )}
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="border border-zinc-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] font-semibold sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Linha</th>
                    <th className="py-2 px-3">Nome</th>
                    <th className="py-2 px-3">CPF</th>
                    <th className="py-2 px-3">E-mail</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {parsedRows.map((r, i) => (
                    <tr key={i} className={r.isValid ? 'bg-zinc-900/40' : 'bg-rose-950/20'}>
                      <td className="py-2 px-3 font-mono text-zinc-500">{r.line}</td>
                      <td className="py-2 px-3 font-medium text-white">{r.fullName}</td>
                      <td className="py-2 px-3 font-mono text-zinc-300">{r.cpf ? maskCPF(r.cpf) : '-'}</td>
                      <td className="py-2 px-3 text-zinc-400">{r.email}</td>
                      <td className="py-2 px-3">
                        {r.isValid ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> OK
                          </span>
                        ) : (
                          <span className="text-rose-400 text-[11px] font-semibold" title={r.errors.join(', ')}>
                            {r.errors[0]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            Matrículas serão geradas a partir de SOC-{String(existingMembersCount + 1).padStart(6, '0')}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-zinc-800 text-white rounded-xl text-xs font-semibold">
              Cancelar
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={importing || validCount === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md"
            >
              {importing ? 'Importando...' : `Importar ${validCount} Sócios`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
