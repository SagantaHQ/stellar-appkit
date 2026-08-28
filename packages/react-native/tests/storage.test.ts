import { test, expect, describe } from 'bun:test';
import { createAsyncStorage, createMemoryStorage } from '../src/storage.js';

function mockAsyncStorage() {
  const map = new Map<string, string>();
  return {
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
  };
}

describe('createAsyncStorage', () => {
  test('implements the ConnectStorage contract with async semantics', async () => {
    const storage = createAsyncStorage(mockAsyncStorage());
    expect(await storage.getItem('k')).toBeNull();
    await storage.setItem('k', '{"v":1}');
    expect(await storage.getItem('k')).toBe('{"v":1}');
    await storage.removeItem('k');
    expect(await storage.getItem('k')).toBeNull();
  });
});

describe('createMemoryStorage', () => {
  test('round-trips values in memory', async () => {
    const storage = createMemoryStorage();
    await storage.setItem('session', 'abc');
    expect(await storage.getItem('session')).toBe('abc');
    await storage.removeItem('session');
    expect(await storage.getItem('session')).toBeNull();
  });
});
