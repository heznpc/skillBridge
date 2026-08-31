/**
 * @jest-environment jsdom
 */

/* global describe, test, expect, beforeEach, afterEach, jest */

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'banners.js'), 'utf8');

const offlineLabels = {
  unknown: { en: 'unknown-en', ko: 'unknown-ko' },
  cacheOnly: { en: 'cache-en', ko: 'cache-ko' },
  partial: { en: 'partial-en', ko: 'partial-ko' },
  missOnly: { en: 'miss-en', ko: 'miss-ko' },
};
const unavailableLabels = { en: 'service-en', ko: 'service-ko' };

let isOffline;
let currentLang;

function dispatchCoverage(detail) {
  document.dispatchEvent(new CustomEvent('skillbridge:offlinecoverage', { detail }));
}

function loadBanners() {
  window._sb = {
    get isOffline() {
      return isOffline;
    },
    get currentLang() {
      return currentLang;
    },
    t: (labels) => labels[currentLang] || labels.en,
    registerModule: jest.fn(),
  };

  new Function('window', 'document', 'navigator', 'OFFLINE_LABELS', 'TRANSLATION_UNAVAILABLE_LABELS', source)(
    window,
    document,
    navigator,
    offlineLabels,
    unavailableLabels,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = '';
  isOffline = true;
  currentLang = 'en';
  global.requestAnimationFrame = (callback) => callback();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  delete global.requestAnimationFrame;
  delete window._sb;
});

describe('persistent offline banner', () => {
  test('is visible at offline startup even when English is selected', () => {
    loadBanners();

    const banner = document.getElementById('si18n-offline-banner');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toBe('unknown-en');
    expect(banner.dataset.status).toBe('unknown');
    expect(banner.classList.contains('visible')).toBe(true);
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');
  });

  test('updates cache-only, partial, miss-only, and generation-reset states', () => {
    loadBanners();

    dispatchCoverage({ generation: 1, hasCached: true, hasMissing: false });
    expect(document.getElementById('si18n-offline-banner').dataset.status).toBe('cacheOnly');
    expect(document.getElementById('si18n-offline-banner').textContent).toBe('cache-en');

    dispatchCoverage({ generation: 1, hasCached: false, hasMissing: true });
    expect(document.getElementById('si18n-offline-banner').dataset.status).toBe('partial');
    expect(document.getElementById('si18n-offline-banner').textContent).toBe('partial-en');

    dispatchCoverage({ generation: 2, hasCached: false, hasMissing: false });
    expect(document.getElementById('si18n-offline-banner').dataset.status).toBe('unknown');

    dispatchCoverage({ generation: 2, hasCached: false, hasMissing: true });
    expect(document.getElementById('si18n-offline-banner').dataset.status).toBe('missOnly');
    expect(document.getElementById('si18n-offline-banner').textContent).toBe('miss-en');

    dispatchCoverage({ generation: 1, hasCached: true, hasMissing: false });
    expect(document.getElementById('si18n-offline-banner').dataset.status).toBe('missOnly');
  });

  test('refreshes the existing banner in the newly selected language', () => {
    loadBanners();

    dispatchCoverage({ generation: 1, hasCached: true, hasMissing: false });
    currentLang = 'ko';
    window._sb.refreshOfflineBanner();

    expect(document.getElementById('si18n-offline-banner').textContent).toBe('cache-ko');
  });

  test('survives a quick offline rebound and is removed cleanly online', () => {
    loadBanners();

    isOffline = false;
    window.dispatchEvent(new window.Event('online'));
    expect(document.getElementById('si18n-offline-banner').classList.contains('visible')).toBe(false);

    isOffline = true;
    window.dispatchEvent(new window.Event('offline'));
    jest.advanceTimersByTime(300);
    expect(document.getElementById('si18n-offline-banner')).not.toBeNull();

    isOffline = false;
    window.dispatchEvent(new window.Event('online'));
    jest.advanceTimersByTime(300);
    expect(document.getElementById('si18n-offline-banner')).toBeNull();
  });
});

describe('translation service status banner', () => {
  test('shows while online without falsely claiming the browser is offline', () => {
    isOffline = false;
    loadBanners();

    document.dispatchEvent(new CustomEvent('skillbridge:translationunavailable'));

    const banner = document.getElementById('si18n-offline-banner');
    expect(banner.dataset.status).toBe('translationUnavailable');
    expect(banner.textContent).toBe('service-en');
  });

  test('an online event keeps a service failure until GT confirms recovery', () => {
    isOffline = false;
    loadBanners();
    document.dispatchEvent(new CustomEvent('skillbridge:translationunavailable'));

    // content.js registers first and schedules its generic offline banner hide;
    // banners.js must cancel that removal when the backend is still unavailable.
    window._sb.hideOfflineBanner();
    window.dispatchEvent(new window.Event('online'));
    jest.advanceTimersByTime(300);

    expect(document.getElementById('si18n-offline-banner')?.dataset.status).toBe('translationUnavailable');

    document.dispatchEvent(new CustomEvent('skillbridge:translationavailable'));
    jest.advanceTimersByTime(300);

    expect(document.getElementById('si18n-offline-banner')).toBeNull();
  });

  test('translationavailable clears online but retains offline coverage wording', () => {
    isOffline = false;
    loadBanners();
    document.dispatchEvent(new CustomEvent('skillbridge:translationunavailable'));
    document.dispatchEvent(new CustomEvent('skillbridge:translationavailable'));
    jest.advanceTimersByTime(300);
    expect(document.getElementById('si18n-offline-banner')).toBeNull();

    isOffline = true;
    window.dispatchEvent(new window.Event('offline'));
    dispatchCoverage({ generation: 3, hasCached: true, hasMissing: false });
    document.dispatchEvent(new CustomEvent('skillbridge:translationunavailable'));
    document.dispatchEvent(new CustomEvent('skillbridge:translationavailable'));

    const banner = document.getElementById('si18n-offline-banner');
    expect(banner.dataset.status).toBe('cacheOnly');
    expect(banner.textContent).toBe('cache-en');
  });
});
