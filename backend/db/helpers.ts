/** Discriminator values for the `items` table. */
export const ITEM_KIND = { TASK: 'TASK', EVENT: 'EVENT' } as const;
export const RECURRENCE = { ONE_TIME: 'ONE_TIME', RECURRING: 'RECURRING' } as const;

/** Groups completion rows into a map of parent id → list of completed instance dates. */
export function groupInstanceDates<T extends { instance_date: string }>(rows: T[], keyOf: (row: T) => string): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const row of rows) {
        const key = keyOf(row);
        const dates = map.get(key) ?? [];
        dates.push(row.instance_date);
        map.set(key, dates);
    }
    return map;
}
