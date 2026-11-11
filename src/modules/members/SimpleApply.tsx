/**
 * Ficha de cadastro sem conta Google, pensada para quem tem mais idade ou pouca prática com celular:
 * uma coluna, letras e campos grandes, passos numerados, só o essencial (nome, CPF, nascimento, telefone,
 * foto e senha). A pessoa já sai com a senha criada e entra depois com CPF e senha.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useData, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { errorMessage } from '../../data/client.ts';
import { formatCPF, validateCPF, cleanCPF } from '../../shared/cpf.ts';
import { ageOn, localDateKey } from '../../shared/dates.ts';
import type { CustomFieldDef, MemberCategory } from '../../shared/types.ts';
import { Button, Card, ErrorState, Field, Input, Loading, Notice, Select } from '../../ui/index.tsx';
import { PhotoPick, sendPickedPhoto } from '../member-area/PhotoPick.tsx';

interface OpenOptions {
  enabled: boolean;
  categories: MemberCategory[];
  customFields: CustomFieldDef[];
  requirePhoto: boolean;
  approvalRequired: boolean;
}

const big = 'text-lg py-3';

function Secret({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} className={`${big} pr-12`} value={value} maxLength={64} autoComplete="new-password" onChange={e => onChange(e.target.value)} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Esconder a senha' : 'Mostrar a senha'} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted hover:text-fg cursor-pointer">
        {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );
}

export function SimpleApply({ preview = false }: { preview?: boolean }) {
  const t = useTenant();
  const { client } = useData();
  const session = useSession();
  const [opts, setOpts] = useState<OpenOptions | null>(null);
  const [loadError, setLoadError] = useState('');
  const [v, setV] = useState({ fullName: '', cpf: '', birthDate: '', phone: '', categoryId: '', password: '', again: '', accept: false, custom: {} as Record<string, string> });
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ photoFailed: boolean; approved: boolean } | null>(null);
  const set = (p: Partial<typeof v>) => setV(x => ({ ...x, ...p }));

  useEffect(() => {
    let alive = true;
    client
      .call<OpenOptions>('members.openFormOptions', { tenantId: t.tenantId })
      .then(r => {
        if (!alive) return;
        setOpts(r);
        if (r.categories.length === 1) setV(x => ({ ...x, categoryId: r.categories[0].id }));
      })
      .catch(e => alive && setLoadError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [client, t.tenantId]);

  if (loadError) return <ErrorState text={loadError} />;
  if (!opts) return <Loading label="Abrindo a ficha..." />;
  if (!opts.enabled) return <Notice>Esta sociedade faz o cadastro pela conta Google. Volte e toque em "Tenho conta Google".</Notice>;

  if (done) {
    return (
      <Card className="text-center space-y-3 py-8">
        <CheckCircle2 className="w-14 h-14 mx-auto text-ok" aria-hidden />
        <h2 className="text-xl font-bold">Cadastro enviado</h2>
        <p className="text-base text-muted max-w-md mx-auto">
          {done.approved ? 'Seu cadastro já está aprovado.' : `A ${t.labels.board.toLowerCase()} vai conferir e aprovar. Você recebe um aviso no portal.`} Para entrar depois, use o seu <strong>CPF</strong> e a <strong>senha</strong> que você criou.
        </p>
        {done.photoFailed && <Notice tone="warn">A foto não foi enviada. Entre no portal e envie a foto em Meu perfil.</Notice>}
        <Link to={t.to('inicio')}>
          <Button size="lg">Ir para o portal</Button>
        </Link>
      </Card>
    );
  }

  const today = localDateKey(new Date(), t.tenant.timezone);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (v.fullName.trim().split(/\s+/).length < 2) er.fullName = 'Escreva o nome completo (nome e sobrenome).';
    if (!validateCPF(cleanCPF(v.cpf))) er.cpf = 'Confira o CPF: os números não batem.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.birthDate) || v.birthDate > today) er.birthDate = 'Informe a data de nascimento.';
    else if (ageOn(v.birthDate, today) < 18) er.birthDate = 'Menores de 18 anos entram como dependente: o responsável faz a ficha e inclui o menor.';
    if (!v.categoryId) er.categoryId = 'Escolha a categoria.';
    for (const f of opts.customFields) if (!v.custom[f.id]?.trim()) er[`custom.${f.id}`] = 'Preencha este campo.';
    if (opts.requirePhoto && !photo) er.photo = 'A foto é obrigatória: ela vai na carteirinha.';
    if (v.password.length < 6) er.password = 'A senha precisa ter pelo menos 6 letras ou números.';
    else if (v.password !== v.again) er.again = 'As duas senhas estão diferentes.';
    if (!v.accept) er.accept = 'Marque o aceite para continuar.';
    setErrors(er);
    if (Object.keys(er).length) {
      requestAnimationFrame(() => document.querySelector('.text-bad')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    if (preview) return setErrors({ form: 'Prévia da diretoria: nada foi enviado.' });
    setBusy(true);
    try {
      const data = { fullName: v.fullName.trim(), cpf: v.cpf, birthDate: v.birthDate, categoryId: v.categoryId, ...(v.phone.trim() ? { phone: v.phone.trim() } : {}), ...(Object.keys(v.custom).length ? { custom: v.custom } : {}) };
      const r = await client.call<{ email: string; memberId: string }>('members.applyOpen', { tenantId: t.tenantId, data, consents: { cadastro: true, imagem: false, comunicacao: true, marketing: false }, password: v.password });
      await session.signInPassword(r.email, v.password);
      let photoFailed = false;
      if (photo) await sendPickedPhoto(client, (op, input) => client.call(op, input), t.tenantId, r.memberId, photo).catch(() => (photoFailed = true));
      setDone({ photoFailed, approved: !opts.approvalRequired });
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Notice>Preencha com calma. Se precisar, peça ajuda a um familiar. Ao final você cria uma senha e entra sempre com o seu CPF e essa senha.</Notice>
      <Card className="space-y-4">
        <Field label="1. Nome completo" required error={errors.fullName}>
          {id => <Input id={id} className={big} autoComplete="name" value={v.fullName} maxLength={150} onChange={e => set({ fullName: e.target.value })} />}
        </Field>
        <Field label="2. CPF" required error={errors.cpf}>
          {id => <Input id={id} className={big} inputMode="numeric" value={v.cpf} maxLength={14} placeholder="000.000.000-00" onChange={e => set({ cpf: formatCPF(e.target.value) })} />}
        </Field>
        <Field label="3. Data de nascimento" required error={errors.birthDate}>
          {id => <Input id={id} className={big} type="date" max={today} value={v.birthDate} onChange={e => set({ birthDate: e.target.value })} />}
        </Field>
        <Field label="4. Telefone ou WhatsApp (opcional)">
          {id => <Input id={id} className={big} inputMode="tel" autoComplete="tel" value={v.phone} maxLength={30} placeholder="(47) 99999-9999" onChange={e => set({ phone: e.target.value })} />}
        </Field>
        {opts.categories.length > 1 && (
          <Field label="5. Categoria" required error={errors.categoryId}>
            {id => (
              <Select id={id} className={big} value={v.categoryId} onChange={e => set({ categoryId: e.target.value })}>
                <option value="">Escolha</option>
                {opts.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
        )}
        {opts.customFields.map(f => (
          <Field key={f.id} label={f.label} required error={errors[`custom.${f.id}`]}>
            {id =>
              f.type === 'opcao' ? (
                <Select id={id} className={big} value={v.custom[f.id] || ''} onChange={e => set({ custom: { ...v.custom, [f.id]: e.target.value } })}>
                  <option value="">Escolha</option>
                  {(f.options || []).map(o => <option key={o}>{o}</option>)}
                </Select>
              ) : (
                <Input id={id} className={big} type={f.type === 'data' ? 'date' : 'text'} inputMode={f.type === 'numero' ? 'numeric' : undefined} value={v.custom[f.id] || ''} maxLength={300} onChange={e => set({ custom: { ...v.custom, [f.id]: e.target.value } })} />
              )
            }
          </Field>
        ))}
      </Card>
      <Card>
        <PhotoPick value={photo} onChange={setPhoto} error={errors.photo} label="Sua foto para a carteirinha" required={opts.requirePhoto} />
      </Card>
      <Card className="space-y-4">
        <Field label="Crie a sua senha" required error={errors.password} hint="Pelo menos 6 letras ou números, fácil de você lembrar. Não use o CPF nem 123456.">
          {id => <Secret id={id} value={v.password} onChange={x => set({ password: x })} />}
        </Field>
        <Field label="Digite a senha de novo" required error={errors.again}>{id => <Secret id={id} value={v.again} onChange={x => set({ again: x })} />}</Field>
      </Card>
      <label className="flex items-start gap-3 text-base cursor-pointer">
        <input type="checkbox" className="w-6 h-6 mt-0.5 shrink-0" checked={v.accept} onChange={e => set({ accept: e.target.checked })} />
        <span>
          Autorizo a {t.tenant.name} a guardar estes dados para o meu cadastro de {t.labels.member.toLowerCase()} e a carteirinha. O CPF fica guardado com criptografia.
        </span>
      </label>
      {errors.accept && <p className="text-sm text-bad">{errors.accept}</p>}
      {errors.form && <Notice tone={preview ? 'warn' : 'bad'}>{errors.form}</Notice>}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {busy ? 'Enviando...' : 'Enviar meu cadastro'}
      </Button>
      <p className="text-center text-sm text-muted">
        Já tem senha? <Link to={t.to('entrar')} className="text-accent underline">Entrar com CPF e senha</Link>
      </p>
    </form>
  );
}
