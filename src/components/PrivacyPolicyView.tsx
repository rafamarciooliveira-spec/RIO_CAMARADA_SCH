import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config.ts';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext.tsx';
import { useDialog } from '../context/DialogContext.tsx';
import { PrivacyDpoSettings } from '../types/index.ts';
import { Shield, Lock, FileText, Mail, Phone, MapPin, Edit3, CheckCircle2, UserCheck, X } from 'lucide-react';

const DEFAULT_DPO_SETTINGS: PrivacyDpoSettings = {
  id: 'privacy_dpo',
  dpoName: 'Secretaria Geral & Diretoria Jurídica',
  dpoEmail: 'dpo@riocamarada.com.br',
  dpoPhone: '(47) 3374-1234',
  dpoAddress: 'Rua Rio Camarada, 1200 - Bairro Rio Camarada, Schroeder - SC, CEP 89275-000',
  updatedAt: new Date().toISOString(),
};

export interface PrivacyPolicyViewProps {
  isAdmin?: boolean;
}

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ isAdmin: propIsAdmin }) => {
  const { isAdmin: authIsAdmin, currentUser } = useAuth();
  const isAdmin = propIsAdmin ?? authIsAdmin;
  const dialog = useDialog();

  const [dpo, setDpo] = useState<PrivacyDpoSettings>(DEFAULT_DPO_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isEditingDpo, setIsEditingDpo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'siteSettings', 'privacy_dpo'))
      .then(snap => {
        if (snap.exists()) {
          setDpo({ ...DEFAULT_DPO_SETTINGS, ...snap.data() } as PrivacyDpoSettings);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handleStartEdit = () => {
    setEditName(dpo.dpoName);
    setEditEmail(dpo.dpoEmail);
    setEditPhone(dpo.dpoPhone);
    setEditAddress(dpo.dpoAddress);
    setIsEditingDpo(true);
  };

  const handleSaveDpo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated: PrivacyDpoSettings = {
        id: 'privacy_dpo',
        dpoName: editName.trim(),
        dpoEmail: editEmail.trim(),
        dpoPhone: editPhone.trim(),
        dpoAddress: editAddress.trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.email || 'admin',
      };
      await setDoc(doc(db, 'siteSettings', 'privacy_dpo'), updated, { merge: true });
      setDpo(updated);
      setIsEditingDpo(false);
      await dialog.alert('Informações do Encarregado de Dados (DPO) atualizadas com sucesso!', {
        title: 'DPO Atualizado',
      });
    } catch (err: any) {
      await dialog.alert(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Política de Privacidade & Proteção de Dados</h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Associação Esportiva e Cultural Rio Camarada • Em conformidade com a Lei Federal nº 13.709/2018 (LGPD)
            </p>
          </div>
        </div>
      </div>

      {/* DPO / Encarregado Card */}
      <div className="bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            Encarregado pelo Tratamento de Dados Pessoais (DPO)
          </h2>
          {isAdmin && (
            <button
              onClick={handleStartEdit}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs font-semibold rounded-lg transition"
            >
              <Edit3 className="w-3.5 h-3.5" /> Editar Dados do DPO
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-zinc-300">
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800">
            <span className="text-zinc-500 block">Nome / Responsável:</span>
            <span className="font-bold text-white mt-0.5 block">{dpo.dpoName}</span>
          </div>
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800">
            <span className="text-zinc-500 block">Canal Oficial de E-mail:</span>
            <span className="font-medium text-emerald-400 mt-0.5 block">{dpo.dpoEmail}</span>
          </div>
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800">
            <span className="text-zinc-500 block">Telefone de Contato:</span>
            <span className="font-medium text-white mt-0.5 block">{dpo.dpoPhone}</span>
          </div>
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800">
            <span className="text-zinc-500 block">Endereço Postal:</span>
            <span className="font-medium text-zinc-300 mt-0.5 block">{dpo.dpoAddress}</span>
          </div>
        </div>
      </div>

      {/* Edit DPO Modal */}
      {isEditingDpo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-emerald-400" /> Editar Encarregado (DPO)
              </h3>
              <button onClick={() => setIsEditingDpo(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveDpo} className="p-5 space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 font-semibold block mb-1">Nome do Encarregado / Setor *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
                  required
                />
              </div>
              <div>
                <label className="text-zinc-400 font-semibold block mb-1">E-mail do DPO *</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
                  required
                />
              </div>
              <div>
                <label className="text-zinc-400 font-semibold block mb-1">Telefone *</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
                  required
                />
              </div>
              <div>
                <label className="text-zinc-400 font-semibold block mb-1">Endereço da Sede *</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsEditingDpo(false)}
                  className="px-4 py-2 bg-zinc-800 text-white rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg"
                >
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Policy Text */}
      <div className="bg-zinc-900/40 p-6 sm:p-8 rounded-2xl border border-zinc-800 space-y-6 text-xs text-zinc-300 leading-relaxed">
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" /> 1. Introdução e Compromisso
          </h3>
          <p>
            A <strong>Associação Esportiva e Cultural Rio Camarada</strong>, pessoa jurídica de direito privado sem fins lucrativos, tem o compromisso de proteger a privacidade, a intimidade e os dados pessoais de seus associados, colaboradores e visitantes, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei Federal nº 13.709/2018 - LGPD).
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" /> 2. Dados Coletados e Finalidades
          </h3>
          <p>Coletamos exclusivamente os dados necessários para o cumprimento de nossos fins estatutários:</p>
          <ul className="list-disc list-inside space-y-1 pl-2 text-zinc-400">
            <li><strong>Nome, CPF e Data de Nascimento:</strong> Para qualificação do sócio, identificação no estande de tiro e emissão da carteirinha social.</li>
            <li><strong>E-mail e Telefone:</strong> Para envio de convocações de assembleias, comunicados oficiais e recuperação de senha.</li>
            <li><strong>Foto Facial (3x4):</strong> Para a confecção da carteirinha digital antifraude com QR Code e controle de acesso às dependências.</li>
            <li><strong>Dados de Menores de Idade (menores de 18 anos):</strong> Coletados apenas com o consentimento específico e em destaque dado por pelo menos um dos pais ou pelo responsável legal (Art. 14 da LGPD).</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 3. Bases Legais para Tratamento
          </h3>
          <p>O tratamento de seus dados está fundamentado nas seguintes hipóteses legais da LGPD:</p>
          <ul className="list-disc list-inside space-y-1 pl-2 text-zinc-400">
            <li><strong>Execução de Contrato e Vínculo Associativo (Art. 7º, V):</strong> Para gestão cadastral, cobrança de mensalidades e emissão da carteirinha.</li>
            <li><strong>Cumprimento de Obrigação Legal e Regulatória (Art. 7º, II):</strong> Para controle de atiradores e normas de segurança pública aplicáveis ao tiro esportivo.</li>
            <li><strong>Consentimento Granular do Titular (Art. 7º, I):</strong> Para exibição de aniversário a outros sócios, divulgação de fotos de torneios e envio de informativos gerais.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" /> 4. Armazenamento e Segurança da Informação
          </h3>
          <p>
            Seus dados são protegidos em trânsito e em repouso pela infraestrutura do Google Cloud Platform (GCP), utilizando criptografia TLS 1.3 em trânsito e AES-256 em repouso. O acesso é estritamente restrito a membros autorizados da Diretoria Executiva da Associação.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" /> 5. Direitos do Titular de Dados
          </h3>
          <p>Você pode a qualquer momento, através da aba <strong>Meus Dados</strong> no Portal do Associado:</p>
          <ul className="list-disc list-inside space-y-1 pl-2 text-zinc-400">
            <li>Confirmar a existência de tratamento e acessar seus dados cadastrais;</li>
            <li>Baixar uma cópia em formato eletrônico (JSON);</li>
            <li>Solicitar retificação de dados incompletos ou desatualizados;</li>
            <li>Revogar consentimentos concedidos anteriormente com um clique;</li>
            <li>Solicitar a exclusão ou desfiliação de seus registros, ressalvadas as obrigações legais de guarda.</li>
          </ul>
        </section>

        <section className="space-y-2 border-t border-zinc-800 pt-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" /> 6. Uso e Exposição de Imagem nas Redes Sociais da Sociedade
          </h3>
          <p>
            Em consonância com o <strong>Art. 20 do Código Civil Brasileiro (Lei nº 10.406/2002)</strong> e com os <strong>Arts. 7º, I e 8º, § 4º da LGPD</strong>, a publicação de fotografias e vídeos captados durante torneios de tiro esportivo, treinos, premiações e celebrações sociais nos perfis e redes sociais oficiais da Sociedade (Instagram, Facebook, YouTube, website oficial e boletins institucionais) depende de consentimento expresso e inequívoco do associado ou de seu responsável legal (no caso de menores de idade, conforme Art. 14 da LGPD).
          </p>
          <p>
            Essa autorização é concedida a título gratuito, sem incidência de remuneração ou indenização, estritamente para finalidades institucionais, culturais e comemorativas da agremiação, sendo vedada qualquer destinação comercial abusiva ou que atente contra a honra e respeitabilidade do associado. O titular poderá revogar essa autorização a qualquer momento diretamente na aba <strong>Meus Dados (LGPD)</strong> do Portal do Associado.
          </p>
        </section>
      </div>
    </div>
  );
};
