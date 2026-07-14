const FOCUS_COLUMN_CSS = `
  html, body { background: #f1f3f5 !important; }
  body { overflow-x: hidden !important; }
  .site-header {
    position: relative !important;
    height: 100px !important;
    padding: 38px 42px 14px !important;
  }
  .site-header .logo { gap: 12px !important; font-size: 20px !important; }
  .site-header .logo .dot { width: 28px !important; height: 28px !important; }
  #header-right { gap: 0 !important; margin-right: 108px !important; }
  .header-links-container, #si18n-dark-toggle { display: none !important; }
  #si18n-header-lang {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
  }
  #si18n-header-lang::before {
    content: 'SkillBridge';
    color: #f2cc8f;
    font: 800 14px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  #si18n-header-lang select {
    min-width: 132px !important;
    height: 42px !important;
    padding: 7px 34px 7px 14px !important;
    border-radius: 6px !important;
    font-size: 16px !important;
    font-weight: 700 !important;
  }
  .layout {
    display: block !important;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
  }
  .layout > aside { display: none !important; }
  #lesson-main {
    min-height: 1180px !important;
    padding: 44px 52px 510px !important;
    background: #f8f9fa !important;
  }
  #lesson-main .eyebrow { font-size: 15px !important; }
  #lesson-main h1 {
    margin: 8px 0 26px !important;
    font-size: 42px !important;
    line-height: 1.13 !important;
  }
  #lesson-main h2 {
    margin: 28px 0 12px !important;
    font-size: 28px !important;
    line-height: 1.25 !important;
  }
  #lesson-main p {
    max-width: none !important;
    margin-bottom: 18px !important;
    font-size: 22px !important;
    line-height: 1.58 !important;
  }
  #lesson-main ul {
    max-width: none !important;
    padding-left: 28px !important;
    font-size: 20px !important;
    line-height: 1.7 !important;
  }
  #lesson-main pre,
  #lesson-main .progress,
  #skillbridge-root,
  #si18n-term-preview,
  #si18n-welcome-banner { display: none !important; }
  #__shotkit_badge__ {
    top: 8px !important;
    left: 42px !important;
    max-width: none !important;
    padding: 2px 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    color: rgba(255,255,255,.82) !important;
    box-shadow: none !important;
    font-size: 14px !important;
  }
`;

const SHORTS_LAYOUTS = Object.freeze({
  'focus-column': FOCUS_COLUMN_CSS,
  'compact-column': `${FOCUS_COLUMN_CSS}
    #lesson-main { padding: 32px 44px 430px !important; }
    #lesson-main h1 { margin-bottom: 20px !important; font-size: 36px !important; }
    #lesson-main h2 { margin: 22px 0 9px !important; font-size: 24px !important; }
    #lesson-main p { margin-bottom: 14px !important; font-size: 20px !important; line-height: 1.46 !important; }
    #lesson-main ul { font-size: 18px !important; line-height: 1.55 !important; }
  `,
});

function resolveShortsLayout(layoutPreset = 'focus-column') {
  return SHORTS_LAYOUTS[layoutPreset] || SHORTS_LAYOUTS['focus-column'];
}

function installVerticalLayout(css) {
  const install = () => {
    if (document.getElementById('__skillbridge_shorts_layout__')) return;
    const style = document.createElement('style');
    style.id = '__skillbridge_shorts_layout__';
    style.textContent = css;
    document.head.appendChild(style);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
}

async function waitUntil(page, startedAt, atMs) {
  const remaining = atMs - (Date.now() - startedAt);
  if (remaining > 0) await page.waitForTimeout(remaining);
}

function createShortsDemo({ evalInContentWorld, lessonUrl }) {
  return {
    name: 'demo-skillbridge',
    targets: ['youtube-shorts'],
    disclaimer: 'Unofficial · independent project',
    trim: { start: 2.3, duration: 21.7 },
    thumbnail: { at: 3.5 },
    captionOptions: {
      mode: 'focus',
      appearance: 'outline',
      position: 'bottom-left',
      bottomOffset: 425,
      wordsPerChunk: 2,
      wordMs: 390,
      activeColor: '#ffd43b',
    },
    captions: [
      { at: 2.5, text: 'Translate AI lessons' },
      { at: 6.2, text: 'Korean in one click' },
      { at: 8, text: 'AI terms stay intact' },
      { at: 11, text: 'Restore anytime' },
      { at: 17, text: 'Original stays untouched' },
      { at: 20, text: 'SkillBridge removes language barriers' },
    ],
    async run({ page, context, baseUrl, demo, calibration }) {
      const startedAt = Date.now();
      await context.addInitScript(installVerticalLayout, resolveShortsLayout(calibration && calibration.layoutPreset));
      await page.goto(`${baseUrl}${lessonUrl}`, { waitUntil: 'networkidle' });
      await evalInContentWorld(context, 'suppressOnboarding');

      await waitUntil(page, startedAt, 3_800);
      await demo.select('#si18n-header-lang-select', 'ko', {
        moveMs: 360,
        beforeMs: 80,
        openMs: 650,
        holdMs: 450,
        maxOptions: 7,
      });
      await page.waitForFunction(
        () => /[\uac00-\ud7a3]/.test(document.querySelector('#p-1')?.textContent || ''),
        null,
        { timeout: 15_000 },
      );
      await evalInContentWorld(context, 'cleanForCapture');

      await waitUntil(page, startedAt, 12_200);
      await demo.select('#si18n-header-lang-select', 'en', {
        moveMs: 360,
        beforeMs: 80,
        openMs: 650,
        holdMs: 450,
        maxOptions: 7,
      });
      await page.waitForFunction(
        () => /This lesson covers prompt engineering/.test(document.querySelector('#p-1')?.textContent || ''),
        null,
        { timeout: 15_000 },
      );
      await evalInContentWorld(context, 'cleanForCapture');
      await waitUntil(page, startedAt, 24_200);
      await demo.hidePointer();
    },
  };
}

module.exports = { SHORTS_LAYOUTS, createShortsDemo, resolveShortsLayout };
