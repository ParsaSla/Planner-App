/** Discriminator values for the `items` table. */
export const ITEM_KIND = { TASK: 'TASK', EVENT: 'EVENT' } as const;
export const RECURRENCE = { ONE_TIME: 'ONE_TIME', RECURRING: 'RECURRING' } as const;

/** Groups completion rows into a map of parent id → list of completed occurrence start instants. */
export function groupCompletedInstants<T extends { instance_start: string }>(rows: T[], keyOf: (row: T) => string): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const row of rows) {
        const key = keyOf(row);
        const instants = map.get(key) ?? [];
        instants.push(row.instance_start);
        map.set(key, instants);
    }
    return map;
}
