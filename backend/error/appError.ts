import { ErrorType } from "./errors";

class AppError extends Error {
    errorCode: string;
    isOperational: boolean;
    
    constructor(message: string, errorCode: ErrorType) {
        super(message);
        this.errorCode = errorCode;
        this.isOperational = true;
    }
}

export default AppError;