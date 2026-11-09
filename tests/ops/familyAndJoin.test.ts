/** Filho incluído pelo pai e pela mãe (repetido reconhecido, juntado, aniversário uma vez só) e adesão com Pix. */
import { describe, expect, it } from 'vitest';
import { actor, makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import type { MemberDoc } from '../../src/shared/types.ts';
import { joinAmountCents } from '../../src/shared/joinPayment.ts';
import { caresFor } from '../../src/shared/dependents.ts';

type H = Awaited<ReturnType<typeof makeTestTenant>>;
const consents = { cadastro: true, imagem: false, comunicacao: false, marketing: false };
const denied = (p: Promise<unknown>, code?: string) => expect(p).rejects.toMatchObject(code ? { code } : { name: 'OpError' });

async function couple() {
  const h = await makeTestTenant();
  const dad = await makeMember(h, 'pai', 'Rafael Oliveira');
  const mom = actor('mae');
  const { memberId: momId } = await h.call<{ memberId: string }>(
    'members.apply',
    { tenantId: h.tenantId, data: { fullName: 'Maria Oliveira', cpf: '111.444.777-35', birthDate: '1991-02-03', categoryId: 'efetivo' }, consents },
    mom
  );
  await h.call('members.approve', { tenantId: h.tenantId, memberId: momId }, h.actors.presidente);
  const child = { fullName: 'Geancarlo Oliveira', birthDate: '2015-11-22', categoryId: 'dependente', guardian: { name: 'Responsável', consent: true as const }, custom: { parentesco: 'Filho(a)' } };
  const add = (holderId: string, who: ReturnType<typeof actor>, data: Record<string, unknown> = child) =>
    h.call<{ memberId: string; duplicate?: boolean }>('members.addDependent', { tenantId: h.tenantId, holderId, data, consents }, who);
  return { h, dad, momId, mom, child, add };
}

const member = (h: H, id: string) => h.store.get<MemberDoc>(P.member(h.tenantId, id));

describe('dependente incluído pelos dois pais', () => {
  it('a segunda inclusão fica marcada como repetida, não aprova sozinha e, juntada, vira um cadastro só com os dois responsáveis', async () => {
    const { h, dad, momId, mom, add } = await couple();
    const first = await add(dad.memberId, dad.who);
    expect(first.duplicate).toBe(false);
    await h.call('members.approve', { tenantId: h.tenantId, memberId: first.memberId }, h.actors.presidente);
    await h.store.update(P.member(h.tenantId, first.memberId), { photoPath: `tenants/${h.tenantId}/members/${first.memberId}/photo/f.jpg` });
    // O mesmo responsável não inclui duas vezes
    await denied(add(dad.memberId, dad.who), 'already-exists');

    const second = await add(momId, mom);
    expect(second.duplicate).toBe(true);
    expect((await member(h, second.memberId))!.duplicateOf).toBe(first.memberId);
    await denied(h.call('members.approve', { tenantId: h.tenantId, memberId: second.memberId }, h.actors.presidente), 'failed-precondition');

    // A procura de repetidos acha o par
    const found = await h.call<{ pairs: { a: { id: string }; b: { id: string } }[] }>('members.findDuplicates', { tenantId: h.tenantId }, h.actors.presidente);
    expect(found.pairs.map(p => [p.a.id, p.b.id].sort())).toContainEqual([first.memberId, second.memberId].sort());

    // Sócio comum não junta
    await denied(h.call('members.mergeDuplicate', { tenantId: h.tenantId, aId: second.memberId, bId: first.memberId }, mom), 'permission-denied');
    const r = await h.call<{ keptId: string; removedId: string }>('members.mergeDuplicate', { tenantId: h.tenantId, aId: second.memberId, bId: first.memberId }, h.actors.presidente);
    // Fica o que tem foto e já estava aprovado
    expect(r).toEqual({ keptId: first.memberId, removedId: second.memberId });
    expect(await member(h, second.memberId)).toBeNull();
    const kept = (await member(h, first.memberId))!;
    expect(kept.dependentOf).toBe(dad.memberId);
    expect(kept.guardianIds).toEqual([momId]);
    expect(caresFor(kept, momId)).toBe(true);
    // A mãe passa a emitir a carteirinha do filho; um terceiro não
    await h.call('card.issue', { tenantId: h.tenantId, memberId: first.memberId, kind: 'rotativo' }, mom);
    // E a procura não acha mais nada
    const again = await h.call<{ pairs: unknown[] }>('members.findDuplicates', { tenantId: h.tenantId }, h.actors.presidente);
    expect(again.pairs).toEqual([]);
  });

  it('repetidos antigos (de antes da conferência) aparecem na procura; "não é a mesma pessoa" para de sugerir', async () => {
    const { h, dad, momId } = await couple();
    const base = { fullName: 'Ana Oliveira', displayName: 'Ana O.', categoryId: 'dependente', categoryName: 'Dependente', status: 'ativo', birthMonthDay: '03-15', birthYear: 2018, isMinor: true, groups: [], custom: {}, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
    await h.store.set(P.member(h.tenantId, 'antigo1'), { ...base, dependentOf: dad.memberId });
    await h.store.set(P.member(h.tenantId, 'antigo2'), { ...base, dependentOf: momId });
    const found = await h.call<{ pairs: { a: { id: string }; b: { id: string } }[] }>('members.findDuplicates', { tenantId: h.tenantId }, h.actors.presidente);
    expect(found.pairs).toHaveLength(1);
    await h.call('members.notDuplicate', { tenantId: h.tenantId, aId: 'antigo1', bId: 'antigo2' }, h.actors.presidente);
    const again = await h.call<{ pairs: unknown[] }>('members.findDuplicates', { tenantId: h.tenantId }, h.actors.presidente);
    expect(again.pairs).toEqual([]);
  });

  it('pelo CPF é certeza: "não é a mesma pessoa" é recusado', async () => {
    const { h, dad, momId, mom, child, add } = await couple();
    const withCpf = { ...child, cpf: '935.411.347-80' };
    const first = await add(dad.memberId, dad.who, withCpf);
    const second = await add(momId, mom, { ...withCpf, fullName: 'Geancarlo O. Silva' });
    expect((await member(h, second.memberId))!.duplicateBy).toBe('cpf');
    await denied(h.call('members.notDuplicate', { tenantId: h.tenantId, aId: second.memberId, bId: first.memberId }, h.actors.presidente), 'failed-precondition');
  });
});

describe('adesão com Pix', () => {
  it('valor = taxa de associação + anuidade da categoria; o comprovante fica no cadastro e avisa a diretoria', async () => {
    const h = await makeTestTenant();
    const jp = { enabled: true, feeCents: 5000, feeLabel: 'Joia', includeCategoryFee: true, requireProof: true, note: '' };
    await h.call('tenant.updateSettings', { tenantId: h.tenantId, settings: { joinPayment: jp } }, h.actors.presidente);
    const who = actor('novo');
    const opts = await h.call<{ joinPayment?: typeof jp; requirePhoto: boolean }>('members.formOptions', { tenantId: h.tenantId }, who);
    expect(opts.joinPayment).toMatchObject({ feeCents: 5000 });
    expect(opts.requirePhoto).toBe(true);
    const { memberId } = await h.call<{ memberId: string }>(
      'members.apply',
      { tenantId: h.tenantId, data: { fullName: 'Novo Sócio Teste', cpf: '111.444.777-35', birthDate: '1980-01-01', categoryId: 'efetivo' }, consents },
      who
    );
    const path = `tenants/${h.tenantId}/members/${memberId}/proof/pix.pdf`;
    await denied(h.call('members.setJoinProof', { tenantId: h.tenantId, memberId, path: `tenants/${h.tenantId}/members/outro/proof/x.pdf`, contentType: 'application/pdf' }, who), 'invalid-argument');
    await denied(h.call('members.setJoinProof', { tenantId: h.tenantId, memberId, path, contentType: 'application/pdf' }, actor('estranho')), 'permission-denied');
    await h.call('members.setJoinProof', { tenantId: h.tenantId, memberId, path, contentType: 'application/pdf' }, who);
    const m = (await member(h, memberId))!;
    const settings = { joinPayment: jp, categories: [{ id: 'efetivo', name: 'Efetivo', feeCents: 3000, period: 'mensal' as const, allowsDependents: true }] };
    expect(m.joinProof).toMatchObject({ path, amountCents: joinAmountCents(settings, 'efetivo') });
    expect(joinAmountCents(settings, 'efetivo')).toBe(8000);
    expect(joinAmountCents({ ...settings, joinPayment: { ...jp, includeCategoryFee: false } }, 'efetivo')).toBe(5000);
    expect(joinAmountCents({ ...settings, joinPayment: { ...jp, enabled: false } }, 'efetivo')).toBe(0);
  });
});

describe('filiação no verso da carteirinha', () => {
  it('o modelo guarda o texto e a logo da entidade (federação ou associação da região)', async () => {
    const { fallbackTemplate, TEMPLATE_FIELDS } = await import('../../src/modules/card/cardTemplate.ts');
    const h = await makeTestTenant();
    const tpl = { ...fallbackTemplate('Sociedade'), affiliationText: 'Afiliada à Associação dos Clubes e Sociedades de Tiro do Vale do Itapocu', affiliationLogoUrl: `tenants/${h.tenantId}/public/card-affiliation-x.png` } as Record<string, unknown>;
    const data = Object.fromEntries(TEMPLATE_FIELDS.filter(k => tpl[k] !== undefined).map(k => [k, tpl[k]]));
    const { id } = await h.call<{ id: string }>('generic.save', { tenantId: h.tenantId, collection: 'cardTemplates', data }, h.actors.presidente);
    const saved = await h.store.get<Record<string, unknown>>(P.cardTemplate(h.tenantId, id));
    expect(saved).toMatchObject({ affiliationText: tpl.affiliationText, affiliationLogoUrl: tpl.affiliationLogoUrl });
  });
});
