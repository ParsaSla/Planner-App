// Which collection of tasks the main panel is showing.
export type SmartView = 'today' | 'all' | 'recurring' | 'completed';

export type Selection =
  | { kind: 'view'; view: SmartView }
  | { kind: 'group'; id: string };

export function selectionKey(s: Selection): string {
  return s.kind === 'view' ? `view:${s.view}` : `group:${s.id}`;
}
