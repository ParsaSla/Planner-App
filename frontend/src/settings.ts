import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** A semester system has 2 terms per year; a trimester system has 3. */
export type TermSystem = 'SEMESTER' | 'TRIMESTER';

/** A day/month within the academic year (year is intentionally omitted). 0 = unset. */
export interface TermDate {
  day: number;
  month: number;
}

/** The start and end date of a single term. */
export interface TermPeriod {
  start: TermDate;
  end: TermDate;
}

export interface UniversitySettings {
  /** Number of terms per year. */
  termSystem: TermSystem;
  /** Start/end date of each term. Index 0 = Term 1, etc. */
  termDates: TermPeriod[];
  /** Which teaching week is the flex (non-teaching) week, e.g. 5 or 6. */
  flexWeek: number;
}

export const EMPTY_TERM_DATE: TermDate = { day: 0, month: 0 };
export const EMPTY_TERM_PERIOD: TermPeriod = {
  start: { ...EMPTY_TERM_DATE },
  end: { ...EMPTY_TERM_DATE },
};

export interface Settings {
  university: UniversitySettings;
  /** Saved iCal timetable subscription URL, if the user has imported one. */
  icalUrl?: string;
}

export const termCount = (system: TermSystem) => (system === 'TRIMESTER' ? 3 : 2);

export const DEFAULT_SETTINGS: Settings = {
  university: {
    termSystem: 'SEMESTER',
    termDates: [{ ...EMPTY_TERM_PERIOD }, { ...EMPTY_TERM_PERIOD }],
    flexWeek: 6,
  },
};

export interface SettingsStore {
  settings: Settings;
  loading: boolean;
  /** Persists to the backend, then updates local state. Rejects if the save fails. */
  saveUniversity: (university: UniversitySettings) => Promise<void>;
}

export function useSettings(): SettingsStore {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .getSettings()
      .then((s) => {
        if (active) {
          setSettings({
            university: { ...DEFAULT_SETTINGS.university, ...s.university },
            icalUrl: s.icalUrl,
          });
        }
      })
      .catch(() => {
        /* Keep defaults if the load fails. */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const saveUniversity = useCallback(async (university: UniversitySettings) => {
    await api.saveSettings({ university });
    setSettings((cur) => ({ ...cur, university }));
  }, []);

  return { settings, loading, saveUniversity };
}
