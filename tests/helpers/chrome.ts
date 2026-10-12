type Change = Record<string, chrome.storage.StorageChange>;

export interface Stub {
  store: Map<string, unknown>;
  listeners: ((changes: Change, area: string) => void)[];
}

export function installChromeStub(): Stub {
  const stub: Stub = { store: new Map(), listeners: [] };
  const area = {
    get: async (keys?: unknown) => {
      if (keys === undefined || keys === null) return Object.fromEntries(stub.store);
      if (typeof keys === 'string') {
        return stub.store.has(keys) ? { [keys]: stub.store.get(keys) } : {};
      }
      if (Array.isArray(keys)) {
        return Object.fromEntries(
          keys
            .map((k) => [k, stub.store.get(k)])
            .filter(([, v]) => v !== undefined)
        );
      }
      if (typeof keys === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(keys as Record<string, unknown>)) {
          out[k] = stub.store.has(k) ? stub.store.get(k) : v;
        }
        return out;
      }
      return {};
    },
    set: async (obj: Record<string, unknown>) => {
      const changes: Change = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: stub.store.get(k), newValue: v };
        stub.store.set(k, v);
      }
      stub.listeners.forEach((l) => l(changes, 'local'));
    },
  };
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: area,
      onChanged: {
        addListener: (l: Stub['listeners'][number]) => stub.listeners.push(l),
        removeListener: (l: Stub['listeners'][number]) => {
          const i = stub.listeners.indexOf(l);
          if (i >= 0) stub.listeners.splice(i, 1);
        },
      },
    },
  };
  return stub;
}
