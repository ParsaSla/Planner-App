// Shared JSON contract for outline extraction and course dashboards.
export interface OutlineOffering {
    year: number;
    term: string;
    deliveryMode: string;
    deliveryFormat: string;
    teachingPeriod: string;
    deliveryLocation: string;
    courseCode: string;
    activityGroupId: string;
}

export interface OutlineEvidence { path: string; text: string }
export interface OutlineWarning { code: string; path: string; message: string }
export interface OutlineLink { label: string; url: string }
export interface OutlineText { text: string; links: OutlineLink[] }

interface DeadlineBase {
    label: string;
    raw: string;
    evidence: OutlineEvidence[];
    assumptions: string[];
}

export type OutlineDeadline = DeadlineBase & (
    | { kind: 'datetime'; localDate: string; localTime: string; timezone: string | null; utc: string | null }
    | { kind: 'date'; localDate: string }
    | { kind: 'week-range'; week: number; rangeStart: string; rangeEnd: string }
    | { kind: 'exam-period' }
    | { kind: 'unknown' }
);

export interface OutlineAssessment {
    // Stable only within this response; not a database or cross-import identity.
    key: string;
    title: string;
    weightPercent: number | null;
    description: string;
    submissionNotes: string;
    hurdleRules: string;
    additionalInformation: string;
    learningOutcomes: string[];
    links: OutlineLink[];
    deadlines: OutlineDeadline[];
    scheduleEvidence: Array<OutlineEvidence & { tentative: boolean }>;
}

export interface OutlineResult {
    course: OutlineOffering & { name: string; campus: string | null; timezone: string | null; description: string };
    assessments: OutlineAssessment[];
    resources: Array<OutlineText & { field: string }>;
    contacts: Array<{
        name: string; position: string; email: string; location: string;
        phone: string; availability: string;
    }>;
    schedule: OutlineText & { tentative: boolean };
    warnings: OutlineWarning[];
    provenance: {
        sourceUrl: string;
        apiUrl: string;
        publishedOn: string | null;
        retrievedAt: string | null;
        rawResponse: Record<string, unknown>;
    };
}


export interface OutlineSyncSummary {
    created: number;
    updated: number;
    unchanged: number;
    linked: number;
    skipped: number;
}

export interface SavedOutlineResult {
    outline: OutlineResult;
    sync: OutlineSyncSummary;
}
