// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock environment variables for tests
process.env.NEXT_PUBLIC_API_URL = 'https://api.swapwatch.app';
process.env.NEXT_PUBLIC_WS_URL = 'wss://api.swapwatch.app';

// Import TextEncoder/TextDecoder from util for Node.js environment
const { TextEncoder, TextDecoder } = require('util');

// Mock Web APIs that may not be available in test environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock crypto.subtle if not available
if (typeof global.crypto === 'undefined') {
  global.crypto = {
    subtle: {
      digest: jest.fn(),
      sign: jest.fn(),
      verify: jest.fn(),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
    },
    getRandomValues: jest.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
  };
}

// Mock fetch if not available
if (typeof global.fetch === 'undefined') {
  global.fetch = jest.fn();
}

// Mock WebSocket if not available
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = jest.fn().mockImplementation(() => ({
    send: jest.fn(),
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    readyState: 0,
  }));
}