/** Link da ficha de cadastro para a diretoria copiar e mandar (WhatsApp, e-mail, cartaz com QR). */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, MessageCircle } from 'lucide-react';
import { useTenant } from '../../../app/TenantContext.tsx';
import { Button, Modal, Notice, useToast } from '../../../ui/index.tsx';

export function SignupLinkModal({ onClose }: { onClose: () => void }) {
  const t = useTenant();
  const toast = useToast();
  const join = !!t.settings?.joinPayment?.enabled;
  const url = `${location.origin}${t.to(join ? 'adesao' : 'cadastro')}`;
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [url]);
  const message = `Olá! Para fazer o seu cadastro na ${t.tenant.name}, entre com a sua conta Google neste link e preencha a ficha. A ${t.labels.board.toLowerCase()} aprova e a sua carteirinha fica no celular: ${url}`;
  const copy = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(ok, 'sucesso');
    } catch {
      toast.show('Não foi possível copiar. Selecione o link e copie à mão.', 'erro');
    }
  };
  return (
    <Modal open onClose={onClose} title="Link de cadastro">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {join && <>Link de <strong>adesão</strong>: a pessoa vê a taxa e a anuidade, paga pelo Pix e anexa o comprovante antes da ficha. A ficha sem pagamento continua em {location.origin}{t.to('cadastro')}. </>}
          Mande este link para quem vai se associar. A pessoa entra com a conta Google, preenche a ficha (com os dependentes) e o cadastro aparece aqui em <strong>Aguardando aprovação</strong>.
        </p>
        <div className="p-3 rounded-xl bg-surface-2 font-mono text-xs break-all select-all">{url}</div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Copy className="w-4 h-4" />} onClick={() => copy(url, 'Link copiado.')}>
            Copiar link
          </Button>
          <Button variant="secondary" icon={<Copy className="w-4 h-4" />} onClick={() => copy(message, 'Mensagem copiada.')}>
            Copiar mensagem pronta
          </Button>
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" icon={<MessageCircle className="w-4 h-4" />}>
              Enviar pelo WhatsApp
            </Button>
          </a>
        </div>
        {qr && (
          <div className="flex items-center gap-4">
            <img src={qr} alt="QR Code do link de cadastro" className="w-32 h-32 rounded-lg bg-white p-1" />
            <div className="space-y-2">
              <p className="text-xs text-muted">Para cartaz na sede ou no evento: quem apontar a câmera abre a ficha.</p>
              <a href={qr} download={`cadastro-${t.tenant.slug}.png`}>
                <Button size="sm" variant="secondary" icon={<Download className="w-4 h-4" />}>
                  Baixar QR Code
                </Button>
              </a>
            </div>
          </div>
        )}
        {!t.settings?.approvalRequired && <Notice tone="warn">A aprovação está desligada nas configurações: quem preencher a ficha entra aprovado na hora.</Notice>}
      </div>
    </Modal>
  );
}
