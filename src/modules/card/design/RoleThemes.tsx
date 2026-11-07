/** Cores próprias da carteirinha para quem ocupa um cargo ou grupo do organograma (qualquer tipo de sociedade). */
import { useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useData, useDoc, useFileUrl } from '../../../app/DataContext.tsx';
import { randomId, resizeImage } from '../../../utils/image.ts';
import { useTenant } from '../../../app/TenantContext.tsx';
import { P } from '../../../shared/paths.ts';
import type { OrgChartDoc } from '../../../shared/types.ts';
import { Button, Notice, Select, Toggle } from '../../../ui/index.tsx';
import { ColorPicker } from '../../../ui/ColorPicker.tsx';
import { ruleValues, type CardTemplateDoc, type RoleTheme } from '../cardTemplate.ts';
import { MultiPick } from './MultiPick.tsx';

const rid = () => `r${Math.random().toString(36).slice(2, 9)}`;

export function RoleThemes({ value, set, logoSrc }: { value: CardTemplateDoc; set: (p: Partial<CardTemplateDoc>) => void; logoSrc: string }) {
  const t = useTenant();
  const chart = useDoc<OrgChartDoc>(P.orgchart(t.tenantId));
  const groups = [...new Set((chart.data?.positions || []).map(p => p.group).filter(Boolean))];
  const titles = [...new Set((chart.data?.positions || []).map(p => p.title).filter(Boolean))];
  const list = value.roleThemes || [];
  const upd = (id: string, p: Partial<RoleTheme>) => set({ roleThemes: list.map(r => (r.id === id ? { ...r, ...p } : r)) });
  return (
    <div className="space-y-3 pt-4 border-t border-line">
      <div>
        <div className="text-sm font-semibold">Cores e adesivos por cargo ou grupo</div>
        <p className="text-xs text-muted">Quem ocupa os cargos escolhidos ou faz parte do grupo no organograma ganha a carteirinha nestas cores e/ou um adesivo junto da foto. Ex.: coroa dourada para a Rainha da beleza e prateada para as princesas, luva para Goleiro. Para todos com a mesma cor e só o adesivo diferente, desligue Mudar também as cores. Nas cores vale a primeira regra que combinar; adesivos aparecem até 3.</p>
      </div>
      {!groups.length && <Notice>Monte o organograma primeiro: os grupos e cargos dele aparecem aqui.</Notice>}
      {list.map(r => (
        <div key={r.id} className="p-3 rounded-xl border border-line space-y-2">
          <div className="flex items-center gap-2">
            <Select aria-label="Tipo da regra" className="w-40" value={r.match} onChange={e => upd(r.id, { match: e.target.value as RoleTheme['match'], value: '', values: [] })}>
              <option value="grupo">Grupo (aba)</option>
              <option value="cargo">Cargos</option>
            </Select>
            <span className="flex-1 text-xs text-muted">{ruleValues(r).length ? `${ruleValues(r).length} escolhido(s)` : 'Escolha abaixo um ou mais'}</span>
            <button type="button" aria-label="Tirar regra" className="p-2 rounded-lg hover:bg-surface-2 text-bad cursor-pointer" onClick={() => set({ roleThemes: list.filter(x => x.id !== r.id) })}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <MultiPick label="Para quem vale a regra" options={r.match === 'grupo' ? groups : titles} values={ruleValues(r)} onChange={v => upd(r.id, { values: v, value: v[0] || '' })} />
          {r.value && <Holders rule={r} positions={chart.data?.positions || []} />}
          <Sticker rule={r} onChange={p => upd(r.id, { stickerPath: p })} />
          <Toggle checked={r.applyColors !== false} onChange={v => upd(r.id, { applyColors: v })} label="Mudar também as cores da carteirinha" />
          {r.applyColors !== false && <div className="grid sm:grid-cols-2 gap-2">
            {(
              [
                ['primaryColor', 'Principal'],
                ['secondaryColor', 'Secundária'],
                ['accentColor', 'Destaque'],
                ['textColor', 'Texto'],
              ] as const
            ).map(([k, l]) => (
              <div key={k}>
                <div className="text-[11px] text-muted mb-1">{l}</div>
                <ColorPicker label={`${l} de ${ruleValues(r).join(', ') || 'regra'}`} value={r[k]} imageSrc={logoSrc} onChange={v => upd(r.id, { [k]: v })} />
 </div>
            ))}
          </div>}
          {r.applyColors !== false && <div className="h-6 rounded-lg" style={{ background: `linear-gradient(135deg, ${r.primaryColor}, ${r.secondaryColor})`, borderBottom: `3px solid ${r.accentColor}` }} aria-hidden />}
        </div>
      ))}
      {list.length < 12 && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => set({ roleThemes: [...list, { id: rid(), match: 'grupo', value: '', primaryColor: '#5b4300', secondaryColor: '#2b1f00', accentColor: '#f2c14e', textColor: '#ffffff' }] })}
        >
          Adicionar regra de cor
        </Button>
      )}
    </div>
  );
}

/** Adesivo da regra: imagem pequena (PNG com fundo transparente fica melhor) */
/** Quem ganha a regra hoje: sem ninguém no cargo, o adesivo não aparece em carteirinha nenhuma */
function Holders({ rule, positions }: { rule: RoleTheme; positions: OrgChartDoc['positions'] }) {
  const norm = (x: string) => x.trim().toLowerCase();
  const vals = ruleValues(rule).map(norm);
  const hit = positions.filter(p => p.memberId && vals.includes(norm(rule.match === 'grupo' ? p.group : p.title)));
  if (!hit.length)
    return <p className="text-xs text-warn">Ninguém ocupa {ruleValues(rule).join(', ')} no organograma ainda. Indique a pessoa no Organograma para a carteirinha dela mudar.</p>;
  const names = [...new Set(hit.map(p => p.personName || p.title))];
  return <p className="text-xs text-muted">Aparece na carteirinha de: {names.join(', ')}.</p>;
}

function Sticker({ rule, onChange }: { rule: RoleTheme; onChange: (path: string | undefined) => void }) {
  const t = useTenant();
  const { client } = useData();
  const url = useFileUrl(rule.stickerPath || null, true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setErr('');
    try {
      if (f.size > 8 * 1024 * 1024) throw new Error('Imagem grande demais (máximo de 8 MB).');
      const blob = await resizeImage(f, 256, 'image/png');
      const path = `tenants/${t.tenantId}/public/stickers/${randomId()}.png`;
      await client.upload(path, blob, 'image/png');
      onChange(path);
    } catch (e) {
      setErr((e as Error).message || 'Não foi possível enviar a imagem.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-12 h-12 rounded-lg border border-dashed border-line flex items-center justify-center bg-surface-2 overflow-hidden">
        {url ? <img src={url} alt="Adesivo" className="w-full h-full object-contain" /> : <ImagePlus className="w-5 h-5 text-muted" aria-hidden />}
      </div>
      <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-surface-2 border border-line cursor-pointer ${busy ? 'opacity-50' : ''}`}>
        {busy ? 'Enviando...' : url ? 'Trocar adesivo' : 'Enviar adesivo (imagem)'}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={e => upload(e.target.files?.[0])} />
      </label>
      {rule.stickerPath && (
        <button type="button" className="text-xs text-bad cursor-pointer" onClick={() => onChange(undefined)}>
          Tirar adesivo
        </button>
      )}
      {err && <p className="text-xs text-bad w-full">{err}</p>}
    </div>
  );
}
