import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, closeDB } from '../../backend/db/connection';
import { register } from '../../backend/auth';
import { detectCourse, detectCourseFrom, parseICSToEvents, normalizeICalUrl } from '../../backend/api/ical';
import { commitICalImport, CourseDecision } from '../../backend/api/ical';
import { getItemsByUID } from '../../backend/db/items';
import { getCoursesByUID } from '../../backend/db/courses';

// A small calendar exercising: a recurring class (kept as one series with its RRULE +
// an EXDATE term break), a standalone dated event with a fuller DESCRIPTION, an event
// with no course code, and a zero-length marker kept as a point-in-time event.
const SAMPLE_ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Timetable//EN',
    'BEGIN:VEVENT',
    'UID:comp1010-lecture@uni',
    'SUMMARY:COMP1010 Introduction to Programming (Lecture)',
    'DTSTART:20260302T090000',
    'DTEND:20260302T103000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260330T090000',
    'EXDATE:20260309T090000',
    'LOCATION:Room 1',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:math1001-midterm@uni',
    'SUMMARY:MATH1001 Midterm',
    'DESCRIPTION:MATH1001 Linear Algebra Exam',
    'DTSTART:20260410T233000Z',
    'DTEND:20260411T013000Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:chess@uni',
    'SUMMARY:Chess Club',
    'DTSTART:20260305T180000',
    'DTEND:20260305T190000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:marker@uni',
    'SUMMARY:Start of Term',
    'DTSTART:20260301T090000',
    'DTEND:20260301T090000',
    'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n');

describe('backend/api/ical detectCourse', () => {
    it('extracts a course code and a friendly name', () => {
        expect(detectCourse('COMP1010 Introduction to Programming')).toEqual({
            code: 'COMP1010',
            name: 'Introduction to Programming',
        });
    });

    it('normalises spaced/hyphenated codes', () => {
        expect(detectCourse('MATH 1001 - Lecture').code).toBe('MATH1001');
        expect(detectCourse('CS201 Tutorial').code).toBe('CS201');
    });

    it('returns no code but keeps the name when none is present', () => {
        expect(detectCourse('Chess Club')).toEqual({ name: 'Chess Club' });
    });

    it('prefers the description for a clean course name, cutting at the class type', () => {
        expect(detectCourseFrom('MATH1081 Lecture', 'MATH1081 Discrete Mathematics Lecture A')).toEqual({
            code: 'MATH1081',
            name: 'Discrete Mathematics',
        });
    });
});

describe('backend/api/ical normalizeICalUrl', () => {
    it('rewrites webcal:// to https://', () => {
        expect(normalizeICalUrl('webcal://my.unsw.edu.au/cal/x.ics')).toBe('https://my.unsw.edu.au/cal/x.ics');
        expect(normalizeICalUrl('WEBCAL://host/x.ics')).toBe('https://host/x.ics');
    });

    it('passes http(s) through and rejects other schemes', () => {
        expect(normalizeICalUrl('https://host/x.ics')).toBe('https://host/x.ics');
        expect(() => normalizeICalUrl('ftp://host/x.ics')).toThrow();
        expect(() => normalizeICalUrl('not a url')).toThrow();
    });
});

describe('backend/api/ical parseICSToEvents', () => {
    it('keeps a recurring event as ONE series carrying its raw RRULE + EXDATE', () => {
        const events = parseICSToEvents(SAMPLE_ICS);
        const lecture = events.filter(e => e.sourceUid === 'comp1010-lecture@uni');
        expect(lecture.length).toBe(1); // not expanded into occurrences
        expect(lecture[0].rrule).toContain('FREQ=WEEKLY');
        expect(lecture[0].exdate).toHaveLength(1); // the one term-break exclusion
        expect(lecture[0].detectedCode).toBe('COMP1010');
        expect(lecture[0].detectedName).toBe('Introduction to Programming');
    });

    it('keeps a non-recurring event as a single dated series with an ISO span', () => {
        const events = parseICSToEvents(SAMPLE_ICS);
        const exam = events.filter(e => e.sourceUid === 'math1001-midterm@uni');
        expect(exam.length).toBe(1);
        expect(exam[0].rrule).toBeUndefined();
        expect(exam[0].start).toBe('2026-04-10T23:30:00.000Z');
        expect(exam[0].end).toBe('2026-04-11T01:30:00.000Z');
        expect(exam[0].detectedCode).toBe('MATH1001');
        expect(exam[0].detectedName).toBe('Linear Algebra');
    });

    it('leaves events without a course code uncategorised', () => {
        const events = parseICSToEvents(SAMPLE_ICS);
        const chess = events.find(e => e.sourceUid === 'chess@uni');
        expect(chess!.detectedCode).toBeUndefined();
    });

    it('keeps zero-length marker events as point-in-time events', () => {
        const events = parseICSToEvents(SAMPLE_ICS);
        const marker = events.find(e => e.sourceUid === 'marker@uni');
        expect(marker).toBeDefined();
        expect(marker!.rrule).toBeUndefined();
        expect(marker!.start).toBe(marker!.end); // zero-length: a single point in time
        expect(events.length).toBe(4); // lecture series + exam + chess + marker
    });
});

// The app is timezone-aware: a zoned event is stored as its absolute UTC instant plus the
// IANA zone it was authored in, so recurrence and wall-clock stay correct across DST. An
// all-day (VALUE=DATE) event is zone-less and kept at UTC midnight of its calendar date.
describe('backend/api/ical parseICSToEvents timezones', () => {
    const TZ_ICS = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//EN',
        'BEGIN:VEVENT', 'UID:tz@x', 'SUMMARY:TZ Lecture',
        'DTSTART;TZID=Australia/Sydney:20260302T090000',
        'DTEND;TZID=Australia/Sydney:20260302T103000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260330T090000Z',
        'EXDATE;TZID=Australia/Sydney:20260309T090000',
        'END:VEVENT',
        'BEGIN:VEVENT', 'UID:allday@x', 'SUMMARY:Reading Week',
        'DTSTART;VALUE=DATE:20260713', 'DTEND;VALUE=DATE:20260714',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');

    const originalTZ = process.env.TZ;
    beforeEach(() => { process.env.TZ = 'Australia/Sydney'; });
    afterEach(() => { process.env.TZ = originalTZ; });

    it('stores a zoned event as its absolute UTC instant plus its IANA zone', () => {
        const lecture = parseICSToEvents(TZ_ICS).find(e => e.sourceUid === 'tz@x')!;
        expect(lecture.start).toBe('2026-03-01T22:00:00.000Z'); // 9am Sydney (+11 DST) as a true instant
        expect(lecture.end).toBe('2026-03-01T23:30:00.000Z');
        expect(lecture.timezone).toBe('Australia/Sydney');
        // EXDATE resolved on the same absolute basis so day-level exclusion still matches.
        expect(lecture.exdate).toEqual(['2026-03-08T22:00:00.000Z']);
    });

    it('keeps an all-day event zone-less at UTC midnight of its calendar date', () => {
        const holiday = parseICSToEvents(TZ_ICS).find(e => e.sourceUid === 'allday@x')!;
        expect(holiday.start).toBe('2026-07-13T00:00:00.000Z');
        expect(holiday.end).toBe('2026-07-14T00:00:00.000Z');
        expect(holiday.allDay).toBe(true);
        expect(holiday.timezone).toBeUndefined();
    });
});

describe('backend/api/ical commitICalImport', () => {
    beforeEach(() => {
        closeDB();
        initializeDB(':memory:');
    });
    afterEach(() => {
        closeDB();
    });

    const decisionsFor = (): CourseDecision[] => [
        { key: 'COMP1010', include: true, name: 'Intro to Programming', code: 'COMP1010', color: '#6d8bff' },
        { key: 'MATH1001', include: true, name: 'Linear Algebra', code: 'MATH1001', color: '#ff7a90' },
        { key: 'UNCATEGORISED', include: true, name: 'Uncategorised', color: '#3ecf8e' },
    ];

    it('stores one row per VEVENT series, keeping the RRULE for recurring events', () => {
        const uid = register('icaluser', 'Password123');
        const events = parseICSToEvents(SAMPLE_ICS);

        const result = commitICalImport(uid, 'https://example.com/cal.ics', decisionsFor(), events);
        expect(result.importedEvents).toBe(4); // lecture series + exam + chess + marker (not expanded)
        expect(result.updated).toBe(0);
        expect(result.createdCourses).toBe(3); // chess + marker share the uncategorised group

        const courses = getCoursesByUID(uid);
        expect(courses.map(c => c.course_code).sort()).toEqual(['COMP1010', 'MATH1001', null]);

        const stored = getItemsByUID(uid);
        expect(stored.length).toBe(4);
        // Every imported row records its source VEVENT UID for stable re-import identity.
        expect(stored.every(r => !!r.ical_uid)).toBe(true);

        const lecture = stored.find(r => r.ical_uid === 'comp1010-lecture@uni')!;
        expect(lecture.recurrence).toBe('RECURRING');
        expect(lecture.rrule).toContain('FREQ=WEEKLY');
        expect(JSON.parse(lecture.exdate!)).toHaveLength(1);
        expect('days_of_week' in lecture).toBe(false); // column retired in favour of rrule

        const exam = stored.find(r => r.ical_uid === 'math1001-midterm@uni')!;
        expect(exam.recurrence).toBe('ONE_TIME');
        expect(exam.rrule).toBeNull();

        const comp = courses.find(c => c.course_code === 'COMP1010')!;
        expect(lecture.course_id).toBe(comp.id);
    });

    it('skips excluded course groups', () => {
        const uid = register('icaluser2', 'Password123');
        const events = parseICSToEvents(SAMPLE_ICS);
        const decisions = decisionsFor().map(d =>
            d.key === 'UNCATEGORISED' ? { ...d, include: false } : d
        );

        const result = commitICalImport(uid, 'https://example.com/cal.ics', decisions, events);
        expect(result.importedEvents).toBe(2); // lecture + exam; chess + marker (uncategorised) skipped
        expect(result.skipped).toBe(2);
    });

    it('refreshes existing rows in place on re-import (by iCal UID), not duplicating', () => {
        const uid = register('icaluser3', 'Password123');
        const events = parseICSToEvents(SAMPLE_ICS);

        commitICalImport(uid, 'https://example.com/cal.ics', decisionsFor(), events);

        // A real re-import matches existing courses (preview sets courseId); mirror that.
        const courses = getCoursesByUID(uid);
        const reDecisions: CourseDecision[] = decisionsFor().map(d => {
            const match = courses.find(c => (c.course_code ?? undefined) === (d.code ?? undefined) && !!d.code);
            return match ? { ...d, courseId: match.id } : d;
        });

        // The lecture moved room + was renamed upstream — the same UID should update in place.
        const moved = events.map(e =>
            e.sourceUid === 'comp1010-lecture@uni'
                ? { ...e, summary: 'COMP1010 Introduction to Programming (Lecture) — Room 2', location: 'Room 2' }
                : e
        );

        const second = commitICalImport(uid, 'https://example.com/cal.ics', reDecisions, moved);
        expect(second.importedEvents).toBe(0);
        expect(second.updated).toBe(4);
        expect(second.createdCourses).toBe(0);

        const stored = getItemsByUID(uid);
        expect(stored.length).toBe(4); // no duplicates
        const lecture = stored.find(r => r.ical_uid === 'comp1010-lecture@uni')!;
        expect(lecture.location).toBe('Room 2'); // refreshed in place
    });
});
