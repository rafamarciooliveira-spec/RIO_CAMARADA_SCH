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
import type { CardTemplateDoc, RoleTheme } from '../cardTemplate.ts';

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
        <p className="text-xs text-muted">Quem ocupa o cargo ou faz parte do grupo no organograma ganha a carteirinha nestas cores e/ou um adesivo junto da foto. Ex.: coroa para Rei e Rainha do tiro, luva para Goleiro, bola para Artilheiro. Nas cores vale a primeira regra que combinar; adesivos aparecem até 3.</p>
      </div>
      {!groups.length && <Notice>Monte o organograma primeiro: os grupos e cargos dele aparecem aqui.</Notice>}
      {list.map(r => (
        <div key={r.id} className="p-3 rounded-xl border border-line space-y-2">
          <div className="grid sm:grid-cols-[10rem_1fr_auto] gap-2 items-center">
            <Select aria-label="Tipo da regra" value={r.match} onChange={e => upd(r.id, { match: e.target.value as RoleTheme['match'], value: '' })}>
              <option value="grupo">Grupo</option>
              <option value="cargo">Cargo</option>
            </Select>
            <Select aria-label="Qual" value={r.value} onChange={e => upd(r.id, { value: e.target.value })}>
              <option value="">Escolha...</option>
              {(r.match === 'grupo' ? groups : titles).map(x => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
            <button type="button" aria-label="Tirar regra" className="p-2 rounded-lg hover:bg-surface-2 text-bad cursor-pointer" onClick={() => set({ roleThemes: list.filter(x => x.id !== r.id) })}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
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
                <ColorPicker label={`${l} de ${r.value || 'regra'}`} value={r[k]} imageSrc={logoSrc} onChange={v => upd(r.id, { [k]: v })} />
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
