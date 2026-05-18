import fs from 'fs';

import { DB } from './types/GeneralTypes';
import AppError from './error/appError';
import { ERRORS } from './error/errors';

const DB_PATH = 'data/DB.json';

// Global state cache
let cachedDB: DB | null = null;
let intervalID: NodeJS.Timeout | null = null;

export function initializeDB(): DB {
    // Ensure the data directory exists
    if (!fs.existsSync('data')) {
        fs.mkdirSync('data', { recursive: true });
    }

    // 1. Check if the file exists
    if (!fs.existsSync(DB_PATH)) {
        console.log("DB not found. Initializing new database...");
        
        // 2. Create the starting structure
        const initialData: DB = {
            users: {},
            sessions: {}
        };

        // 3. Write it to the file
        
        fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2));
        
        // 4. Initialize the cache
        cachedDB = initialData;
        return initialData;
    }

    // 5. If it exists, just read and return it
    const fileContent = fs.readFileSync(DB_PATH, 'utf-8');
    const dbData = JSON.parse(fileContent);
    
    // 6. Initialize the cache
    cachedDB = dbData;

    if (!intervalID) {
        intervalID = setInterval(() => {
            if (cachedDB !== null) {
                writeToDisk(cachedDB);
            }
        }, 5000); // Save every 5 seconds
    }

    return dbData;
}

export function readDB(): DB {
    if (cachedDB === null) {
        throw new AppError('Database not initialized. Call initializeDB() first.', ERRORS.DATABASE_READ_ERROR);
    }
    return cachedDB;
}

export function writeDB(db: DB): void {
    cachedDB = db;
}

function writeToDisk(db: DB): void {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    } catch (error) {
        throw new AppError('Failed to write to database', ERRORS.DATABASE_WRITE_ERROR);
    }
}  