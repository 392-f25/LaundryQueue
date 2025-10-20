import '@testing-library/jest-dom/vitest'

// Provide a lightweight mock for the Realtime firebase client during tests.
import { vi } from 'vitest';
// Mock the firebaseRealtime module used by the app with an in-memory implementation
const MOCK_PATH = './src/test/mocks/firebaseRealtime.mock';
try {
  vi.mock('src/utilities/firebaseRealtime', async () => await import(MOCK_PATH));
} catch (e) {
  // ignore
}
try {
  vi.mock('/src/utilities/firebaseRealtime', async () => await import(MOCK_PATH));
} catch (e) {
  // ignore
}

if (!Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')) {
  Object.defineProperty(ArrayBuffer.prototype, 'resizable', {
    configurable: true,
    enumerable: false,
    get() {
      return false;
    },
  });
}

if (typeof globalThis.SharedArrayBuffer === 'undefined') {
  const SharedArrayBufferMock = function SharedArrayBufferMock() {
    throw new Error('SharedArrayBuffer is not available in this environment.');
  } as unknown as typeof SharedArrayBuffer;

  Object.defineProperty(SharedArrayBufferMock, 'prototype', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: {},
  });

  Object.defineProperty(SharedArrayBufferMock.prototype, 'growable', {
    configurable: true,
    enumerable: false,
    get() {
      return false;
    },
  });

  globalThis.SharedArrayBuffer = SharedArrayBufferMock;
} else if (!Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'growable')) {
  Object.defineProperty(SharedArrayBuffer.prototype, 'growable', {
    configurable: true,
    enumerable: false,
    get() {
      return false;
    },
  });
}
