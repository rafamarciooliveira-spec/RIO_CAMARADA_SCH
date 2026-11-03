/** Ativar ou desativar a notificação no celular (push) neste aparelho. */
import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { useData } from '../../app/DataContext.tsx';
import type { PushState } from '../../data/client.ts';
import { errorMessage } from '../../data/client.ts';
import { Button, Card, Notice, useToast } from '../../ui/index.tsx';

const TEXT: Record<PushState, string> = {
  ativo: 'Ativas neste aparelho. Avisos, aprovações, cobranças e votações chegam mesmo com o portal fechado.',
  desligado: 'Desligadas neste aparelho.',
  negado: 'O navegador está bloqueando as notificações deste site. Libere nas configurações do navegador (cadeado ao lado do endereço) e tente de novo.',
  indisponivel: 'Este navegador ou este ambiente não recebe notificações. No iPhone, primeiro adicione o portal à Tela de Início (Compartilhar > Adicionar à Tela de Início).',
  demo: 'Na demonstração as notificações no celular não são enviadas.',
};

export function PushToggle() {
  const { client } = useData();
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    client.pushState().then(setState).catch(() => setState('indisponivel'));
  }, [client]);
  if (!state) return null;
  const toggle = async () => {
    setBusy(true);
    try {
      if (state === 'ativo') {
        await client.disablePush();
        setState('desligado');
        toast.show('Notificações desligadas neste aparelho.', 'info');
      } else {
        const r = await client.enablePush();
        setState(r);
        if (r === 'ativo') toast.show('Pronto! Você vai receber as notificações neste aparelho.', 'sucesso');
      }
    } catch (e) {
      toast.show(errorMessage(e), 'erro');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2 font-semibold">
        <BellRing className="w-4 h-4 text-accent" aria-hidden />
        Notificações no celular
      </div>
      <Notice tone={state === 'ativo' ? 'ok' : state === 'negado' ? 'warn' : 'info'}>{TEXT[state]}</Notice>
      {(state === 'ativo' || state === 'desligado' || state === 'negado') && (
        <Button variant={state === 'ativo' ? 'secondary' : 'primary'} loading={busy} onClick={toggle}>
          {state === 'ativo' ? 'Desligar neste aparelho' : 'Ativar neste aparelho'}
        </Button>
      )}
    </Card>
  );
}
