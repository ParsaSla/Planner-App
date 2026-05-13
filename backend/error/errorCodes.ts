const ErrorCodes = {
    USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS",
    INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
    USER_NOT_FOUND: "USER_NOT_FOUND",
    SERVER_ERROR: "SERVER_ERROR"
};

type errorCodes = typeof ErrorCodes[keyof typeof ErrorCodes];

export default ErrorCodes;
export type { errorCodes };