/**
 * Dependentes: avisos de idade (passa a pagar, chega ao limite de idade) e passagem a sócio titular.
 * A rotina diária avisa o titular e a diretoria uma vez por marco (guardado em ageAlerts).
 */
import { defineOp, fail, registerJobs, zId, zTenant } from '../core/ops.ts';
import { deleteField } from '../core/store.ts';
import { P } from '../paths.ts';
import { daysBetweenKeys, formatDate, localDateKey } from '../dates.ts';
import { formatBRL } from '../money.ts';
import { birthDateOf, dependentRules, dependentTimeline } from '../dependents.ts';
import type { MemberDoc, MemberPiiDoc } from '../types.ts';
import { boardUids, getSettings, notify, tid } from './helpers.ts';

const ACTIVE = ['aprovado', 'ativo', 'em_atraso'];

registerJobs([
  {
    name: 'members.dependentAges',
    async run(ctx) {
      const t = tid(ctx);
      const settings = await getSettings(ctx);
      const rules = dependentRules(settings);
      if (!rules.freeUntilAge && !rules.maxAge) return;
      const today = localDateKey(ctx.now(), ctx.tenant?.timezone);
      const deps = await ctx.store.query<MemberDoc>(P.members(t), { where: [['dependentOf', '>', '']], limit: 3000 });
      let board: string[] | null = null;
      for (const d of deps) {
        if (!ACTIVE.includes(d.data.status)) continue;
        let birth = birthDateOf(d.data);
        if (!birth) {
          // Cadastro antigo sem o ano no cadastro básico: completa a partir dos dados pessoais
          birth = (await ctx.store.get<MemberPiiDoc>(P.memberPii(t, d.id)))?.birthDate || null;
          if (!birth) continue;
          await ctx.store.update(P.member(t, d.id), { birthYear: Number(birth.slice(0, 4)) });
        }
        const cat = settings.categories.find(c => c.id === d.data.categoryId);
        const tl = dependentTimeline(rules, birth, today, cat && cat.period !== 'isento' ? cat.feeCents : 0);
        const sent = new Set(d.data.ageAlerts || []);
        const holder = await ctx.store.get<MemberDoc>(P.member(t, d.data.dependentOf!));
        const say = async (key: string, title: string, body: string, toBoard: boolean) => {
          if (sent.has(key)) return;
          sent.add(key);
          await notify(ctx, holder?.uid, title, body, 'dependentes', { push: true });
          if (toBoard) {
            board ||= await boardUids(ctx);
            for (const uid of board) await notify(ctx, uid, title, body, 'socios');
          }
        };
        if (tl.paysFrom) {
          const days = daysBetweenKeys(today, tl.paysFrom);
          if (days >= 0 && days <= 30) {
            const value = rules.mode === 'valor_fixo' ? rules.feeCents : cat?.feeCents || 0;
            await say(`paga_${tl.paysFrom.slice(0, 4)}`, `${d.data.displayName} passa a pagar`, `Em ${formatDate(tl.paysFrom)} completa ${rules.freeUntilAge} anos: a mensalidade da família passa a incluir ${formatBRL(value)} por ${d.data.displayName}.`, false);
          }
        }
        if (tl.limitAt) {
          const days = daysBetweenKeys(today, tl.limitAt);
          if (days > 0 && days <= 60) {
            await say(`limite_prox_${tl.limitAt.slice(0, 4)}`, `${d.data.displayName} está chegando ao limite de idade`, `Em ${formatDate(tl.limitAt)} completa ${rules.maxAge} anos e deixa de poder ser dependente. Para continuar na sociedade, vai precisar do próprio cadastro de sócio.`, true);
          } else if (days <= 0) {
            await say(`limite_${tl.limitAt.slice(0, 4)}`, `${d.data.displayName} passou do limite de idade`, `Completou ${rules.maxAge} anos e não pode mais ser dependente. A diretoria pode tornar o cadastro de sócio titular.`, true);
          }
        }
        if (sent.size !== (d.data.ageAlerts || []).length) await ctx.store.update(P.member(t, d.id), { ageAlerts: [...sent].slice(-20) });
      }
    },
  },
]);

/** A diretoria transforma o dependente em sócio titular (ex.: passou do limite de idade) */
export const promoteDependent = defineOp({
  name: 'members.promoteDependent',
  input: zTenant.extend({ memberId: zId, categoryId: zId }),
  auth: 'user',
  tenant: { perm: ['socios', 'aprovar'] },
  idempotent: true,
  async run(ctx, input) {
    const t = tid(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Cadastro não encontrado.');
    if (!m!.dependentOf) fail('failed-precondition', 'Este cadastro já é de sócio titular.');
    const settings = await getSettings(ctx);
    const cat = settings.categories.find(c => c.id === input.categoryId);
    if (!cat) fail('invalid-argument', 'Categoria inexistente.');
    const holder = await ctx.store.get<MemberDoc>(P.member(t, m!.dependentOf!));
    await ctx.store.update(P.member(t, input.memberId), { dependentOf: deleteField(), categoryId: cat!.id, categoryName: cat!.name, ageAlerts: [], updatedAt: ctx.nowIso });
    await ctx.store.add(P.memberHistory(t, input.memberId), { from: m!.status, to: m!.status, reason: `Deixou de ser dependente de ${holder?.displayName || 'titular'} e passou a sócio titular`, byUid: ctx.actor!.uid, at: ctx.nowIso });
    await notify(ctx, holder?.uid, 'Dependente virou sócio titular', `${m!.displayName} agora tem o próprio cadastro de sócio.`, 'dependentes');
    await ctx.audit('members.dependent_promoted', input.memberId, { category: cat!.id });
    return { ok: true };
  },
});

export const dependentOps = [promoteDependent];
