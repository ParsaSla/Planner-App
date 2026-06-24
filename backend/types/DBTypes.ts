export interface UserRow {
    uid: string;
    username: string;
    password_hash: string;
    salt: string;
    created_at: string;
    last_login?: string;
}

export interface SessionRow {
    sid: string;
    uid: string;
    expires: string;
}


export interface CourseRow {
    id: string;
    uid: string;
    course_name: string;
    course_code?: string;
    color_code?: string;
    created_at: string;
}

export interface SettingsRow {
    uid: string;
    teaching_period_weeks: number;
    term_weeks: number;
    term_system: string;
    flex_week: number;
    updated_at: string;
}

export interface SettingsTermDateRow {
    uid: string;
    term_index: number;
    day: number;
    month: number;
}

// TASKS AND EVENTS
export interface TaskRow {
    id: string;
    uid: string;
    course_id?: string;
    title: string;
    description?: string;
    type: string;
    date?: string;
    completed: number;
    created_at: string;
    updated_at?: string;
}

export interface RecurringTaskRow {
    id: string;
    uid: string;
    course_id?: string;
    title: string;
    description?: string;
    days_of_week?: string;
    time_hour?: number;
    time_minute?: number;
    active: number;
    created_at: string;
    updated_at?: string;
}

export interface EventRow {
    id: string;
    uid: string;
    course_id?: string;
    title: string;
    description?: string;
    start_time: string;
    end_time: string;
    completed: number;
    created_at: string;
    updated_at?: string;
}

export interface RecurringEventRow {
    id: string;
    uid: string;
    course_id?: string;
    title: string;
    description?: string;
    days_of_week?: string;
    start_hour?: number;
    start_minute?: number;
    end_hour?: number;
    end_minute?: number;
    active: number;
    created_at: string;
    updated_at?: string;
}
