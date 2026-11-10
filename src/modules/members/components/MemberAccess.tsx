/**
 * Acesso ao portal direto no cadastro do sócio: quem gerencia papéis dá ao sócio um ou mais papéis
 * (Tesoureiro, Secretaria, Agenda, um papel criado pela própria sociedade...). As permissões de cada
 * papel ficam em Configurações, Papéis e pessoas. Usa memberships.setRoles (o servidor confere tudo).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useDoc, useList, useOp, useSession } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { P } from '../../../shared/paths.ts';
import { MODULES } from '../../../shared/modules.ts';
import type { MemberDoc, MembershipDoc, OrgChartDoc, RoleDoc } from '../../../shared/types.ts';
import { Badge, Button, Notice } from '../../../ui/index.tsx';
import { MultiPick } from '../../card/design/MultiPick.tsx';
import { roleForTitle } from '../../../shared/roleMatch.ts';

/** O que o papel libera: primeiro onde mexe (criar, editar, aprovar), depois quantas áreas só vê */
function roleSummary(r: RoleDoc): string {
  const label = (m: string) => MODULES.find(x => x.id === m)?.label || m;
  const entries = Object.entries(r.perms || {}).filter(([, a]) => (a as string[])?.length);
  const edits = entries.filter(([, a]) => (a as string[]).some(x => x !== 'ver')).map(([m]) => label(m));
  const views = entries.length - edits.length;
  if (!entries.length) return 'só a área do sócio';
  const head = edits.length ? `mexe em ${edits.slice(0, 4).join(', ')}${edits.length > 4 ? ` e mais ${edits.length - 4}` : ''}` : '';
  const tail = views ? `${head ? '; ' : ''}só vê ${views} área${views > 1 ? 's' : ''}` : '';
  return head + tail;
}

export function MemberAccess({ m }: { m: MemberDoc & { id: string } }) {
  const t = useTenant();
  const session = useSession();
  const { run, busy } = useOp();
  const canRoles = t.can('papeis', 'aprovar');
  const ms = useDoc<MembershipDoc>(canRoles && m.uid ? P.membership(t.tenantId, m.uid) : null);
  const roles = useList<RoleDoc>(canRoles ? P.roles(t.tenantId) : null, { limit: 50 });
  const chart = useDoc<OrgChartDoc>(canRoles ? P.orgchart(t.tenantId) : null);
  const [sel, setSel] = useState<string[]>([]);
  const current = ms.data?.roleIds || [];
  useEffect(() => setSel(ms.data?.roleIds || []), [ms.data?.roleIds]);
  if (!canRoles) return null;

  const byName = (names: string[]) => roles.data.filter(r => names.includes(r.name)).map(r => r.id);
  const nameOf = (id: string) => roles.data.find(r => r.id === id)?.name || id;
  const extra = roles.data.filter(r => r.id !== 'socio');
  const own = m.uid && m.uid === session.user?.uid;
  const changed = sel.join(',') !== current.join(',');
  // Cargos da pessoa no organograma e o papel de mesmo nome (Secretário(a) -> papel Secretário(a))
  const positions = (chart.data?.positions || []).filter(p => p.memberId === m.id);
  const suggest = positions
    .map(p => ({ p, role: p.roleId ? undefined : roleForTitle(p.title, extra) }))
    .filter(x => x.role && !sel.includes(x.role.id));
  const save = () => run('memberships.setRoles', { tenantId: t.tenantId, uid: m.uid, roleIds: ['socio', ...sel.filter(x => x !== 'socio')].slice(0, 5) }, { success: 'Acesso atualizado. Vale na hora.' });

  return (
    <section className="space-y-2 p-3 rounded-xl border border-line">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-accent" aria-hidden /> Acesso ao portal (permissões)
      </h3>
      {!m.uid ? (
        <Notice>
          {m.fullName.split(' ')[0]} ainda não entrou no portal com a conta Google. Mande o convite (logo abaixo, em Ações) e, depois que entrar, volte aqui para dar as permissões.
        </Notice>
      ) : own ? (
        <Notice>Este é o seu cadastro. Você não pode mudar o seu próprio acesso: peça a outra pessoa que gerencia papéis.</Notice>
      ) : ms.loading || roles.loading ? null : (
        <>
          <p className="text-xs text-muted">
            Todo {t.labels.member.toLowerCase()} já vê a área do sócio. Para ajudar a gestão (ex.: o financeiro, a agenda, os cadastros), marque um ou mais papéis. Dá para criar papéis novos, só com o que precisar, em{' '}
            <Link to={t.to('configuracoes')} className="underline font-semibold">
              Configurações, Papéis e pessoas
            </Link>
            .
          </p>
          <div className="flex flex-wrap gap-1">
            {current.map(r => (
              <Badge key={r} tone={r === 'socio' ? 'neutral' : 'brand'}>
                {nameOf(r)}
              </Badge>
            ))}
          </div>
          {positions.length > 0 && (
            <p className="text-xs">
              Cargo no organograma: <strong>{positions.map(p => p.title).join(', ')}</strong>
              {positions.some(p => !p.roleId) && <span className="text-muted"> (o cargo sozinho não dá acesso; marque o papel aqui ou ligue o acesso ao cargo no organograma)</span>}
            </p>
          )}
          {suggest.map(({ p, role }) => (
            <Button key={p.id} size="sm" variant="secondary" onClick={() => setSel(x => [...x, role!.id])}>
              Dar o acesso de {role!.name}, como o cargo
            </Button>
          ))}
          <MultiPick
            label="Papéis do sócio"
            options={extra.map(r => r.name)}
            values={sel.filter(x => x !== 'socio').map(nameOf)}
            onChange={names => setSel(['socio', ...byName(names)])}
          />
          {sel.filter(x => x !== 'socio').length > 4 && <p className="text-xs text-warn">No máximo 4 papéis além de sócio.</p>}
          <ul className="text-xs text-muted space-y-0.5">
            {extra
              .filter(r => sel.includes(r.id))
              .map(r => (
                <li key={r.id}>
                  <strong>{r.name}:</strong> {roleSummary(r)}
                </li>
              ))}
          </ul>
          <div className="flex justify-end">
            <Button size="sm" loading={busy} disabled={!changed || sel.filter(x => x !== 'socio').length > 4} onClick={save}>
              Salvar acesso
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
