import '@testing-library/jest-dom/vitest'

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

  // @ts-expect-error: provide minimal stub for tests
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
