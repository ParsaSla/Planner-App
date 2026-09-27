import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
    fetchCourseOutline, parseOutlineResponse, parseOutlineUrl, OutlineError,
    type OutlineDeadline, type OutlineResult,
} from '../backend/api/unswOutline';

function when(deadline: OutlineDeadline): string {
    switch (deadline.kind) {
        case 'datetime': return `${deadline.localDate} ${deadline.localTime} (${deadline.timezone ?? 'timezone unknown'})`;
        case 'date': return `${deadline.localDate} (time unknown)`;
        case 'week-range': return `Week ${deadline.week}: ${deadline.rangeStart} to ${deadline.rangeEnd}`;
        case 'exam-period': return 'Exam period — exact date unknown';
        case 'unknown': return 'Unresolved — review original wording';
    }
}

function printResult(result: OutlineResult): void {
    const { course, provenance } = result;
    console.log(`${course.courseCode} — ${course.name}`);
    console.log(`${course.year} · ${course.term} · ${course.deliveryLocation} · ${course.deliveryMode}`);
    console.log(`Published: ${provenance.publishedOn ?? 'unknown'} | Retrieved: ${provenance.retrievedAt ?? 'not recorded'}`);
    console.log(`Source: ${provenance.sourceUrl}\n`);
    console.log(course.description);
    console.table(result.assessments.map(assessment => ({
        Assessment: assessment.title,
        Weight: assessment.weightPercent === null ? 'Unknown' : `${assessment.weightPercent}%`,
        'Deadline candidates': assessment.deadlines.length,
        Precision: [...new Set(assessment.deadlines.map(deadline => deadline.kind))].join(', '),
    })));
    for (const assessment of result.assessments) {
        console.log(`\n${assessment.title} (${assessment.weightPercent ?? '?'}% total)`);
        if (assessment.description) console.log(assessment.description);
        if (assessment.submissionNotes) console.log(`Submission: ${assessment.submissionNotes}`);
        if (assessment.hurdleRules) console.log(`Hurdle: ${assessment.hurdleRules}`);
        if (assessment.additionalInformation) console.log(`Other information: ${assessment.additionalInformation}`);
        for (const deadline of assessment.deadlines) {
            console.log(`  ${deadline.label}: ${when(deadline)}`);
            for (const evidence of deadline.evidence) console.log(`    Source [${evidence.path}]: ${evidence.text}`);
            for (const assumption of deadline.assumptions) console.log(`    Assumption: ${assumption}`);
        }
        for (const evidence of assessment.scheduleEvidence) {
            console.log(`  Schedule evidence${evidence.tentative ? ' (tentative)' : ''}: ${evidence.text}`);
        }
        for (const link of assessment.links) console.log(`  ${link.label}: ${link.url}`);
    }
    console.log('\nResources');
    for (const resource of result.resources) {
        console.log(`[${resource.field}] ${resource.text}`);
        for (const link of resource.links) console.log(`  ${link.url}`);
    }
    console.log('\nContacts');
    for (const contact of result.contacts) console.log(Object.values(contact).filter(Boolean).join(' | '));
    console.log(`\nSchedule${result.schedule.tentative ? ' (tentative)' : ''}\n${result.schedule.text || 'Not supplied'}`);
    console.log(`\nWarnings (${result.warnings.length})`);
    for (const warning of result.warnings) console.log(`- ${warning.code} [${warning.path}]: ${warning.message}`);
    console.log('\nPreview only. No planner records were read or changed. Use --json to inspect all fields and the raw response.');
}

async function main(): Promise<void> {
    const { values } = parseArgs({ options: {
        url: { type: 'string' }, fixture: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean' },
    } });
    if (values.help) {
        console.log('Usage: npx tsx scripts/inspectUnswOutline.ts (--url <UNSW outline URL> | --fixture <file.json>) [--json]');
        console.log('Fixture format: { sourceUrl, retrievedAt?, response: <raw UNSW JSON> }');
        return;
    }
    if (Boolean(values.url) === Boolean(values.fixture)) throw new Error('Supply exactly one of --url or --fixture. Use --help for usage.');
    let result: OutlineResult;
    if (values.fixture) {
        const fixture = JSON.parse(await readFile(values.fixture, 'utf8'));
        if (!fixture || typeof fixture.sourceUrl !== 'string' || !fixture.response ||
            (fixture.retrievedAt !== undefined && (typeof fixture.retrievedAt !== 'string' || !Number.isFinite(Date.parse(fixture.retrievedAt))))) {
            throw new Error('Fixture must contain sourceUrl, response, and an optional valid retrievedAt timestamp.');
        }
        result = parseOutlineResponse(fixture.response, parseOutlineUrl(fixture.sourceUrl), { retrievedAt: fixture.retrievedAt });
    } else {
        result = await fetchCourseOutline(values.url!);
    }
    if (values.json) console.log(JSON.stringify(result, null, 2));
    else printResult(result);
}

main().catch(error => {
    console.error(`${error instanceof OutlineError ? error.code : 'ERROR'}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
