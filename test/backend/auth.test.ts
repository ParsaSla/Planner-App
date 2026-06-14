import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeDB, closeDB } from '../../backend/dbManager';
import { register, login, validateSession, deleteSession } from '../../backend/auth';
import AppError from '../../backend/error/appError';

describe('backend/auth', () => {
  beforeEach(() => {
    closeDB();
    initializeDB(':memory:');
  });

  afterEach(() => {
    closeDB();
  });

  it('registers a new user and allows login', () => {
    const uid = register('TestUser', 'securePassword');
    expect(uid).toBeTruthy();

    const sid = login('testuser', 'securePassword');
    expect(sid).toBeTruthy();

    const validatedUid = validateSession(sid);
    expect(validatedUid).toBe(uid);
  });

  it('rejects duplicate user registration and invalid credentials', () => {
    register('duplicate', 'password');
    expect(() => register('duplicate', 'password')).toThrow(AppError);
    expect(() => login('duplicate', 'wrongpassword')).toThrow(AppError);
    expect(() => login('missing', 'password')).toThrow(AppError);
  });

  it('deletes a session and invalidates it', () => {
    const uid = register('sessionuser', 'password');
    const sid = login('sessionuser', 'password');
    expect(validateSession(sid)).toBe(uid);

    deleteSession(sid);
    expect(() => validateSession(sid)).toThrow(AppError);
  });
});
