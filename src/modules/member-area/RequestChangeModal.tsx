/** Sócio aprovado pede mudança de nome, nascimento ou CPF (dele ou do dependente), ou a retirada de um dependente. */
import { useState } from 'react';
import { useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { formatCPF } from '../../shared/cpf.ts';
import type { MemberDoc } from '../../shared/types.ts';
import { Button, Field, Input, Modal, Notice, Textarea } from '../../ui/index.tsx';

export function RequestChangeModal({ m, kind, birthDate, onClose }: { m: MemberDoc & { id: string }; kind: 'dados' | 'remover'; birthDate?: string; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [fullName, setFullName] = useState(m.fullName);
  const [birth, setBirth] = useState(birthDate || '');
  const [cpf, setCpf] = useState('');
  const [note, setNote] = useState('');
  const send = async () => {
    const input: Record<string, unknown> = { tenantId: t.tenantId, memberId: m.id, kind };
    if (kind === 'dados') {
      if (fullName.trim() !== m.fullName) input.fullName = fullName.trim();
      if (birth && birth !== birthDate) input.birthDate = birth;
      if (cpf.trim()) input.cpf = cpf.trim();
    }
    if (note.trim()) input.note = note.trim();
    const r = await run('members.requestChange', input, { success: 'Pedido enviado. A diretoria vai analisar e você recebe um aviso.' });
    if (r) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'remover' ? `Retirar ${m.displayName}` : 'Pedir alteração do cadastro'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={send}>
            Enviar para aprovação
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Notice>
          {kind === 'remover'
            ? `Quando a ${t.labels.board.toLowerCase()} aprovar, este dependente sai do seu cadastro e a carteirinha dele deixa de valer.`
            : `O cadastro continua como está até a ${t.labels.board.toLowerCase()} aprovar. Telefone e endereço você muda direto, sem pedido.`}
        </Notice>
        {kind === 'dados' && (
          <>
            <Field label="Nome completo">{id => <Input id={id} value={fullName} maxLength={150} onChange={e => setFullName(e.target.value)} />}</Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Nascimento">{id => <Input id={id} type="date" value={birth} onChange={e => setBirth(e.target.value)} />}</Field>
              <Field label="CPF novo ou corrigido">{id => <Input id={id} inputMode="numeric" value={cpf} maxLength={14} onChange={e => setCpf(formatCPF(e.target.value))} />}</Field>
            </div>
          </>
        )}
        <Field label="Observação para a diretoria (opcional)">{id => <Textarea id={id} value={note} maxLength={300} onChange={e => setNote(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}
