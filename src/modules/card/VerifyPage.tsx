/** Validação pública do QR (/{slug}/v/{token}): resposta mínima, grande e clara. */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, ShieldAlert, XCircle } from 'lucide-react';
import { useData } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { errorMessage } from '../../data/client.ts';
import { formatDate, formatDateTime, tzLabel } from '../../shared/dates.ts';
import { VERIFY_LABEL } from '../../shared/memberStatus.ts';
import type { VerifyResult } from '../../shared/types.ts';
import { Button, ErrorState, Loading } from '../../ui/index.tsx';

const STYLE = {
  valido: { bg: 'bg-emerald-700', icon: CheckCircle2, text: 'Carteirinha válida agora' },
  expirado: { bg: 'bg-amber-700', icon: Clock, text: 'QR vencido. Peça para abrir a carteirinha no portal e mostrar o QR atual.' },
  suspenso: { bg: 'bg-red-700', icon: ShieldAlert, text: 'Carteirinha suspensa. Encaminhe para a diretoria.' },
  invalido: { bg: 'bg-red-700', icon: XCircle, text: 'Este QR não pertence a uma carteirinha válida desta sociedade.' },
} as const;

export default function VerifyPage() {
  const t = useTenant();
  const { client } = useData();
  const { token = '' } = useParams();
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [error, setError] = useState('');
  const [n, setN] = useState(0);

  useEffect(() => {
    let alive = true;
    setRes(null);
    setError('');
    client
      .call<VerifyResult>('card.verify', { slug: t.slug, token })
      .then(r => alive && setRes(r))
      .catch(e => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [client, t.slug, token, n]);

  if (error)
    return (
      <div className="max-w-md mx-auto p-6 space-y-3">
        <ErrorState text={error} />
        <Button variant="secondary" onClick={() => setN(x => x + 1)}>
          Tentar de novo
        </Button>
      </div>
    );
  if (!res) return <Loading label="Conferindo a carteirinha..." />;
  const s = STYLE[res.status];
  const Icon = s.icon;
  return (
    <main className={`min-h-screen ${s.bg} text-white flex flex-col items-center justify-center p-6 text-center`}>
      <div role="status" aria-live="assertive" className="w-full max-w-md space-y-5">
        <Icon className="w-24 h-24 mx-auto" aria-hidden />
        <div>
          <div className="text-sm uppercase tracking-[0.25em] opacity-90">{res.tenantName || t.tenant.name}</div>
          <h1 className="text-5xl font-black mt-2">{VERIFY_LABEL[res.status]}</h1>
          <p className="mt-3 text-lg">{s.text}</p>
        </div>
        {res.status === 'valido' && (
          <div className="bg-white/15 rounded-3xl p-5 flex items-center gap-4 text-left">
            {res.photoUrl && <img src={res.photoUrl} alt={`Foto de ${res.displayName || 'sócio'}`} className="w-24 h-28 rounded-2xl object-cover border-2 border-white/60" />}
            <dl className="space-y-1 min-w-0">
              <dt className="sr-only">Nome</dt>
              <dd className="text-2xl font-bold break-words">{res.displayName}</dd>
              {res.categoryName && (
                <>
                  <dt className="text-xs opacity-80">Categoria</dt>
                  <dd className="font-semibold">{res.categoryName}</dd>
                </>
              )}
              <dt className="text-xs opacity-80">Validade</dt>
              <dd className="font-semibold">{res.validUntil ? formatDate(res.validUntil) : 'Sem prazo'}</dd>
            </dl>
          </div>
        )}
        {res.status === 'valido' && (
          <p className="text-sm font-semibold rounded-xl px-3 py-2 bg-black/20">
            Compare com a carteirinha apresentada: o nome, a categoria e a validade precisam ser iguais aos daqui. Se forem diferentes, o documento foi alterado.
          </p>
        )}
        <p className="text-xs opacity-90">
          Conferido em {formatDateTime(res.checkedAt, t.tenant.timezone)} ({tzLabel(t.tenant.timezone)}). Só esta página, aberta pelo QR, prova a validade. Prints, fotos e arquivos baixados não servem de prova sozinhos.
        </p>
      </div>
    </main>
  );
}
