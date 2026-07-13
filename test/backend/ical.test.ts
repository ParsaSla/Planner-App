import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, closeDB } from '../../backend/db/connection';
import { register } from '../../backend/auth';
import { detectCourse, detectCourseFrom, parseICSToEvents, normalizeICalUrl } from '../../backend/api/ical';
import { commitICalImport, CourseDecision } from '../../backend/api/ical';
import { getItemsByUID } from '../../backend/db/items';
import { getCoursesByUID } from '../../backend/db/courses';

// A small calendar exercising: a recurring class (kept as one series with its RRULE +
// an EXDATE term break), a standalone dated event with a fuller DESCRIPTION, an event
// with no course code, and a zero-length marker that should be dropped.
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

    it('drops zero-length marker events', () => {
        const events = parseICSToEvents(SAMPLE_ICS);
        expect(events.some(e => e.sourceUid === 'marker@uni')).toBe(false);
        expect(events.length).toBe(3); // lecture series + exam + chess
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
        expect(result.importedEvents).toBe(3); // lecture series + exam + chess (not expanded)
        expect(result.updated).toBe(0);
        expect(result.createdCourses).toBe(3);

        const courses = getCoursesByUID(uid);
        expect(courses.map(c => c.course_code).sort()).toEqual(['COMP1010', 'MATH1001', null]);

        const stored = getItemsByUID(uid);
        expect(stored.length).toBe(3);
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
        expect(result.importedEvents).toBe(2); // lecture + exam; chess (uncategorised) skipped
        expect(result.skipped).toBe(1);
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
        expect(second.updated).toBe(3);
        expect(second.createdCourses).toBe(0);

        const stored = getItemsByUID(uid);
        expect(stored.length).toBe(3); // no duplicates
        const lecture = stored.find(r => r.ical_uid === 'comp1010-lecture@uni')!;
        expect(lecture.location).toBe('Room 2'); // refreshed in place
    });
});
