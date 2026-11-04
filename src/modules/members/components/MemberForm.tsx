/**
 * Formulário de cadastro em blocos (proposta online e cadastro pela secretaria).
 * Menor de 18 anos exige responsável legal com consentimento (LGPD art. 14).
 * Consentimentos separados: cadastro obrigatório; imagem, comunicação e marketing opcionais.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ageOn, localDateKey } from '../../../shared/dates.ts';
import { formatCPF, validateCPF } from '../../../shared/cpf.ts';
import { formatBRL } from '../../../shared/money.ts';
import type { CustomFieldDef, MemberCategory } from '../../../shared/types.ts';
import { Button, Card, Field, Input, Notice, Select } from '../../../ui/index.tsx';

export interface MemberFormValue {
  fullName: string;
  cpf: string;
  birthDate: string;
  email: string;
  phone: string;
  socials: { instagram: string; facebook: string };
  address: { street: string; number: string; district: string; city: string; state: string; zip: string };
  guardian: { name: string; email: string; phone: string; cpf: string; consent: boolean };
  categoryId: string;
  custom: Record<string, string>;
  consents: { cadastro: boolean; imagem: boolean; comunicacao: boolean; marketing: boolean };
}

export function emptyMemberForm(categoryId = ''): MemberFormValue {
  return {
    fullName: '',
    cpf: '',
    birthDate: '',
    email: '',
    phone: '',
    socials: { instagram: '', facebook: '' },
    address: { street: '', number: '', district: '', city: '', state: '', zip: '' },
    guardian: { name: '', email: '', phone: '', cpf: '', consent: false },
    categoryId,
    custom: {},
    consents: { cadastro: false, imagem: false, comunicacao: false, marketing: false },
  };
}

export function isMinor(birthDate: string, tz?: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  return ageOn(birthDate, localDateKey(new Date(), tz)) < 18;
}

/** Monta o payload de members.apply / members.create (sem campos vazios) */
export function toPayload(v: MemberFormValue, tz?: string) {
  const addr = Object.fromEntries(Object.entries(v.address).filter(([, x]) => x.trim()).map(([k, x]) => [k, k === 'state' ? x.trim().toUpperCase().slice(0, 2) : x.trim()]));
  const minor = isMinor(v.birthDate, tz);
  const custom = Object.fromEntries(Object.entries(v.custom).filter(([, x]) => x.trim()));
  return {
    data: {
      fullName: v.fullName.trim(),
      ...(v.cpf.trim() ? { cpf: v.cpf.trim() } : {}),
      ...(v.birthDate ? { birthDate: v.birthDate } : {}),
      ...(v.email.trim() ? { email: v.email.trim() } : {}),
      ...(v.socials?.instagram.trim() || v.socials?.facebook.trim() ? { socials: { ...(v.socials.instagram.trim() ? { instagram: v.socials.instagram.trim() } : {}), ...(v.socials.facebook.trim() ? { facebook: v.socials.facebook.trim() } : {}) } } : {}),
      ...(v.phone.trim() ? { phone: v.phone.trim() } : {}),
      ...(Object.keys(addr).length ? { address: addr } : {}),
      ...(minor
        ? {
            guardian: {
              name: v.guardian.name.trim(),
              ...(v.guardian.email.trim() ? { email: v.guardian.email.trim() } : {}),
              ...(v.guardian.phone.trim() ? { phone: v.guardian.phone.trim() } : {}),
              ...(v.guardian.cpf.trim() ? { cpf: v.guardian.cpf.trim() } : {}),
              consent: true as const,
            },
          }
        : {}),
      categoryId: v.categoryId,
      ...(Object.keys(custom).length ? { custom } : {}),
    },
    consents: { cadastro: true as const, imagem: v.consents.imagem, comunicacao: v.consents.comunicacao, marketing: v.consents.marketing },
  };
}

export function validateMemberForm(v: MemberFormValue, fields: CustomFieldDef[], opts: { requireConsent: boolean; tz?: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (v.fullName.trim().split(/\s+/).length < 2) e.fullName = 'Informe o nome completo.';
  if (v.cpf.trim() && !validateCPF(v.cpf)) e.cpf = 'CPF inválido.';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'E-mail inválido.';
  if (!v.categoryId) e.categoryId = 'Escolha a categoria.';
  if (v.birthDate && v.birthDate > localDateKey(new Date(), opts.tz)) e.birthDate = 'Data no futuro.';
  if (isMinor(v.birthDate, opts.tz)) {
    if (v.guardian.name.trim().length < 3) e.guardianName = 'Informe o responsável legal.';
    if (!v.guardian.consent) e.guardianConsent = 'O responsável precisa consentir.';
    if (v.guardian.cpf.trim() && !validateCPF(v.guardian.cpf)) e.guardianCpf = 'CPF do responsável inválido.';
  }
  for (const f of fields) if (f.required && !v.custom[f.id]?.trim()) e[`custom_${f.id}`] = 'Campo obrigatório.';
  if (opts.requireConsent && !v.consents.cadastro) e.cadastro = 'É preciso aceitar os termos para enviar o cadastro.';
  return e;
}

function Block({ n, title, children, hint }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-brand text-on-brand text-xs flex items-center justify-center" aria-hidden>
            {n}
          </span>
          {title}
        </h2>
        {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

interface Props {
  value: MemberFormValue;
  onChange: (v: MemberFormValue) => void;
  categories: MemberCategory[];
  customFields: CustomFieldDef[];
  errors: Record<string, string>;
  tz?: string;
  tenantName: string;
  /** Proposta do próprio titular: mostra termos e consentimentos para aceitar */
  selfService: boolean;
  emailLocked?: boolean;
  memberLabel: string;
}

export function MemberForm({ value: v, onChange, categories, customFields, errors, tz, tenantName, selfService, emailLocked, memberLabel }: Props) {
  const set = (patch: Partial<MemberFormValue>) => onChange({ ...v, ...patch });
  // Uma categoria só: ela é escolhida sozinha e o bloco nem aparece
  const only = categories.length === 1 ? categories[0].id : '';
  useEffect(() => {
    if (only && v.categoryId !== only) onChange({ ...v, categoryId: only });
  }, [only, v, onChange]);
  const minor = useMemo(() => isMinor(v.birthDate, tz), [v.birthDate, tz]);
  const [showAddress, setShowAddress] = useState(Object.values(v.address).some(Boolean));
  let n = 0;
  return (
    <div className="space-y-4">
      <Block n={++n} title="Dados pessoais">
        <Field label="Nome completo" required error={errors.fullName}>
          {id => <Input id={id} autoComplete="name" value={v.fullName} maxLength={150} onChange={e => set({ fullName: e.target.value })} />}
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="CPF" hint="Guardado com criptografia. Nunca aparece na carteirinha." error={errors.cpf}>
            {id => <Input id={id} inputMode="numeric" value={v.cpf} maxLength={14} onChange={e => set({ cpf: formatCPF(e.target.value) })} placeholder="000.000.000-00" />}
          </Field>
          <Field label="Data de nascimento" error={errors.birthDate}>
            {id => <Input id={id} type="date" value={v.birthDate} onChange={e => set({ birthDate: e.target.value })} />}
          </Field>
        </div>
      </Block>

      {minor && (
        <Block n={++n} title="Responsável legal" hint="Menores de 18 anos precisam do consentimento de um responsável legal (LGPD, art. 14).">
          <Field label="Nome do responsável" required error={errors.guardianName}>
            {id => <Input id={id} value={v.guardian.name} maxLength={120} onChange={e => set({ guardian: { ...v.guardian, name: e.target.value } })} />}
          </Field>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="E-mail do responsável">
              {id => <Input id={id} type="email" value={v.guardian.email} maxLength={120} onChange={e => set({ guardian: { ...v.guardian, email: e.target.value } })} />}
            </Field>
            <Field label="Telefone do responsável">
              {id => <Input id={id} type="tel" value={v.guardian.phone} maxLength={30} onChange={e => set({ guardian: { ...v.guardian, phone: e.target.value } })} />}
            </Field>
            <Field label="CPF do responsável" error={errors.guardianCpf}>
              {id => <Input id={id} inputMode="numeric" value={v.guardian.cpf} maxLength={14} onChange={e => set({ guardian: { ...v.guardian, cpf: formatCPF(e.target.value) } })} />}
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={v.guardian.consent} onChange={e => set({ guardian: { ...v.guardian, consent: e.target.checked } })} />
            <span>Sou o responsável legal e autorizo o tratamento dos dados deste menor pela {tenantName}, só para as finalidades do cadastro.</span>
          </label>
          {errors.guardianConsent && <p className="text-[11px] text-bad">{errors.guardianConsent}</p>}
        </Block>
      )}

      <Block n={++n} title="Contato">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="E-mail" error={errors.email} hint={emailLocked ? 'O e-mail da sua conta.' : undefined}>
            {id => <Input id={id} type="email" autoComplete="email" value={v.email} disabled={emailLocked} maxLength={120} onChange={e => set({ email: e.target.value })} />}
          </Field>
          <Field label="Telefone ou WhatsApp">
            {id => <Input id={id} type="tel" autoComplete="tel" value={v.phone} maxLength={30} onChange={e => set({ phone: e.target.value })} placeholder="(47) 90000-0000" />}
          </Field>
          <Field label="Instagram (opcional)">
            {id => <Input id={id} value={v.socials?.instagram || ''} maxLength={120} onChange={e => set({ socials: { ...(v.socials || { instagram: '', facebook: '' }), instagram: e.target.value } })} placeholder="@seuperfil" />}
          </Field>
          <Field label="Facebook (opcional)">
            {id => <Input id={id} value={v.socials?.facebook || ''} maxLength={200} onChange={e => set({ socials: { ...(v.socials || { instagram: '', facebook: '' }), facebook: e.target.value } })} placeholder="Nome ou endereço do perfil" />}
          </Field>
        </div>
        {!showAddress ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddress(true)}>
            Informar endereço (opcional)
          </Button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div className="col-span-2 sm:col-span-4">
              <Field label="Rua">{id => <Input id={id} autoComplete="address-line1" value={v.address.street} maxLength={120} onChange={e => set({ address: { ...v.address, street: e.target.value } })} />}</Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Número">{id => <Input id={id} value={v.address.number} maxLength={20} onChange={e => set({ address: { ...v.address, number: e.target.value } })} />}</Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Bairro">{id => <Input id={id} value={v.address.district} maxLength={80} onChange={e => set({ address: { ...v.address, district: e.target.value } })} />}</Field>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <Field label="Cidade">{id => <Input id={id} autoComplete="address-level2" value={v.address.city} maxLength={80} onChange={e => set({ address: { ...v.address, city: e.target.value } })} />}</Field>
            </div>
            <div>
              <Field label="UF">{id => <Input id={id} value={v.address.state} maxLength={2} onChange={e => set({ address: { ...v.address, state: e.target.value.toUpperCase() } })} />}</Field>
            </div>
            <div>
              <Field label="CEP">{id => <Input id={id} inputMode="numeric" autoComplete="postal-code" value={v.address.zip} maxLength={10} onChange={e => set({ address: { ...v.address, zip: e.target.value } })} />}</Field>
            </div>
          </div>
        )}
      </Block>

      {categories.length > 1 && <Block n={++n} title="Categoria">
        <Field label={`Categoria de ${memberLabel.toLowerCase()}`} required error={errors.categoryId}>
          {id => (
            <Select id={id} value={v.categoryId} onChange={e => set({ categoryId: e.target.value })}>
              <option value="">Escolha...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.period === 'isento' || !c.feeCents ? ' (isento)' : ` (${formatBRL(c.feeCents)} ${c.period})`}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Block>}

      {customFields.length > 0 && (
        <Block n={++n} title="Outras informações">
          {customFields.map(f => (
            <Field key={f.id} label={f.label} required={f.required} error={errors[`custom_${f.id}`]}>
              {id => (
                <div className="space-y-1">
                  {f.sensitive && (
                    <p className="text-[11px] text-warn flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" aria-hidden /> Dado sensível. Preencha só se quiser; a informação tem acesso restrito.
                    </p>
                  )}
                  {f.type === 'opcao' ? (
                    <Select id={id} value={v.custom[f.id] || ''} onChange={e => set({ custom: { ...v.custom, [f.id]: e.target.value } })}>
                      <option value="">Escolha...</option>
                      {(f.options || []).map(o => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={id}
                      type={f.type === 'numero' ? 'number' : f.type === 'data' ? 'date' : 'text'}
                      value={v.custom[f.id] || ''}
                      maxLength={300}
                      onChange={e => set({ custom: { ...v.custom, [f.id]: e.target.value } })}
                    />
                  )}
                </div>
              )}
            </Field>
          ))}
        </Block>
      )}

      <Block n={++n} title={selfService ? 'Termos e consentimentos' : 'Consentimentos informados pela pessoa'}>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={v.consents.cadastro} onChange={e => set({ consents: { ...v.consents, cadastro: e.target.checked } })} />
          <span>
            <strong>Obrigatório.</strong> {selfService ? 'Li e aceito' : 'A pessoa leu e aceitou'} os termos de associação e a política de privacidade da {tenantName}. Os dados são usados para o cadastro, a carteirinha e as obrigações da associação.
          </span>
        </label>
        {errors.cadastro && <p className="text-[11px] text-bad">{errors.cadastro}</p>}
        <p className="text-xs text-muted pt-1">Opcionais, você pode mudar depois no seu perfil:</p>
        {(
          [
            ['imagem', 'Uso de imagem em fotos e vídeos de eventos da sociedade.'],
            ['comunicacao', 'Receber avisos e comunicados por e-mail.'],
            ['marketing', 'Receber ofertas de parceiros e patrocinadores.'],
          ] as const
        ).map(([k, text]) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={v.consents[k]} onChange={e => set({ consents: { ...v.consents, [k]: e.target.checked } })} />
            <span>{text}</span>
          </label>
        ))}
        {minor && <Notice>Para menores, os consentimentos acima valem com a autorização do responsável legal.</Notice>}
      </Block>
    </div>
  );
}
