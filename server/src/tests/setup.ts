/**
 * Jest Test Setup
 *
 * This file runs before all tests to set up the test environment.
 */

import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Set test environment variables - use existing database
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jwt-token-generation';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'appdb';
process.env.DB_USER = process.env.DB_USER || 'app';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  // Uncomment to silence console.log during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Increase timeout for database operations
jest.setTimeout(15000);
