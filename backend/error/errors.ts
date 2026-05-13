import { errorCodes } from "./errorCodes";

class AppError extends Error {
    errorCode: string;
    isOperational: boolean;
    
    constructor(message: string, errorCode: errorCodes) {
        super(message);
        this.errorCode = errorCode;
        this.isOperational = true;
    }
}

export default AppError;