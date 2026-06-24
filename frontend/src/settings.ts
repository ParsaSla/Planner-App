import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** A semester system has 2 terms per year; a trimester system has 3. */
export type TermSystem = 'SEMESTER' | 'TRIMESTER';

/** A day/month within the academic year (year is intentionally omitted). 0 = unset. */
export interface TermDate {
  day: number;
  month: number;
}

export interface UniversitySettings {
  /** Length of a teaching period, in weeks. */
  teachingPeriodWeeks: number;
  /** Length of a full term, in weeks. */
  termWeeks: number;
  /** Number of terms per year. */
  termSystem: TermSystem;
  /** Day/month each term begins. Index 0 = Term 1, etc. */
  termStartDates: TermDate[];
  /** Which teaching week is the flex (non-teaching) week, e.g. 5 or 6. */
  flexWeek: number;
}

export const EMPTY_TERM_DATE: TermDate = { day: 0, month: 0 };

export interface Settings {
  university: UniversitySettings;
}

export const termCount = (system: TermSystem) => (system === 'TRIMESTER' ? 3 : 2);

export const DEFAULT_SETTINGS: Settings = {
  university: {
    teachingPeriodWeeks: 12,
    termWeeks: 13,
    termSystem: 'SEMESTER',
    termStartDates: [{ ...EMPTY_TERM_DATE }, { ...EMPTY_TERM_DATE }],
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
          setSettings({ university: { ...DEFAULT_SETTINGS.university, ...s.university } });
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
