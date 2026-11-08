import { useEffect, useState } from 'react';
import { useData } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { errorMessage } from '../../data/client.ts';
import type { CustomFieldDef, JoinPaymentSettings, MemberCategory } from '../../shared/types.ts';

export interface FormOptions {
  categories: MemberCategory[];
  customFields: CustomFieldDef[];
  approvalRequired: boolean;
  requirePhoto: boolean; // foto obrigatória na ficha (vai na carteirinha)
  joinPayment?: JoinPaymentSettings; // adesão com Pix (link /adesao)
  pixKey?: string;
  pixCity?: string;
}

/** Categorias e campos do cadastro: das configurações (diretoria) ou da operação members.formOptions */
export function useFormOptions(enabled = true): { data: FormOptions | null; error: string } {
  const t = useTenant();
  const { client } = useData();
  const [data, setData] = useState<FormOptions | null>(null);
  const [error, setError] = useState('');
  const s = t.settings;
  useEffect(() => {
    if (!enabled || s) return;
    let alive = true;
    client
      .call<FormOptions>('members.formOptions', { tenantId: t.tenantId })
      .then(r => alive && setData(r))
      .catch(e => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [client, t.tenantId, s, enabled]);
  if (s)
    return {
      data: {
        categories: s.categories,
        customFields: s.customFields || [],
        approvalRequired: s.approvalRequired,
        requirePhoto: s.cardRequiresPhoto !== false,
        ...(s.joinPayment?.enabled ? { joinPayment: s.joinPayment, pixKey: s.pixKey || '', pixCity: t.tenant.publicPage?.city || '' } : {}),
      },
      error: '',
    };
  return { data, error };
}
