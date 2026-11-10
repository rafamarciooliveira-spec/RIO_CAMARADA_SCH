/**
 * Código de primeiro acesso (ou de troca de senha) no cadastro do sócio: a diretoria gera, manda pelo
 * WhatsApp ou imprime, e a pessoa cria a própria senha em /primeiro-acesso. A diretoria não vê a senha.
 */
import { useState } from 'react';
import QRCode from 'qrcode';
import { Copy, KeySquare, MessageCircle, Printer } from 'lucide-react';
import { useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { formatDateTime } from '../../../shared/dates.ts';
import type { MemberDoc } from '../../../shared/types.ts';
import { Button, Notice, useToast } from '../../../ui/index.tsx';

export function AccessCodeBlock({ m }: { m: MemberDoc & { id: string } }) {
  const t = useTenant();
  const toast = useToast();
  const { run, busy } = useOp();
  const [res, setRes] = useState<{ code: string; expiresAt: string; link: string; hasLogin: boolean } | null>(null);
  if (!t.can('socios', 'editar') || t.tenant.loginMethods?.cpfPassword === false) return null;
  const first = m.fullName.split(' ')[0];
  const message = res
    ? `Olá, ${first}! Para entrar no portal da ${t.tenant.name} com CPF e senha:\n1. Abra ${res.link}\n2. Digite o seu CPF e este código: ${res.code}\n3. Escolha a sua senha.\nO código vale até ${formatDateTime(res.expiresAt, t.tenant.timezone)} e só funciona uma vez.`
    : '';
  const generate = async () => {
    const r = await run<typeof res>('access.createCode', { tenantId: t.tenantId, memberId: m.id });
    if (r) setRes(r);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.show('Mensagem copiada.', 'sucesso');
    } catch {
      toast.show('Não foi possível copiar. Selecione o texto e copie à mão.', 'erro');
    }
  };
  /** Papel para entregar em mãos: letras grandes, QR do link e o código */
  const print = async () => {
    if (!res) return;
    const qr = await QRCode.toDataURL(res.link, { width: 360, margin: 1 }).catch(() => '');
    const w = window.open('', '_blank');
    if (!w) return toast.show('O navegador bloqueou a janela de impressão.', 'erro');
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Primeiro acesso</title>
<style>body{font-family:Arial,sans-serif;max-width:640px;margin:32px auto;padding:0 16px;color:#111}h1{font-size:28px}p,li{font-size:20px;line-height:1.5}.code{font-size:56px;letter-spacing:12px;font-weight:bold;font-family:monospace;border:3px solid #111;border-radius:12px;padding:12px 20px;display:inline-block}</style></head><body>
<h1>${esc(t.tenant.name)}</h1><p>Olá, <b>${esc(m.fullName)}</b>. Para entrar no portal com CPF e senha:</p>
<ol><li>Aponte a câmera do celular para o QR abaixo (ou abra <b>${esc(res.link)}</b>).</li><li>Digite o seu CPF e este código:</li></ol>
<div class="code">${res.code}</div>
<ol start="3"><li>Escolha uma senha fácil de lembrar e toque em <b>Criar senha e entrar</b>.</li></ol>
${qr ? `<p><img src="${qr}" alt="QR do primeiro acesso" width="220" height="220"></p>` : ''}
<p>O código vale até <b>${esc(formatDateTime(res.expiresAt, t.tenant.timezone))}</b> e só funciona uma vez.</p>
<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
  return (
    <section className="space-y-2 p-3 rounded-xl border border-line">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <KeySquare className="w-4 h-4 text-accent" aria-hidden /> Entrar com CPF e senha
      </h3>
      <p className="text-xs text-muted">
        Para quem não usa a conta Google (como muitos sócios de mais idade). Gere um código e mande para {first}: no primeiro acesso a pessoa digita o CPF e o código e escolhe a própria senha. Esqueceu a senha? Gere outro código.
      </p>
      {!res ? (
        <Button size="sm" variant="secondary" loading={busy} onClick={generate}>
          {m.uid ? 'Gerar código para criar ou trocar a senha' : 'Gerar código de primeiro acesso'}
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="text-center rounded-xl bg-surface-2 p-3">
            <div className="text-xs text-muted">Código de {first}</div>
            <div className="font-mono font-bold text-3xl tracking-[0.35em]">{res.code}</div>
            <div className="text-xs text-muted">Vale até {formatDateTime(res.expiresAt, t.tenant.timezone)} e uma vez só</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" icon={<MessageCircle className="w-4 h-4" />}>Enviar pelo WhatsApp</Button>
            </a>
            <Button size="sm" variant="secondary" icon={<Copy className="w-4 h-4" />} onClick={copy}>Copiar mensagem</Button>
            <Button size="sm" variant="secondary" icon={<Printer className="w-4 h-4" />} onClick={print}>Imprimir para entregar</Button>
          </div>
          <Notice>Mande só para a própria pessoa (ou para quem a ajuda). Quem tem o código e o CPF cria a senha. Gerar outro código cancela este.</Notice>
        </div>
      )}
    </section>
  );
}
