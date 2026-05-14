import AppError from "./appError";

export const ERRORS = {
    DATABASE_READ_ERROR: 'DATABASE_READ_ERROR',
    DATABASE_WRITE_ERROR: 'DATABASE_WRITE_ERROR',
    USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    TASK_NOT_FOUND: 'TASK_NOT_FOUND',
};
export type ErrorType = typeof ERRORS[keyof typeof ERRORS];

export const STATUS_CODES = {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
};
export type StatusCode = typeof STATUS_CODES[keyof typeof STATUS_CODES];

const HttpMap = {
    [ERRORS.DATABASE_READ_ERROR]: 500,
    [ERRORS.DATABASE_WRITE_ERROR]: 500,
    [ERRORS.USER_ALREADY_EXISTS]: 400,
    [ERRORS.INVALID_CREDENTIALS]: 401,
    [ERRORS.TASK_NOT_FOUND]: 404,

};

export function getStatusCode(appError: AppError): number {
    return HttpMap[appError.errorCode] || 500;
}