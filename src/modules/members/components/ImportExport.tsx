/** Importação (CSV com pré-visualização e deduplicação) e exportação auditada de sócios. */
import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { buildSafeCsv, downloadCsv } from '../../../utils/csv.ts';
import { localDateKey } from '../../../shared/dates.ts';
import { Badge, Button, Field, Modal, Notice, Select, Textarea, Toggle } from '../../../ui/index.tsx';
import { buildRows, guessMapping, IMPORT_FIELDS, parseCsv, type ImportKey } from '../csvParse.ts';

interface Preview {
  row: number;
  fullName: string;
  problem: string;
  action: 'criar' | 'ignorar';
}

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [data, setData] = useState<string[][]>([]);
  const [map, setMap] = useState<Partial<Record<ImportKey, number>>>({});
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const [error, setError] = useState('');
  const headers = data[0] || [];
  const body = data.slice(1);

  const reset = () => {
    setData([]);
    setMap({});
    setPreview(null);
    setCreated(null);
    setError('');
  };

  const load = async (f: File | undefined) => {
    reset();
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return setError('Arquivo grande demais (máximo de 5 MB).');
    if (/\.xlsx?$/i.test(f.name)) return setError('Salve a planilha como CSV (no Excel: Arquivo, Salvar como, CSV UTF-8) e envie de novo.');
    const rows = parseCsv(await f.text());
    if (rows.length < 2) return setError('O arquivo precisa ter a linha de títulos e pelo menos uma pessoa.');
    if (rows.length > 2001) return setError('Envie no máximo 2.000 pessoas por vez.');
    setData(rows);
    setMap(guessMapping(rows[0]));
  };

  const rows = () => buildRows(body, map);

  const check = async () => {
    setError('');
    if (map.fullName === undefined) return setError('Indique a coluna do nome.');
    const r = rows();
    if (!r.length) return setError('Nenhuma linha com nome válido.');
    const res = await run<{ preview: Preview[] }>('members.import', { tenantId: t.tenantId, rows: r, commit: false });
    if (res) setPreview(res.preview);
  };

  const commit = async () => {
    const res = await run<{ created: number }>('members.import', { tenantId: t.tenantId, rows: rows(), commit: true }, { success: 'Importação concluída.' });
    if (res) setCreated(res.created);
  };

  const ok = preview?.filter(p => p.action === 'criar').length || 0;

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={`Importar ${t.labels.members.toLowerCase()}`}
      size="lg"
      footer={
        created !== null ? (
          <Button onClick={() => (reset(), onClose())}>Fechar</Button>
        ) : preview ? (
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              Voltar ao mapeamento
            </Button>
            <Button loading={busy} disabled={!ok} onClick={commit}>
              Importar {ok} {ok === 1 ? 'pessoa' : 'pessoas'}
            </Button>
          </>
        ) : (
          <Button loading={busy} disabled={!data.length} onClick={check}>
            Conferir antes de importar
          </Button>
        )
      }
    >
      {created !== null ? (
        <Notice tone="ok">
          {created} cadastros criados. Quem veio como ativo já recebeu matrícula e validade; os demais estão pendentes de aprovação.
        </Notice>
      ) : (
        <>
          <Notice>
            Use um CSV com a primeira linha de títulos (separador ponto e vírgula ou vírgula). Datas como 31/12/1990. CPFs e e-mails repetidos são ignorados. Os consentimentos opcionais entram desmarcados.
          </Notice>
          <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-line cursor-pointer hover:border-muted">
            <FileUp className="w-5 h-5 text-muted" aria-hidden />
            <span className="text-sm">{data.length ? `${body.length} linhas carregadas. Trocar arquivo` : 'Escolher arquivo CSV'}</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => load(e.target.files?.[0])} />
          </label>
          {error && <Notice tone="bad">{error}</Notice>}
          {data.length > 0 && !preview && (
            <div className="grid sm:grid-cols-2 gap-3">
              {IMPORT_FIELDS.map(f => (
                <Field key={f.key} label={f.label} required={'required' in f && f.required}>
                  {id => (
                    <Select id={id} value={map[f.key] ?? ''} onChange={e => setMap(m => ({ ...m, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                      <option value="">Não importar</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Coluna ${i + 1}`}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ))}
            </div>
          )}
          {preview && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge tone="ok">{ok} serão criados</Badge>
                <Badge tone="warn">{preview.length - ok} ignorados</Badge>
              </div>
              <div className="max-h-80 overflow-y-auto custom-scrollbar rounded-xl border border-line divide-y divide-line">
                {preview.map(p => (
                  <div key={p.row} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="truncate">
                      <span className="text-muted tabular-nums mr-2">{p.row}</span>
                      {p.fullName}
                    </span>
                    {p.problem ? <Badge tone="warn">{p.problem}</Badge> : <Badge tone="ok">Criar</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export function ExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [purpose, setPurpose] = useState('');
  const [contacts, setContacts] = useState(false);
  const [cpf, setCpf] = useState(false);
  const canPii = t.can('pii', 'ver');
  const go = async () => {
    const r = await run<{ rows: Record<string, string>[] }>('members.export', { tenantId: t.tenantId, purpose: purpose.trim(), includeContacts: contacts, includeCpf: cpf });
    if (!r) return;
    const headers = Object.keys(r.rows[0] || { matricula: '', nome: '', categoria: '', situacao: '', validade: '', entrada: '' });
    downloadCsv(buildSafeCsv(headers, r.rows.map(x => headers.map(h => x[h] ?? ''))), `${t.slug}-socios-${localDateKey(new Date(), t.tenant.timezone)}.csv`);
    setPurpose('');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Exportar ${t.labels.members.toLowerCase()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} disabled={purpose.trim().length < 5} onClick={go}>
            Gerar CSV
          </Button>
        </>
      }
    >
      <Notice tone="warn">A exportação fica registrada na auditoria com a finalidade informada. Leve só o necessário e apague o arquivo quando não precisar mais.</Notice>
      <Field label="Finalidade" required hint="Exemplo: lista de presença da assembleia de dezembro">
        {id => <Textarea id={id} value={purpose} maxLength={200} onChange={e => setPurpose(e.target.value)} />}
      </Field>
      <Toggle checked={contacts} onChange={setContacts} label="Incluir e-mail e telefone" disabled={!canPii} />
      <Toggle checked={cpf} onChange={setCpf} label="Incluir CPF completo" disabled={!canPii} />
      {!canPii && <p className="text-xs text-muted">Seu papel não inclui dados pessoais; a lista sai só com nome, categoria e situação.</p>}
      {cpf && <Notice tone="bad">CPF completo é dado sensível para vazamento. Só marque se a finalidade exigir.</Notice>}
    </Modal>
  );
}
