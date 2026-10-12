import { JSDOM } from 'jsdom';

/**
 * 挂一套 jsdom 到 globalThis，供 UI 测试使用。
 * 统一挂上 jsdom 自己的构造器（KeyboardEvent/MouseEvent/Event），
 * 否则测试里 `new KeyboardEvent(...)` 用的是 Node 全局构造器，dispatch 到 jsdom 节点不生效。
 */
export function setupDom(): void {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.local/',
  });
  const { window } = dom;
  const g = globalThis as Record<string, unknown>;
  g.window = window;
  g.document = window.document;
  g.HTMLElement = window.HTMLElement;
  g.HTMLInputElement = window.HTMLInputElement;
  g.HTMLSelectElement = window.HTMLSelectElement;
  g.Element = window.Element;
  g.Node = window.Node;
  g.KeyboardEvent = window.KeyboardEvent;
  g.MouseEvent = window.MouseEvent;
  g.Event = window.Event;
  g.customElements = window.customElements;
  g.getComputedStyle = window.getComputedStyle;
  window.matchMedia =
    window.matchMedia ??
    ((() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia);
  g.matchMedia = window.matchMedia;
}
