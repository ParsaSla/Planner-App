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
    const uid = register('TestUser', 'securePassword1');
    expect(uid).toBeTruthy();

    const sid = login('testuser', 'securePassword1');
    expect(sid).toBeTruthy();

    const validatedUid = validateSession(sid);
    expect(validatedUid).toBe(uid);
  });

  it('rejects duplicate user registration and invalid credentials', () => {
    register('duplicate', 'Password1');
    expect(() => register('duplicate', 'Password1')).toThrow(AppError);
    expect(() => login('duplicate', 'wrongPassword1')).toThrow(AppError);
    expect(() => login('missing', 'Password1')).toThrow(AppError);
  });

  it('rejects registration with a password that breaks the rules', () => {
    expect(() => register('weakshort', 'Ab1')).toThrow(AppError); // too short
    expect(() => register('weaknoupper', 'password1')).toThrow(AppError); // no uppercase
    expect(() => register('weaknonumber', 'Password')).toThrow(AppError); // no number
    expect(() => register('weaknolower', 'PASSWORD1')).toThrow(AppError); // no lowercase
  });

  it('deletes a session and invalidates it', () => {
    const uid = register('sessionuser', 'Password1');
    const sid = login('sessionuser', 'Password1');
    expect(validateSession(sid)).toBe(uid);

    deleteSession(sid);
    expect(() => validateSession(sid)).toThrow(AppError);
  });
});
