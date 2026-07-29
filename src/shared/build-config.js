/**
 * SkillBridge runtime build configuration.
 *
 * Source/raw builds and the CWS bundle keep the user-invoked AI Tutor gateway.
 * The CWS builder replaces this file in dist and pins the same non-writable
 * value at the start of content.bundle so runtime code cannot override it.
 */
(function (root) {
  'use strict';
  if (typeof root.__SKILLBRIDGE_AI_GATEWAY_ENABLED__ === 'boolean') return;
  Object.defineProperty(root, '__SKILLBRIDGE_AI_GATEWAY_ENABLED__', {
    value: true,
    writable: false,
    configurable: false,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
