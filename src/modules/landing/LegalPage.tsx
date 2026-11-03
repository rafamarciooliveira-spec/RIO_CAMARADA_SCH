/**
 * Minutas de política de privacidade e termos de uso.
 * TODO(JURÍDICO): textos provisórios, NÃO definitivos. Revisar com advogado antes de publicar.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from '../../brand.ts';

const PRIVACIDADE: { h: string; p: string[] }[] = [
  { h: 'Quem somos e papéis', p: [`${BRAND.name} é uma plataforma usada por sociedades culturais para gerir sócios, carteirinhas, finanças e atividades. Cada sociedade é a CONTROLADORA dos dados dos seus sócios; a plataforma atua como OPERADORA, tratando os dados conforme as instruções da sociedade (Lei 13.709/2018, LGPD).`, 'TODO(JURÍDICO): razão social, CNPJ e endereço da operadora; contato do encarregado (DPO).'] },
  { h: 'Dados tratados', p: ['Cadastro: nome, CPF (guardado cifrado e mostrado mascarado), data de nascimento, e-mail, telefone, endereço opcional, foto opcional, categoria e situação na sociedade.', 'Financeiro: cobranças, pagamentos e recibos. Atividades: presenças, inscrições, votos (sem vínculo entre a pessoa e o conteúdo do voto).', 'Não coletamos dados sensíveis por padrão. Campos personalizados que a sociedade criar sobre saúde, religião ou política exigem cuidado redobrado e base legal própria.'] },
  { h: 'Finalidades e bases legais', p: ['Execução do vínculo associativo (cadastro, carteirinha, cobranças); obrigação legal (registros financeiros e atas); legítimo interesse (comunicações da sociedade, com opção de sair); consentimento (uso de imagem e marketing, sempre separados e opcionais).', 'TODO(JURÍDICO): conferir o enquadramento de cada finalidade.'] },
  { h: 'Crianças e adolescentes', p: ['Cadastros de menores de 18 anos exigem responsável legal e consentimento específico, conforme o art. 14 da LGPD.'] },
  { h: 'Compartilhamento', p: ['Os dados ficam em servidores do Google Cloud (Firebase). E-mails transacionais são enviados por provedor contratado. Pagamentos, quando ativados, passam pelo provedor escolhido pela sociedade. Não vendemos dados.', 'TODO(JURÍDICO): lista de suboperadores e transferência internacional.'] },
  { h: 'Retenção', p: ['Registros financeiros e atas são guardados pelo prazo legal; cadastros de ex-sócios são anonimizados após o prazo definido pela sociedade.'] },
  { h: 'Seus direitos', p: ['Pelo próprio portal você pode ver e baixar seus dados, corrigir informações, gerenciar consentimentos e pedir exclusão. Pedidos são registrados e respondidos pela sociedade.'] },
  { h: 'Segurança e incidentes', p: ['Isolamento entre sociedades, permissões por papel, cifragem do CPF, auditoria de acessos e plano de resposta a incidentes com comunicação à ANPD e aos titulares quando necessário.'] },
  { h: 'Cookies', p: ['Usamos apenas armazenamento essencial ao funcionamento (sessão de login e preferências). Não usamos cookies de publicidade.'] },
];

const TERMOS: { h: string; p: string[] }[] = [
  { h: 'Objeto', p: [`Uso da plataforma ${BRAND.name} pela sociedade contratante e por seus sócios.`] },
  { h: 'Responsabilidades da sociedade', p: ['Manter os dados corretos, definir quem tem acesso e para quê, informar seus sócios sobre o tratamento de dados e responder aos pedidos dos titulares.'] },
  { h: 'Responsabilidades da plataforma', p: ['Manter o serviço disponível, seguro e atualizado; tratar os dados só conforme as instruções da sociedade; avisar sobre incidentes.'] },
  { h: 'Assinatura eletrônica de atas', p: ['As atas usam assinatura eletrônica simples (Lei 14.063/2020): registro de quem assinou, quando, e o resumo criptográfico do texto. TODO(JURÍDICO): validar uso para registro em cartório.'] },
  { h: 'Pagamentos', p: ['Cobranças por Pix e boleto dependem de provedor de pagamento escolhido. Enquanto não houver contratação, funcionam em modo de teste.'] },
  { h: 'Encerramento', p: ['A sociedade pode exportar seus dados a qualquer momento. TODO(JURÍDICO): prazos de exportação e exclusão após o encerramento.'] },
];

export default function LegalPage({ doc }: { doc: 'privacidade' | 'termos' }) {
  const content = doc === 'privacidade' ? PRIVACIDADE : TERMOS;
  const title = doc === 'privacidade' ? 'Política de privacidade' : 'Termos de uso';
  useEffect(() => {
    document.title = `${title} | ${BRAND.name}`;
  }, [title]);
  return (
    <div className="min-h-screen bg-[#0e100f] text-[#f3ecdd]">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <Link to="/" className="text-sm text-[#c9a45a]">← {BRAND.name}</Link>
        <h1 className="font-display text-4xl mt-6">{title}</h1>
        <p className="mt-3 text-sm px-3 py-2 rounded-lg bg-[#c9a45a]/15 border border-[#c9a45a]/40">Minuta em revisão jurídica. Este texto ainda não é definitivo.</p>
        {content.map(s => (
          <section key={s.h} className="mt-8">
            <h2 className="text-xl font-semibold">{s.h}</h2>
            {s.p.map((p, i) => <p key={i} className="mt-2 text-white/75 leading-relaxed">{p}</p>)}
          </section>
        ))}
      </div>
    </div>
  );
}
