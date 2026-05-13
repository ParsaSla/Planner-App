import AppError from "./errors";
import ErrorCodes from "./errorCodes";

const HttpMap = {
    [ErrorCodes.USER_NOT_FOUND]: 404,
    [ErrorCodes.INVALID_CREDENTIALS]: 401,
    [ErrorCodes.SERVER_ERROR]: 500
};

function getStatusCode(appError: AppError): number {
    return HttpMap[appError.errorCode] || 500;
}

export default HttpMap;