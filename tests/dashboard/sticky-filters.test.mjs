import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  stickyFiltersEnabled,
  setStickyFiltersEnabled,
  STICKY_FILTERS_STORAGE_KEY,
} from '../../dashboard/js/utils/sticky-filters.js';

function installSessionStorageMock() {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  return () => {
    delete globalThis.sessionStorage;
  };
}

describe('sticky filters session', () => {
  let teardown;

  beforeEach(() => {
    teardown = installSessionStorageMock();
    sessionStorage.removeItem(STICKY_FILTERS_STORAGE_KEY);
  });

  afterEach(() => {
    teardown?.();
  });

  it('default desligado', () => {
    assert.equal(stickyFiltersEnabled(), false);
  });

  it('persiste quando ligado', () => {
    setStickyFiltersEnabled(true);
    assert.equal(stickyFiltersEnabled(), true);
    assert.equal(sessionStorage.getItem(STICKY_FILTERS_STORAGE_KEY), '1');
  });

  it('persiste quando desligado', () => {
    setStickyFiltersEnabled(true);
    setStickyFiltersEnabled(false);
    assert.equal(stickyFiltersEnabled(), false);
  });
});
