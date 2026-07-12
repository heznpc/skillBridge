/**
 * SkillBridge runtime build configuration.
 *
 * Source/raw builds keep the optional AI gateway. The CWS builder replaces
 * this file in dist and also pins the same flag at the start of content.bundle
 * so the upload artifact cannot load the Puter/page-world bridge.
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
