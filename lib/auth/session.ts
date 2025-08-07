import { compare, hash } from 'bcryptjs';

const SALT_ROUNDS = 10;

// Keep password utility functions for credentials provider
export async function hashPassword(password: string) {
  return hash(password, SALT_ROUNDS);
}

export async function comparePasswords(
  plainTextPassword: string,
  hashedPassword: string
) {
  return compare(plainTextPassword, hashedPassword);
}
