/** Regras puras da escala de trabalho (servidor e tela usam as mesmas) */
import type { RosterDoc, RosterSlot } from './types.ts';

/** Pode mudar datas, turnos e vagas: quem criou e quem essa pessoa indicou */
/** Muda a escala: quem criou, os administradores que essa pessoa indicou e quem a diretoria autorizou (Escalas: aprovar) */
export function canManageRoster(r: Pick<RosterDoc, 'createdBy' | 'editorUids'>, uid: string | undefined, boardAdmin = false): boolean {
  return !!uid && (boardAdmin || r.createdBy === uid || (r.editorUids || []).includes(uid));
}

/** Ordem da escala: dia, hora de início e função */
export function sortSlots<T extends Pick<RosterSlot, 'date' | 'start' | 'role'>>(slots: T[]): T[] {
  return [...slots].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.role.localeCompare(b.role));
}
