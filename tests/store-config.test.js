const config = require('../store.config');
const { resolveShortsLayout } = require('../scripts/store-assets/shorts-demo');

describe('store asset config', () => {
  test('keeps a dedicated publish-ready Shorts story', () => {
    const shorts = config.demos.find((demo) => demo.name === 'demo-skillbridge');

    expect(shorts).toMatchObject({
      targets: ['youtube-shorts'],
      disclaimer: 'Unofficial · independent project',
      trim: { start: 2.3, duration: 21.7 },
      thumbnail: { at: 3.5 },
      captionOptions: {
        mode: 'focus',
        appearance: 'outline',
        position: 'bottom-left',
        bottomOffset: 425,
      },
    });
    expect(shorts.captions[0]).toEqual({ at: 2.5, text: 'Translate AI lessons' });
    expect(shorts.captions.map((caption) => caption.text).join(' ')).toMatch(/Restore|Original/);
    expect(shorts.run).toEqual(expect.any(Function));
  });

  test('declares constrained calibration layouts consumed by the Shorts story', () => {
    expect(config.calibration).toEqual({
      from: 'shotkit.calibration.json',
      layouts: ['focus-column', 'compact-column'],
    });
    expect(resolveShortsLayout('focus-column')).toContain('font-size: 42px');
    expect(resolveShortsLayout('compact-column')).toContain('font-size: 36px');
    expect(resolveShortsLayout('unknown')).toBe(resolveShortsLayout('focus-column'));
  });
});
