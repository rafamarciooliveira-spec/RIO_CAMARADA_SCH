/** Abas de regras: categorias e regras, campos personalizados, módulos, modelos de e-mail e LGPD. */
import { useState } from 'react';
import { AlertTriangle, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { MODULES, type ModuleId } from '../../../shared/modules.ts';
import { EMAIL_TEMPLATES } from '../../../shared/templates.ts';
import type { CustomFieldDef, MemberCategory, TenantSettings } from '../../../shared/types.ts';
import { Badge, Button, Card, Field, Input, MoneyInput, Notice, Select, Textarea, Toggle, useConfirm } from '../../../ui/index.tsx';
import { SaveBar, slugId } from './common.tsx';
import { suggestedCompetitionKinds, suggestedModalities } from '../../../shared/societyTypes.ts';
import { dependentRules, type DependentRules } from '../../../shared/dependents.ts';
import { PAGES } from '../../registry.tsx';

function useSettingsSave() {
  const t = useTenant();
  const { run, busy } = useOp();
  const save = (settings: Partial<TenantSettings>, success = 'Configurações salvas.') => run('tenant.updateSettings', { tenantId: t.tenantId, settings }, { success });
  return { save, busy };
}

const PERIODS: MemberCategory['period'][] = ['mensal', 'trimestral', 'semestral', 'anual', 'isento'];

export function RulesTab({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const s = t.settings!;
  const { save, busy } = useSettingsSave();
  const confirm = useConfirm();
  const [cats, setCats] = useState<MemberCategory[]>(s.categories.map(c => ({ ...c })));
  const [r, setR] = useState({
    membershipPrefix: s.membershipPrefix,
    validityMonths: s.validityMonths,
    approvalRequired: s.approvalRequired,
    gracePeriodDays: s.gracePeriodDays,
    suspendAfterDays: s.suspendAfterDays,
    showPhotoOnValidation: s.showPhotoOnValidation,
    cardRequiresPhoto: s.cardRequiresPhoto !== false,
    cardDownloadValidity: s.cardDownloadValidity || '24h',
    showMembershipNumber: s.showMembershipNumber === true,
  });
  const [dirty, setDirty] = useState(false);
  const setCat = (i: number, p: Partial<MemberCategory>) => (setCats(c => c.map((x, j) => (j === i ? { ...x, ...p } : x))), setDirty(true));
  const setRule = (p: Partial<typeof r>) => (setR(x => ({ ...x, ...p })), setDirty(true));
  const add = () => (setCats(c => [...c, { id: '', name: '', feeCents: 0, period: 'mensal', allowsDependents: false }]), setDirty(true));
  const remove = async (i: number) => {
    if (!(await confirm({ title: 'Remover categoria', text: `Quem já está em "${cats[i].name}" continua com ela até ser trocado. Novas propostas não poderão escolher esta categoria.`, confirmLabel: 'Remover', danger: true }))) return;
    setCats(c => c.filter((_, j) => j !== i));
    setDirty(true);
  };
  const submit = async () => {
    const used = new Set<string>();
    const categories = cats
      .filter(c => c.name.trim().length >= 2)
      .map(c => {
        let id = c.id || slugId(c.name);
        while (used.has(id)) id = `${id}_2`;
        used.add(id);
        return { ...c, id, name: c.name.trim(), feeCents: c.period === 'isento' ? 0 : c.feeCents };
      });
    const ok = await save({ categories, ...r, validityMonths: Number(r.validityMonths), gracePeriodDays: Number(r.gracePeriodDays), suspendAfterDays: Number(r.suspendAfterDays) });
    if (ok) setDirty(false);
  };
  return (
    <fieldset disabled={readOnly} className="space-y-5 min-w-0">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Categorias de {t.labels.member.toLowerCase()}</h3>
          <Button type="button" size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={add}>
            Categoria
          </Button>
        </div>
        {cats.map((c, i) => (
          <Card key={i} className="grid sm:grid-cols-[1fr_140px_150px_auto_auto] gap-2 items-end p-3!">
            <Field label="Nome">{id => <Input id={id} value={c.name} maxLength={60} onChange={e => setCat(i, { name: e.target.value })} />}</Field>
            <Field label={t.labels.fee}>{id => <MoneyInput id={id} value={c.feeCents} disabled={c.period === 'isento'} onChange={v => setCat(i, { feeCents: v })} />}</Field>
            <Field label="Período">
              {id => (
                <Select id={id} value={c.period} onChange={e => setCat(i, { period: e.target.value as MemberCategory['period'] })}>
                  {PERIODS.map(p => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="pb-2">
              <Toggle checked={c.allowsDependents} onChange={v => setCat(i, { allowsDependents: v })} label="Dependentes" />
            </div>
            <Button type="button" size="sm" variant="ghost" aria-label={`Remover ${c.name || 'categoria'}`} icon={<Trash2 className="w-4 h-4" />} onClick={() => remove(i)} />
          </Card>
        ))}
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Regras</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Prefixo da matrícula" hint="Exemplo: SC- gera SC-0001">
            {id => <Input id={id} value={r.membershipPrefix} maxLength={10} onChange={e => setRule({ membershipPrefix: e.target.value })} />}
          </Field>
          <Field label="Validade da carteirinha (meses)">{id => <Input id={id} type="number" min={1} max={120} value={r.validityMonths} onChange={e => setRule({ validityMonths: Number(e.target.value) })} />}</Field>
          <Field label="Carência até ficar em atraso (dias)">{id => <Input id={id} type="number" min={0} max={120} value={r.gracePeriodDays} onChange={e => setRule({ gracePeriodDays: Number(e.target.value) })} />}</Field>
          <Field label="Suspender após (dias em atraso)">{id => <Input id={id} type="number" min={1} max={365} value={r.suspendAfterDays} onChange={e => setRule({ suspendAfterDays: Number(e.target.value) })} />}</Field>
        </div>
        <Toggle checked={r.approvalRequired} onChange={v => setRule({ approvalRequired: v })} label="Propostas online precisam de aprovação" />
        <Toggle checked={r.cardRequiresPhoto} onChange={v => setRule({ cardRequiresPhoto: v })} label="Foto obrigatória para liberar a carteirinha" />
        <Field label="Carteirinha baixada ou impressa vale" hint="Na tela do portal o QR se renova sozinho; isto vale para o arquivo salvo ou o papel. Nunca passa da validade do cadastro, e a suspensão derruba o QR na hora.">
          {id => (
            <Select id={id} className="sm:max-w-md" value={r.cardDownloadValidity} onChange={e => setRule({ cardDownloadValidity: e.target.value as '24h' | 'mes' | 'ano' })}>
              <option value="24h">Por 24 horas (mais seguro)</option>
              <option value="mes">Até o fim do mês em que foi baixada</option>
              <option value="ano">Até o fim do ano em que foi baixada</option>
            </Select>
          )}
        </Field>
        <Toggle checked={r.showMembershipNumber} onChange={v => setRule({ showMembershipNumber: v })} label="Mostrar o número do sócio na carteirinha e no portal" />
        <p className="text-[11px] text-muted">Desligado, o número continua existindo para a secretaria, mas não aparece para os sócios.</p>
        <Toggle checked={r.showPhotoOnValidation} onChange={v => setRule({ showPhotoOnValidation: v })} label="Mostrar a foto na validação do QR" />
        <p className="text-[11px] text-muted">A foto aparece só para quem lê o QR, por um link que expira em 2 minutos.</p>
      </div>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={submit} disabled={r.suspendAfterDays <= r.gracePeriodDays} />}
      {r.suspendAfterDays <= r.gracePeriodDays && <Notice tone="warn">A suspensão precisa vir depois da carência.</Notice>}
      <DependentRulesBlock readOnly={readOnly} />
    </fieldset>
  );
}

/** Dependente na mensalidade: modo, valor, idade grátis, idade limite e teto da família */
function DependentRulesBlock({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { save, busy } = useSettingsSave();
  const [r, setR] = useState<DependentRules>(() => dependentRules(t.settings));
  const [dirty, setDirty] = useState(false);
  const set = (p: Partial<DependentRules>) => (setR(x => ({ ...x, ...p })), setDirty(true));
  const num = (v: string) => Math.max(0, Math.min(99, Number(v.replace(/\D/g, '')) || 0));
  return (
    <div className="space-y-3 pt-4 border-t border-line">
      <div>
        <h3 className="font-semibold text-sm">Dependentes na mensalidade</h3>
        <p className="text-sm text-muted">O dependente nunca recebe cobrança separada: o valor entra na mensalidade do titular, discriminado no recibo.</p>
      </div>
      <Field label="Como o dependente paga">
        {id => (
          <Select id={id} value={r.mode} onChange={e => set({ mode: e.target.value as DependentRules['mode'] })}>
            <option value="gratis">Não paga (incluído na mensalidade do titular)</option>
            <option value="valor_fixo">Valor fixo por dependente, somado à mensalidade do titular</option>
            <option value="categoria">Pelo valor da categoria do dependente, somado à mensalidade do titular</option>
          </Select>
        )}
      </Field>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {r.mode === 'valor_fixo' && <Field label="Valor por dependente">{id => <MoneyInput id={id} value={r.feeCents} onChange={c => set({ feeCents: c })} />}</Field>}
        {r.mode !== 'gratis' && (
          <Field label="Não paga até (anos)" hint="0 = paga em qualquer idade">
            {id => <Input id={id} inputMode="numeric" value={String(r.freeUntilAge)} onChange={e => set({ freeUntilAge: num(e.target.value) })} />}
          </Field>
        )}
        {r.mode !== 'gratis' && <Field label="Teto da família para dependentes" hint="0 = sem teto">{id => <MoneyInput id={id} value={r.familyCapCents} onChange={c => set({ familyCapCents: c })} />}</Field>}
        <Field label="Pode ser dependente até (anos)" hint="0 = sem limite. Ao completar, precisa virar sócio titular">
          {id => <Input id={id} inputMode="numeric" value={String(r.maxAge)} onChange={e => set({ maxAge: num(e.target.value) })} />}
        </Field>
      </div>
      <p className="text-[11px] text-muted">O titular e a diretoria são avisados 30 dias antes de o dependente passar a pagar e 60 dias antes do limite de idade.</p>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={async () => (await save({ dependentRules: r }, 'Regras dos dependentes salvas.')) && setDirty(false)} />}
    </div>
  );
}

const SENSITIVE_WORDS = ['saude', 'doenca', 'deficien', 'religi', 'igreja', 'crenca', 'politic', 'partido', 'sindica', 'raca', 'cor da pele', 'etnia', 'sexual', 'genero', 'biometr', 'genetic', 'medicament', 'alergia', 'sangue', 'filosof'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const looksSensitive = (label: string) => SENSITIVE_WORDS.some(w => norm(label).includes(w));

export function CustomFieldsTab({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { save, busy } = useSettingsSave();
  const confirm = useConfirm();
  const [fields, setFields] = useState<CustomFieldDef[]>((t.settings!.customFields || []).map(f => ({ ...f })));
  const [dirty, setDirty] = useState(false);
  const set = (i: number, p: Partial<CustomFieldDef>) => (setFields(f => f.map((x, j) => (j === i ? { ...x, ...p } : x))), setDirty(true));
  const markSensitive = async (i: number, v: boolean) => {
    if (v) {
      const ok = await confirm({
        title: 'Dado pessoal sensível',
        text: 'Saúde, religião, opinião política, filiação sindical, origem racial, vida sexual, dados genéticos e biométricos são dados sensíveis (LGPD, art. 11). Só colete se for indispensável, com finalidade clara e consentimento específico. O campo fica opcional para o sócio responder.',
        confirmLabel: 'Entendi, marcar como sensível',
        danger: true,
      });
      if (!ok) return;
      set(i, { sensitive: true, required: false });
    } else set(i, { sensitive: false });
  };
  const submit = async () => {
    const used = new Set<string>();
    const customFields = fields
      .filter(f => f.label.trim())
      .map(f => {
        let id = f.id || slugId(f.label);
        while (used.has(id)) id = `${id}_2`;
        used.add(id);
        return { ...f, id, label: f.label.trim(), options: f.type === 'opcao' ? (f.options || []).map(o => o.trim()).filter(Boolean) : undefined, required: f.sensitive ? false : f.required };
      })
      .map(f => (f.options === undefined ? (({ options: _o, ...rest }) => rest)(f) : f));
    const ok = await save({ customFields: customFields as CustomFieldDef[] });
    if (ok) setDirty(false);
  };
  return (
    <fieldset disabled={readOnly} className="space-y-3 min-w-0">
      <Notice tone="warn">
        Peça só o necessário. Não crie campos de saúde, religião ou política sem uma razão forte: são dados sensíveis pela LGPD.
      </Notice>
      {fields.map((f, i) => (
        <Card key={i} className="space-y-2 p-3!">
          <div className="grid sm:grid-cols-[1fr_160px_auto] gap-2 items-end">
            <Field label="Pergunta">{id => <Input id={id} value={f.label} maxLength={60} onChange={e => set(i, { label: e.target.value })} />}</Field>
            <Field label="Tipo">
              {id => (
                <Select id={id} value={f.type} onChange={e => set(i, { type: e.target.value as CustomFieldDef['type'] })}>
                  <option value="texto">Texto</option>
                  <option value="numero">Número</option>
                  <option value="data">Data</option>
                  <option value="opcao">Lista de opções</option>
                </Select>
              )}
            </Field>
            <Button type="button" size="sm" variant="ghost" aria-label="Remover campo" icon={<Trash2 className="w-4 h-4" />} onClick={() => (setFields(x => x.filter((_, j) => j !== i)), setDirty(true))} />
          </div>
          {f.type === 'opcao' && (
            <Field label="Opções (separadas por vírgula)">
              {id => <Input id={id} value={(f.options || []).join(', ')} onChange={e => set(i, { options: e.target.value.split(',').map(o => o.trimStart()) })} />}
            </Field>
          )}
          <div className="flex flex-wrap gap-4">
            <Toggle checked={f.required} disabled={f.sensitive} onChange={v => set(i, { required: v })} label="Obrigatório" />
            <Toggle checked={f.sensitive} onChange={v => markSensitive(i, v)} label="Dado sensível" />
          </div>
          {!f.sensitive && looksSensitive(f.label) && (
            <p className="text-xs text-bad flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" aria-hidden /> Esta pergunta parece pedir dado sensível. Marque como sensível ou reformule.
            </p>
          )}
        </Card>
      ))}
      <Button type="button" size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => (setFields(f => [...f, { id: '', label: '', type: 'texto', required: false, sensitive: false }]), setDirty(true))}>
        Novo campo
      </Button>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={submit} />}
    </fieldset>
  );
}

export function ModulesTab({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [mods, setMods] = useState<Partial<Record<ModuleId, boolean>>>({ ...t.tenant.modules });
  const [dirty, setDirty] = useState(false);
  const save = async () => {
    const changes = Object.fromEntries(MODULES.filter(m => !m.core).map(m => [m.id, mods[m.id] !== false]));
    const r = await run('tenant.update', { tenantId: t.tenantId, modules: changes }, { success: 'Módulos atualizados.' });
    if (r) setDirty(false);
  };
  return (
    <fieldset disabled={readOnly} className="space-y-3 min-w-0">
      <p className="text-sm text-muted">Desligar um módulo esconde as telas dele. Os dados ficam guardados e voltam ao religar.</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {MODULES.map(m => (
          <div key={m.id} className="flex items-center justify-between gap-2 p-3 rounded-xl border border-line">
            <Toggle checked={m.core || mods[m.id] !== false} disabled={m.core} onChange={v => (setMods(x => ({ ...x, [m.id]: v })), setDirty(true))} label={m.label} />
            {m.core && <Badge>Essencial</Badge>}
          </div>
        ))}
      </div>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={save} />}
      <MemberMenu readOnly={readOnly} />
      <CompetitionLists readOnly={readOnly} />
    </fieldset>
  );
}

/** Modalidades e tipos de competição da sociedade (uma por linha) */
function CompetitionLists({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { save, busy } = useSettingsSave();
  const s = t.settings;
  const [mods, setMods] = useState((s?.modalities?.length ? s.modalities : suggestedModalities(t.tenant.societyType)).join('\n'));
  const [kinds, setKinds] = useState((s?.competitionKinds?.length ? s.competitionKinds : suggestedCompetitionKinds(t.tenant.societyType)).join('\n'));
  const [dirty, setDirty] = useState(false);
  const lines = (x: string) => [...new Set(x.split('\n').map(l => l.trim()).filter(Boolean))].slice(0, 40);
  if (!t.moduleOn('competicoes')) return null;
  return (
    <div className="space-y-3 pt-4 border-t border-line">
      <div>
        <h3 className="font-semibold text-sm">Modalidades e tipos de competição</h3>
        <p className="text-sm text-muted">Aparecem como sugestão ao criar uma competição e viram filtro no ranking. Uma por linha; dá para escrever outra na hora.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Modalidades" hint="Ex.: Tiro, Dado, Pássaro, Juvenil ou Futebol society, Futsal">
          {id => <Textarea id={id} rows={7} value={mods} onChange={e => (setMods(e.target.value), setDirty(true))} />}
        </Field>
        <Field label="Tipos de competição" hint="Ex.: Torneio, Campeonato, Copa, Festa do Rei">
          {id => <Textarea id={id} rows={7} value={kinds} onChange={e => (setKinds(e.target.value), setDirty(true))} />}
        </Field>
      </div>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={async () => (await save({ modalities: lines(mods), competitionKinds: lines(kinds) }, 'Listas salvas.')) && setDirty(false)} />}
    </div>
  );
}

// Início e Meu perfil ficam sempre: é por eles que o sócio se orienta e cuida dos próprios dados
const FIXED_MEMBER_PAGES = ['inicio', 'perfil'];

/** Quais botões o sócio vê no menu (sem desligar o módulo para a diretoria) */
function MemberMenu({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { save, busy } = useSettingsSave();
  const [hidden, setHidden] = useState<string[]>(t.settings?.memberMenuHidden || []);
  const [dirty, setDirty] = useState(false);
  const pages = PAGES.filter(p => p.area === 'socio' && !FIXED_MEMBER_PAGES.includes(p.path) && (!p.module || t.moduleOn(p.module)));
  return (
    <div className="space-y-3 pt-4 border-t border-line">
      <div>
        <h3 className="font-semibold text-sm">Menu do {t.labels.member.toLowerCase()}</h3>
        <p className="text-sm text-muted">Escolha os botões que aparecem para os sócios. Início e Meu perfil ficam sempre.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {pages.map(p => (
          <div key={p.path} className="p-3 rounded-xl border border-line">
            <Toggle
              checked={!hidden.includes(p.path)}
              onChange={v => (setHidden(h => (v ? h.filter(x => x !== p.path) : [...h, p.path])), setDirty(true))}
              label={p.label}
            />
          </div>
        ))}
      </div>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={async () => (await save({ memberMenuHidden: hidden }, 'Menu do sócio salvo.')) && setDirty(false)} />}
    </div>
  );
}

export function EmailTemplatesTab({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { save, busy } = useSettingsSave();
  const [tpl, setTpl] = useState<Record<string, { subject: string; body: string }>>(() => {
    const cur = t.settings!.emailTemplates || {};
    return Object.fromEntries(Object.entries(EMAIL_TEMPLATES).map(([k, v]) => [k, cur[k] || { subject: v.subject, body: v.body }]));
  });
  const [key, setKey] = useState(Object.keys(EMAIL_TEMPLATES)[0]);
  const [dirty, setDirty] = useState(false);
  const def = EMAIL_TEMPLATES[key];
  const set = (p: Partial<{ subject: string; body: string }>) => (setTpl(x => ({ ...x, [key]: { ...x[key], ...p } })), setDirty(true));
  const submit = async () => {
    const ok = await save({ emailTemplates: tpl }, 'Modelos de e-mail salvos.');
    if (ok) setDirty(false);
  };
  return (
    <fieldset disabled={readOnly} className="space-y-3 min-w-0">
      <Field label="Modelo">
        {id => (
          <Select id={id} value={key} onChange={e => setKey(e.target.value)}>
            {Object.entries(EMAIL_TEMPLATES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="text-muted">Variáveis:</span>
        {def.vars.map(v => (
          <code key={v} className="px-1.5 py-0.5 rounded bg-surface-2">{`{${v}}`}</code>
        ))}
      </div>
      <Field label="Assunto">{id => <Input id={id} value={tpl[key].subject} maxLength={200} onChange={e => set({ subject: e.target.value })} />}</Field>
      <Field label="Texto">{id => <Textarea id={id} rows={8} value={tpl[key].body} maxLength={4000} onChange={e => set({ body: e.target.value })} />}</Field>
      <Button type="button" size="sm" variant="ghost" icon={<RotateCcw className="w-4 h-4" />} onClick={() => set({ subject: def.subject, body: def.body })}>
        Voltar ao texto padrão
      </Button>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={submit} />}
    </fieldset>
  );
}

export function LgpdTab({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { save, busy } = useSettingsSave();
  const [r, setR] = useState({ ...t.settings!.retentionYears });
  const [dirty, setDirty] = useState(false);
  const set = (p: Partial<typeof r>) => (setR(x => ({ ...x, ...p })), setDirty(true));
  const submit = async () => {
    const ok = await save({ retentionYears: { financeiro: Number(r.financeiro), atas: Number(r.atas), inativos: Number(r.inativos) } });
    if (ok) setDirty(false);
  };
  return (
    <fieldset disabled={readOnly} className="space-y-3 min-w-0">
      <p className="text-sm text-muted">A sociedade é a controladora dos dados e a plataforma é a operadora. Defina por quanto tempo os dados ficam guardados.</p>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Registros financeiros (anos)" hint="Mínimo de 5 anos (prazo fiscal).">
          {id => <Input id={id} type="number" min={5} max={99} value={r.financeiro} onChange={e => set({ financeiro: Number(e.target.value) })} />}
        </Field>
        <Field label="Atas (anos)" hint="Atas costumam ser guardadas para sempre.">
          {id => <Input id={id} type="number" min={5} max={99} value={r.atas} onChange={e => set({ atas: Number(e.target.value) })} />}
        </Field>
        <Field label={`${t.labels.members} desligados (anos)`} hint="Depois disso, os dados pessoais são anonimizados por uma rotina diária.">
          {id => <Input id={id} type="number" min={1} max={99} value={r.inativos} onChange={e => set({ inativos: Number(e.target.value) })} />}
        </Field>
      </div>
      <Notice>Na anonimização, CPF, contato, endereço e foto são apagados. Ficam só identificadores nos registros financeiros e atas, que têm guarda legal própria.</Notice>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={submit} disabled={r.financeiro < 5 || r.atas < 5 || r.inativos < 1} />}
    </fieldset>
  );
}
