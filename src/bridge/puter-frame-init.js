'use strict';

// Puter 2.2.11 has wildcard window-message handlers (including `puter.token`)
// that do not consistently check event.origin. This frame's application data
// uses runtime.Port, so the only legitimate window messages are from the exact
// Puter consent origin or this extension origin. Block everything else in
// capture phase before any SDK bubble listener can observe it.
const PUTER_WINDOW_MESSAGE_ORIGINS = new Set([globalThis.location.origin, 'https://puter.com']);
globalThis.addEventListener(
  'message',
  (event) => {
    if (PUTER_WINDOW_MESSAGE_ORIGINS.has(event.origin)) return;
    event.stopImmediatePropagation();
    event.preventDefault();
  },
  true,
);

// Pin before the vendored SDK evaluates. The host page cannot read or mutate
// this extension-origin global, and non-configurable properties prevent later
// SDK/plugin code from redirecting authenticated requests or the sign-in UI.
for (const [name, value] of Object.entries({
  PUTER_API_ORIGIN: 'https://api.puter.com',
  PUTER_ORIGIN: 'https://puter.com',
})) {
  Object.defineProperty(globalThis, name, {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  });
}
