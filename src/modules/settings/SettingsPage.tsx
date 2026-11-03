/** Configurações da sociedade, em abas. Quem só tem "ver" enxerga tudo em modo leitura. */
import { useState } from 'react';
import { useTenant } from '../../app/TenantContext.tsx';
import { Card, Loading, Notice, PageHeader, Select } from '../../ui/index.tsx';
import { AddressTab, IdentityTab, LabelsTab, LoginTab, PublicPageTab } from './tabs/IdentityTabs.tsx';
import { CustomFieldsTab, EmailTemplatesTab, LgpdTab, ModulesTab, RulesTab } from './tabs/RulesTabs.tsx';
import { PeopleTab } from './tabs/PeopleTab.tsx';

type TabId = 'identidade' | 'rotulos' | 'regras' | 'campos' | 'modulos' | 'emails' | 'publica' | 'login' | 'pessoas' | 'lgpd' | 'endereco';

const TABS: { id: TabId; label: string }[] = [
  { id: 'identidade', label: 'Identidade' },
  { id: 'rotulos', label: 'Rótulos' },
  { id: 'regras', label: 'Categorias e regras' },
  { id: 'campos', label: 'Campos personalizados' },
  { id: 'modulos', label: 'Módulos' },
  { id: 'emails', label: 'Modelos de e-mail' },
  { id: 'publica', label: 'Página pública' },
  { id: 'login', label: 'Login' },
  { id: 'pessoas', label: 'Papéis e pessoas' },
  { id: 'lgpd', label: 'LGPD' },
  { id: 'endereco', label: 'Endereço' },
];

export default function SettingsPage() {
  const t = useTenant();
  const [tab, setTab] = useState<TabId>('identidade');
  const readOnly = !t.can('sociedade', 'editar');
  const needsSettings = ['regras', 'campos', 'emails', 'lgpd'].includes(tab);
  return (
    <div className="space-y-5">
      <PageHeader title="Configurações" subtitle="Identidade, regras, módulos, acessos e privacidade da sociedade." />
      {readOnly && <Notice>Seu papel pode ver as configurações, mas não alterar.</Notice>}
      <div className="grid lg:grid-cols-[220px_1fr] gap-5 items-start">
        <nav aria-label="Seções das configurações" className="hidden lg:block space-y-0.5">
          {TABS.map(x => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              aria-current={tab === x.id ? 'page' : undefined}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm cursor-pointer ${tab === x.id ? 'bg-surface-2 font-semibold' : 'hover:bg-surface-2 text-muted'}`}
            >
              {x.label}
            </button>
          ))}
        </nav>
        <div className="lg:hidden">
          <Select aria-label="Seção" value={tab} onChange={e => setTab(e.target.value as TabId)}>
            {TABS.map(x => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
        </div>
        <Card className="min-w-0">
          <h2 className="font-bold mb-4">{TABS.find(x => x.id === tab)!.label}</h2>
          {needsSettings && !t.settings ? (
            <Loading />
          ) : (
            <div key={tab}>
              {tab === 'identidade' && <IdentityTab readOnly={readOnly} />}
              {tab === 'rotulos' && <LabelsTab readOnly={readOnly} />}
              {tab === 'regras' && <RulesTab readOnly={readOnly} />}
              {tab === 'campos' && <CustomFieldsTab readOnly={readOnly} />}
              {tab === 'modulos' && <ModulesTab readOnly={readOnly} />}
              {tab === 'emails' && <EmailTemplatesTab readOnly={readOnly} />}
              {tab === 'publica' && <PublicPageTab readOnly={readOnly} />}
              {tab === 'login' && <LoginTab readOnly={readOnly} />}
              {tab === 'pessoas' && <PeopleTab />}
              {tab === 'lgpd' && <LgpdTab readOnly={readOnly} />}
              {tab === 'endereco' && <AddressTab readOnly={readOnly} />}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
