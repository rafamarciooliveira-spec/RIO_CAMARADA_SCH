/**
 * Códigos de primeiro acesso para vários sócios de uma vez: a diretoria marca quem ainda não entra no portal,
 * gera os códigos e imprime uma folha por pessoa (nome, código e QR) para entregar em evento ou na secretaria.
 */
import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useList, useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { P } from '../../../shared/paths.ts';
import type { MemberDoc } from '../../../shared/types.ts';
import { Button, Loading, Modal, Notice, Toggle, useToast } from '../../../ui/index.tsx';
import { printAccessSheets } from './AccessCodeBlock.tsx';

type Done = { memberId: string; name: string; code: string; expiresAt: string; link: string };

export function BulkAccessCodes({ onClose }: { onClose: () => void }) {
  const t = useTenant();
  const toast = useToast();
  const { run, busy } = useOp();
  const list = useList<MemberDoc>(P.members(t.tenantId), { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso', 'pendente']]], orderBy: [['fullName', 'asc']], limit: 1000 });
  const [onlyNew, setOnlyNew] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ done: Done[]; skipped: { name: string; reason: string }[] } | null>(null);
  const rows = useMemo(() => list.data.filter(m => !onlyNew || !m.uid), [list.data, onlyNew]);
  const toggle = (id: string) => setSel(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else if (n.size < 60) n.add(id);
    return n;
  });
  const allOn = rows.length > 0 && rows.slice(0, 60).every(m => sel.has(m.id));
  const generate = async () => {
    const r = await run<{ done: Done[]; skipped: { name: string; reason: string }[] }>('access.createCodes', { tenantId: t.tenantId, memberIds: [...sel] });
    if (r) setResult(r);
  };
  const print = async () => {
    if (!result?.done.length) return;
    if (!(await printAccessSheets(result.done, t.tenant.name, t.tenant.timezone))) toast.show('O navegador bloqueou a janela de impressão. Libere janelas para este site.', 'erro');
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Códigos de acesso para vários sócios"
      size="lg"
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={onClose}>Fechar</Button>
            <Button icon={<Printer className="w-4 h-4" />} disabled={!result.done.length} onClick={print}>
              Imprimir {result.done.length} folha{result.done.length === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button loading={busy} disabled={!sel.size} onClick={generate}>
              Gerar {sel.size || ''} código{sel.size === 1 ? '' : 's'}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <Notice tone="ok">
            {result.done.length} código{result.done.length === 1 ? '' : 's'} gerado{result.done.length === 1 ? '' : 's'}. Cada um vale 3 dias e uma vez só. Toque em Imprimir: sai uma folha por pessoa, com o nome, o código, o QR e o passo a passo.
          </Notice>
          {result.skipped.length > 0 && (
            <Notice tone="warn">
              <div className="font-semibold mb-1">Ficaram de fora ({result.skipped.length}):</div>
              <ul className="list-disc pl-4 space-y-0.5">{result.skipped.map(x => <li key={x.name}>{x.name}: {x.reason}</li>)}</ul>
            </Notice>
          )}
          <ul className="divide-y divide-line rounded-xl border border-line max-h-72 overflow-auto custom-scrollbar">
            {result.done.map(x => (
              <li key={x.memberId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="truncate">{x.name}</span>
                <span className="font-mono font-bold tracking-widest">{x.code}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : list.loading ? (
        <Loading />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">Marque quem vai receber o código (até 60 por vez). Bom para entregar em mãos num evento ou na secretaria. Quem não tem CPF no cadastro fica de fora, com o aviso.</p>
          <Toggle checked={onlyNew} onChange={setOnlyNew} label="Só quem ainda não entra no portal" />
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input type="checkbox" className="w-5 h-5" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.slice(0, 60).map(m => m.id)))} />
            Marcar {rows.length > 60 ? 'os 60 primeiros' : 'todos'} ({Math.min(rows.length, 60)})
          </label>
          <ul className="divide-y divide-line rounded-xl border border-line max-h-80 overflow-auto custom-scrollbar">
            {rows.map(m => (
              <li key={m.id}>
                <label className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer">
                  <input type="checkbox" className="w-5 h-5" checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
                  <span className="flex-1 truncate">{m.fullName}</span>
                  {m.dependentOf && <span className="text-xs text-muted">dependente</span>}
                  {m.uid && <span className="text-xs text-muted">já entra</span>}
                </label>
              </li>
            ))}
            {rows.length === 0 && <li className="px-3 py-4 text-sm text-muted">Todos já entram no portal.</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}
