/**
 * Tela genérica de cadastro (lista + formulário) dirigida por configuração de campos.
 * Grava pelas operações generic.save / generic.delete, que validam cada coleção no servidor.
 */
import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useDoc, useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { isoToLocalInput, localInputToIso } from '../../app/formHelpers.ts';
import { GENERIC_COLLECTIONS, type GenericCollection } from '../../shared/paths.ts';
import type { QuerySpec } from '../../shared/core/store.ts';
import type { ModuleId } from '../../shared/modules.ts';
import { Button, EmptyState, ErrorState, Field, Input, Loading, Modal, MoneyInput, PageHeader, SearchBox, Select, Table, Textarea, Toggle, useConfirm, type Column } from '../../ui/index.tsx';

export type FieldType = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'datetime' | 'select' | 'toggle';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  max?: number;
  min?: number;
  options?: { value: string; label: string }[];
  /** Campo opcional: vazio não é enviado (o servidor recusa string vazia em ids e datas) */
  optional?: boolean;
  wide?: boolean;
  placeholder?: string;
}

export type Doc = Record<string, unknown> & { id: string };

export interface CrudConfig {
  collection: GenericCollection;
  title: string;
  subtitle?: string;
  singular: string; // "oficina", "item"
  fields: FieldDef[];
  columns: Column<Doc>[];
  defaults: () => Record<string, unknown>;
  /** Campos obrigatórios no servidor que não aparecem no formulário (só na criação) */
  createExtra?: () => Record<string, unknown>;
  query?: QuerySpec;
  searchKeys?: string[];
  filter?: (row: Doc) => boolean;
  allowDelete?: boolean;
  emptyText?: string;
  icon?: React.ReactNode;
  /** Conteúdo extra no formulário de um registro existente (inscrições, empréstimos etc.) */
  detail?: (row: Doc) => React.ReactNode;
  /** Conteúdo extra no formulário (novo ou existente), com acesso ao estado */
  formExtra?: (form: Record<string, unknown>, set: (patch: Record<string, unknown>) => void, row: Doc | null) => React.ReactNode;
  /** Ajusta os dados antes de enviar */
  toData?: (form: Record<string, unknown>, row: Doc | null) => Record<string, unknown>;
  headerActions?: React.ReactNode;
  /** Troca o cadastro padrão por um fluxo próprio (ex.: enquete que avisa todos) */
  onCreate?: () => void;
  toolbar?: React.ReactNode;
}

function cleanValue(f: FieldDef, v: unknown): unknown {
  if (f.type === 'number') return Number(v) || 0;
  if (f.type === 'money') return Math.round(Number(v) || 0);
  if (f.type === 'toggle') return !!v;
  if (typeof v === 'string') return v.trim();
  return v;
}

export function buildData(fields: FieldDef[], form: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = cleanValue(f, form[f.key]);
    if (v === '' || v === undefined || v === null) {
      if (f.optional) continue;
      if (f.type !== 'text' && f.type !== 'textarea') continue;
    }
    out[f.key] = v;
  }
  return out;
}

export function FieldInput({ f, value, onChange, disabled }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  if (f.type === 'toggle') return <Toggle checked={!!value} disabled={disabled} onChange={onChange} label={f.label} />;
  return (
    <Field label={f.label} required={f.required} hint={f.hint}>
      {id => {
        switch (f.type) {
          case 'textarea':
            return <Textarea id={id} value={String(value ?? '')} maxLength={f.max} disabled={disabled} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} />;
          case 'number':
            return <Input id={id} type="number" min={f.min ?? 0} max={f.max} value={Number(value ?? 0)} disabled={disabled} onChange={e => onChange(Number(e.target.value))} />;
          case 'money':
            return <MoneyInput id={id} value={Number(value ?? 0)} disabled={disabled} onChange={onChange} />;
          case 'date':
            return <Input id={id} type="date" value={String(value ?? '')} disabled={disabled} onChange={e => onChange(e.target.value)} />;
          case 'datetime':
            return <Input id={id} type="datetime-local" value={isoToLocalInput(String(value ?? ''))} disabled={disabled} onChange={e => onChange(localInputToIso(e.target.value))} />;
          case 'select':
            return (
              <Select id={id} value={String(value ?? '')} disabled={disabled} onChange={e => onChange(e.target.value)}>
                {f.optional && <option value="">Nenhum</option>}
                {(f.options || []).map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            );
          default:
            return <Input id={id} value={String(value ?? '')} maxLength={f.max} disabled={disabled} placeholder={f.placeholder} onChange={e => onChange(e.target.value)} />;
        }
      }}
    </Field>
  );
}

export function CrudPage({ config, embedded }: { config: CrudConfig; embedded?: boolean }) {
  const t = useTenant();
  const module = GENERIC_COLLECTIONS[config.collection].module as ModuleId;
  const path = GENERIC_COLLECTIONS[config.collection].path(t.tenantId);
  const list = useList<Record<string, unknown>>(path, config.query);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Doc | 'novo' | null>(null);
  const term = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (list.data as Doc[]).filter(r => (!config.filter || config.filter(r)) && (!term || (config.searchKeys || ['name']).some(k => String(r[k] ?? '').toLowerCase().includes(term)))),
    [list.data, term, config]
  );
  const canCreate = t.can(module, 'criar');
  const body = (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar" />
        {config.toolbar}
        {canCreate && (
          <Button size="sm" className="sm:ml-auto" icon={<Plus className="w-4 h-4" />} onClick={() => (config.onCreate ? config.onCreate() : setOpen('novo'))}>
            Adicionar {config.singular}
          </Button>
        )}
      </div>
      {list.error ? (
        <ErrorState text={list.error} />
      ) : list.loading ? (
        <Loading />
      ) : (
        <Table rows={rows} columns={config.columns} onRowClick={r => setOpen(r)} empty={<EmptyState icon={config.icon} title="Nada cadastrado" text={config.emptyText} />} />
      )}
      {open && <CrudModal config={config} row={open === 'novo' ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
  if (embedded) return body;
  return (
    <div className="space-y-4">
      <PageHeader title={config.title} subtitle={config.subtitle} actions={config.headerActions} />
      {body}
    </div>
  );
}

function CrudModal({ config, row, onClose }: { config: CrudConfig; row: Doc | null; onClose: () => void }) {
  const t = useTenant();
  const confirm = useConfirm();
  const { run, busy } = useOp();
  const module = GENERIC_COLLECTIONS[config.collection].module as ModuleId;
  const live = useDoc<Record<string, unknown>>(row ? `${GENERIC_COLLECTIONS[config.collection].path(t.tenantId)}/${row.id}` : null);
  const current = (live.data as Doc | null) || row;
  const [form, setForm] = useState<Record<string, unknown>>(() => ({ ...config.defaults(), ...(row || {}) }));
  const set = (patch: Record<string, unknown>) => setForm(f => ({ ...f, ...patch }));
  const canSave = t.can(module, row ? 'editar' : 'criar');
  const canDelete = !!row && config.allowDelete !== false && t.can(module, 'editar');
  const missing = config.fields.some(f => f.required && f.type !== 'toggle' && (form[f.key] === '' || form[f.key] === undefined || form[f.key] === null));

  const save = async () => {
    let data = buildData(config.fields, form);
    if (config.toData) data = config.toData({ ...form, ...data }, current);
    if (!row && config.createExtra) data = { ...config.createExtra(), ...data };
    const r = await run('generic.save', { tenantId: t.tenantId, collection: config.collection, ...(row ? { id: row.id } : {}), data }, { success: 'Salvo.' });
    if (r) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={row ? String(row.name || row.title || row.partner || `Editar ${config.singular}`) : `Novo cadastro: ${config.singular}`}
      footer={
        <>
          {canDelete && (
            <Button
              variant="ghost"
              className="mr-auto text-bad"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={async () => {
                if (await confirm({ title: `Excluir ${config.singular}?`, text: 'Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', danger: true })) {
                  if (await run('generic.delete', { tenantId: t.tenantId, collection: config.collection, id: row!.id }, { success: 'Excluído.' })) onClose();
                }
              }}
            >
              Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {canSave ? 'Cancelar' : 'Fechar'}
          </Button>
          {canSave && (
            <Button loading={busy} disabled={missing} onClick={save}>
              Salvar
            </Button>
          )}
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {config.fields.map(f => (
          <div key={f.key} className={f.wide || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
            <FieldInput f={f} value={form[f.key]} disabled={!canSave} onChange={v => set({ [f.key]: v })} />
          </div>
        ))}
      </div>
      {config.formExtra?.(form, set, current)}
      {current && config.detail?.(current)}
    </Modal>
  );
}

/** Opções de select a partir de um mapa { valor: rótulo } */
export function opts(map: Record<string, string>): { value: string; label: string }[] {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

