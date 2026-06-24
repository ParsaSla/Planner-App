// Barrel module: the database layer is split by domain under ./db.
// Re-exported here so callers can keep importing from './dbManager'.
export * from './db/connection';
export * from './db/users';
export * from './db/tasks';
export * from './db/events';
export * from './db/courses';
export * from './db/settings';
