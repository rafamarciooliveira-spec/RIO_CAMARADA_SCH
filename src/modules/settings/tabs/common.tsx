import { Save } from 'lucide-react';
import { Button } from '../../../ui/index.tsx';

export function SaveBar({ dirty, busy, onSave, disabled }: { dirty: boolean; busy: boolean; onSave: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 pt-4 mt-4 border-t border-line">
      <Button icon={<Save className="w-4 h-4" />} loading={busy} disabled={!dirty || disabled} onClick={onSave}>
        Salvar
      </Button>
      {dirty && <span className="text-xs text-warn">Há mudanças não salvas.</span>}
    </div>
  );
}

export function slugId(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || `item_${Date.now().toString(36)}`
  );
}
