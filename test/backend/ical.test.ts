import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, closeDB } from '../../backend/dbManager';
import { register } from '../../backend/auth';
import { detectCourse, detectCourseFrom, parseICSToEvents, normalizeICalUrl } from '../../backend/ical';
import { commitICalImport, getEvents, getCourses, CourseDecision } from '../../backend/API';
import { TASKS, OneTimeEvent } from '../../backend/types/TaskTypes';

// A small calendar exercising: a recurring class expanded into occurrences, a
// standalone dated event with a fuller DESCRIPTION, an event with no course code,
// and a zero-length marker that should be dropped.
const SAMPLE_ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//Timetable//EN',
    'BEGIN:VEVENT',
    'UID:comp1010-lecture@uni',
    'SUMMARY:COMP1010 Introduction to Programming (Lecture)',
    'DTSTART:20260302T090000',
    'DTEND:20260302T103000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4',
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

describe('backend/ical detectCourse', () => {
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

describe('backend/ical normalizeICalUrl', () => {
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

describe('backend/ical parseICSToEvents', () => {
    it('expands a recurring event into dated one-time occurrences', () => {
        const events = parseICSToEvents(SAMPLE_ICS);
        const lecture = events.filter(e => e.sourceUid === 'comp1010-lecture@uni');
        expect(lecture.length).toBe(4); // BYDAY=MO,WE COUNT=4
        expect(lecture.every(e => !!e.start && !!e.end)).toBe(true);
        expect(lecture.every(e => e.detectedCode === 'COMP1010')).toBe(true);
        expect(lecture[0].detectedName).toBe('Introduction to Programming');
    });

    it('keeps a non-recurring event as a single dated occurrence with an ISO span', () => {
        const events = parseICSToEvents(SAMPLE_ICS);
        const exam = events.filter(e => e.sourceUid === 'math1001-midterm@uni');
        expect(exam.length).toBe(1);
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
    });
});

describe('backend/API commitICalImport', () => {
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

    it('creates courses and one-time events, categorised by course', () => {
        const uid = register('icaluser', 'Password123');
        const events = parseICSToEvents(SAMPLE_ICS);

        const result = commitICalImport(uid, 'https://example.com/cal.ics', decisionsFor(), events);
        expect(result.importedEvents).toBe(6); // 4 lecture occurrences + exam + chess
        expect(result.createdCourses).toBe(3);

        const courses = getCourses(uid);
        expect(courses.map(c => c.code).sort()).toEqual(['COMP1010', 'MATH1001', undefined]);

        const stored = getEvents(uid);
        expect(stored.length).toBe(6);
        expect(stored.every(e => e.type === TASKS.ONE_TIME)).toBe(true);

        const comp = courses.find(c => c.code === 'COMP1010')!;
        const lectureEvents = (stored as OneTimeEvent[]).filter(e => e.course_id === comp.id);
        expect(lectureEvents.length).toBe(4);
    });

    it('skips excluded course groups', () => {
        const uid = register('icaluser2', 'Password123');
        const events = parseICSToEvents(SAMPLE_ICS);
        const decisions = decisionsFor().map(d =>
            d.key === 'UNCATEGORISED' ? { ...d, include: false } : d
        );

        const result = commitICalImport(uid, 'https://example.com/cal.ics', decisions, events);
        expect(result.importedEvents).toBe(5);
        expect(result.skipped).toBe(1);
    });

    it('de-duplicates on re-import by source UID + start', () => {
        const uid = register('icaluser3', 'Password123');
        const events = parseICSToEvents(SAMPLE_ICS);

        commitICalImport(uid, 'https://example.com/cal.ics', decisionsFor(), events);

        // A real re-import matches existing courses (preview sets courseId); mirror that.
        const courses = getCourses(uid);
        const reDecisions: CourseDecision[] = decisionsFor().map(d => {
            const match = courses.find(c => (c.code ?? undefined) === (d.code ?? undefined) && !!d.code);
            return match ? { ...d, courseId: match.id } : d;
        });

        const second = commitICalImport(uid, 'https://example.com/cal.ics', reDecisions, events);
        expect(second.importedEvents).toBe(0);
        expect(second.skipped).toBe(6);
        expect(getEvents(uid).length).toBe(6);
    });
});
