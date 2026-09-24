/**
 * What the Observer is told of the telemetry: a summary written by code,
 * not the rows. For each column, how many values, the first and the last,
 * the smallest and the largest, the mean, and whether it moves at all. The
 * rows can run to thousands; the summary is what a person reading the
 * logger would note first, and every number in it is computed, so the
 * Observer reasons on facts it could not have made up.
 */

export interface ColumnSummary {
    column: string;
    count: number;
    numeric: boolean;
    first: number | string | null;
    last: number | string | null;
    min: number | null;
    max: number | null;
    mean: number | null;
    /** false when every value is the same: a column that never moves says nothing about dynamics. */
    varies: boolean;
}

export interface TelemetrySummary {
    rows: number;
    columns: ColumnSummary[];
}

const round = (v: number): number => Number(v.toPrecision(4));

export function summarizeTelemetry(rows: Array<Record<string, unknown>>): TelemetrySummary {
    const names = [...new Set(rows.flatMap((r) => Object.keys(r ?? {})))];
    const columns = names.map((column): ColumnSummary => {
        const values = rows.map((r) => r?.[column]).filter((v) => v !== undefined && v !== null && v !== "");
        const numbers = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        const numeric = values.length > 0 && numbers.length === values.length;
        const first = (values[0] as number | string | undefined) ?? null;
        const last = (values.at(-1) as number | string | undefined) ?? null;
        return {
            column,
            count: values.length,
            numeric,
            first: typeof first === "number" ? round(first) : first,
            last: typeof last === "number" ? round(last) : last,
            min: numeric ? round(Math.min(...numbers)) : null,
            max: numeric ? round(Math.max(...numbers)) : null,
            mean: numeric ? round(numbers.reduce((a, b) => a + b, 0) / numbers.length) : null,
            varies: new Set(values.map(String)).size > 1,
        };
    });
    return { rows: rows.length, columns };
}
