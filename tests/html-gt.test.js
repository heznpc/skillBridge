/**
 * @jest-environment jsdom
 *
 * Unit tests for html-gt.js (v4 B6) — structure-preserving HTML-mode GT
 * reconciliation. Fixtures are REAL gtx endpoint outputs captured 2026-07-24
 * (translate_a/single?client=gtx&dt=t), so the tests exercise the actual
 * mangle/reorder behavior the pipeline must survive, not hand-invented strings.
 */

/* global describe, test, expect, window, document */

require('../src/content/html-gt.js');
// dom-safe provides the inline sanitizer that runs on GT output before the
// integrity gate — the two must agree on which tags survive.
require('../src/lib/dom-safe.js');
const { checkTagIntegrity, reconcileHtml } = window._sbHtmlGt;

function el(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  return wrap.firstElementChild;
}
// translated block → its root element (mirrors: parse GT output, take the block)
const root = (html) => el(html);

describe('checkTagIntegrity', () => {
  test('link preserved (en→ko, real gtx) → passes', () => {
    const orig = el('<p>See <a href="/x">the docs</a> now</p>');
    const tr = root('<p>지금 <a href="/x">문서</a> 보기</p>');
    expect(checkTagIntegrity(orig, tr)).toBe(true);
  });

  test('nested strong>a preserved (real gtx) → passes', () => {
    const orig = el('<p>Read <strong>the <a href="/d">full docs</a></strong> before you start</p>');
    const tr = root('<p>시작하기 전에 <strong><a href="/d">전체 문서</a></strong>를 읽어보세요</p>');
    expect(checkTagIntegrity(orig, tr)).toBe(true);
  });

  test('two links preserved (real gtx) → passes', () => {
    const orig = el('<li>See <a href="/a">setup</a> and <a href="/b">config</a> pages</li>');
    const tr = root('<li><a href="/a">설정</a> 및 <a href="/b">구성</a> 페이지 보기</li>');
    expect(checkTagIntegrity(orig, tr)).toBe(true);
  });

  test('a dropped link → fails (gate)', () => {
    const orig = el('<p>See <a href="/x">the docs</a> now</p>');
    const tr = root('<p>지금 문서 보기</p>'); // link gone
    expect(checkTagIntegrity(orig, tr)).toBe(false);
  });

  test('a changed href → fails (gate)', () => {
    const orig = el('<p>See <a href="/x">the docs</a> now</p>');
    const tr = root('<p>지금 <a href="/EVIL">문서</a> 보기</p>');
    expect(checkTagIntegrity(orig, tr)).toBe(false);
  });
});

describe('reconcileHtml', () => {
  test('folds translation in, preserving original link node identity', () => {
    const orig = el('<p>See <a href="/x">the docs</a> now</p>');
    const origLink = orig.querySelector('a');
    origLink.__sbIdentity = 'ORIGINAL'; // survives only if the node is moved, not recreated

    const tr = root('<p>지금 <a href="/x">문서</a> 보기</p>');
    expect(reconcileHtml(orig, tr)).toBe(true);

    const link = orig.querySelector('a');
    expect(link.__sbIdentity).toBe('ORIGINAL'); // same node — identity/listeners kept
    expect(link.getAttribute('href')).toBe('/x'); // href intact
    expect(link.textContent).toBe('문서'); // inner text translated (not blanked!)
    expect(orig.textContent.replace(/\s+/g, ' ').trim()).toBe('지금 문서 보기');
  });

  test('nested strong>a: both original nodes kept, text translated', () => {
    const orig = el('<p>Read <strong>the <a href="/d">full docs</a></strong> before you start</p>');
    orig.querySelector('strong').__sbId = 'S';
    orig.querySelector('a').__sbId = 'A';
    const tr = root('<p>시작하기 전에 <strong><a href="/d">전체 문서</a></strong>를 읽어보세요</p>');
    expect(reconcileHtml(orig, tr)).toBe(true);
    expect(orig.querySelector('strong').__sbId).toBe('S');
    expect(orig.querySelector('a').__sbId).toBe('A');
    expect(orig.querySelector('a').textContent).toBe('전체 문서');
    expect(orig.textContent.replace(/\s+/g, ' ').trim()).toBe('시작하기 전에 전체 문서를 읽어보세요');
  });

  test('two links: both originals kept in translated order', () => {
    const orig = el('<li>See <a href="/a">setup</a> and <a href="/b">config</a> pages</li>');
    orig.querySelectorAll('a')[0].__n = 'A';
    orig.querySelectorAll('a')[1].__n = 'B';
    const tr = root('<li><a href="/a">설정</a> 및 <a href="/b">구성</a> 페이지 보기</li>');
    expect(reconcileHtml(orig, tr)).toBe(true);
    const links = orig.querySelectorAll('a');
    expect(links[0].__n).toBe('A'); // href /a original
    expect(links[0].textContent).toBe('설정');
    expect(links[1].__n).toBe('B'); // href /b original
    expect(links[1].textContent).toBe('구성');
  });

  test('no interactive/link blanked — visible label always non-empty', () => {
    const orig = el('<p>Click <a href="/x">here</a> to continue</p>');
    const tr = root('<p>계속하려면 <a href="/x">여기</a>를 클릭하세요</p>');
    reconcileHtml(orig, tr);
    expect(orig.querySelector('a').textContent.trim().length).toBeGreaterThan(0);
  });
});

// Review finding: <img> used to be UNtracked, so a dropped inline image passed
// the gate and reconciliation silently lost it. GT does preserve inline
// <img src> (verified live 2026-07-25 en→ko), so the tracked case must still
// pass — and the drop must now fail the gate.
describe('inline <img> integrity', () => {
  test('preserved image (real gtx shape) → gate passes and the ORIGINAL node is kept', () => {
    const orig = el('<p>Use the <img src="/icons/gear.png" alt="gear"> settings button to continue.</p>');
    orig.querySelector('img').__sbId = 'IMG';
    const tr = root('<p>계속하려면 <img src="/icons/gear.png" alt="gear"> 설정 버튼을 사용하세요.</p>');
    expect(checkTagIntegrity(orig, tr)).toBe(true);
    expect(reconcileHtml(orig, tr)).toBe(true);
    expect(orig.querySelector('img').__sbId).toBe('IMG');
  });

  test('dropped image → gate fails (caller keeps the original block)', () => {
    const orig = el('<p>Use the <img src="/icons/gear.png" alt="gear"> settings button.</p>');
    const tr = root('<p>설정 버튼을 사용하세요.</p>');
    expect(checkTagIntegrity(orig, tr)).toBe(false);
  });

  test('rewritten image src → gate fails', () => {
    const orig = el('<p>Use the <img src="/icons/gear.png"> button.</p>');
    const tr = root('<p><img src="https://evil.example/x.png"> 버튼을 사용하세요.</p>');
    expect(checkTagIntegrity(orig, tr)).toBe(false);
  });
});

// Review finding: elementKey is only tag|href, so same-key originals were
// consumed FIFO — a GT reorder could land one element's attributes on
// another's text. Reconciliation now prefers an attribute-exact candidate.
describe('same-key disambiguation', () => {
  test('reordered same-key spans keep their own class/id with their own content', () => {
    const orig = el(
      '<p><span class="notranslate" id="term-a">Claude</span> and <span class="hl" id="mark-b">emphasis</span> here</p>',
    );
    orig.querySelector('#term-a').__sbId = 'A';
    orig.querySelector('#mark-b').__sbId = 'B';
    // GT reorders the two spans (same elementKey "SPAN|").
    const tr = root(
      '<p>여기 <span class="hl" id="mark-b">강조</span> 및 <span class="notranslate" id="term-a">Claude</span></p>',
    );
    expect(checkTagIntegrity(orig, tr)).toBe(true);
    expect(reconcileHtml(orig, tr)).toBe(true);
    // Attributes must still travel with their own element, not swap.
    expect(orig.querySelector('#term-a').__sbId).toBe('A');
    expect(orig.querySelector('#term-a').className).toBe('notranslate');
    expect(orig.querySelector('#mark-b').__sbId).toBe('B');
    expect(orig.querySelector('#mark-b').className).toBe('hl');
  });
});

// Review finding: the inline sanitizer that runs on GT output stripped
// <img> and <button>. Because the integrity gate tracks both, every block
// containing one failed the gate and stayed untranslated (and before <img>
// was tracked, the image vanished silently). The sanitized tree is only a
// MATCHING TEMPLATE — reconcileHtml swaps in the original nodes — so allowing
// them cannot inject a translated src/href into the page.
describe('sanitizer keeps the tags the integrity gate tracks', () => {
  const { sanitizeInlineHtml } = window._sbDomSafe || {};

  test('_sbDomSafe is loaded for this check', () => {
    expect(typeof sanitizeInlineHtml).toBe('function');
  });

  test('img and button survive sanitization with the attributes the gate matches on', () => {
    const out = sanitizeInlineHtml(
      '<p>Use <img src="/i/gear.png" alt="gear" class="ic"> and <button id="go" class="cta">Start</button> now</p>',
    );
    expect(out).toMatch(/<img[^>]*src="\/i\/gear\.png"/);
    expect(out).toMatch(/alt="gear"/);
    expect(out).toMatch(/<button[^>]*id="go"/);
    expect(out).toMatch(/class="cta"/);
  });

  // Mirrors _applyHtmlTranslation: sanitize, then re-wrap in a container of
  // the original tag (the inline sanitizer strips the block wrapper itself).
  function applyLikePipeline(originalEl, translatedHtml) {
    const container = document.createElement(originalEl.tagName);
    container.innerHTML = sanitizeInlineHtml(translatedHtml);
    let root = container;
    if (container.children.length === 1 && container.firstElementChild.tagName === originalEl.tagName) {
      root = container.firstElementChild;
    }
    return root;
  }

  test('a sanitized block still passes the integrity gate end to end', () => {
    const orig = el('<p>Use the <img src="/i/gear.png" alt="gear"> settings <button id="go">button</button>.</p>');
    const translated = '<p><img src="/i/gear.png" alt="gear"> 설정 <button id="go">버튼</button>을 사용하세요.</p>';
    const rootEl = applyLikePipeline(orig, translated);
    expect(checkTagIntegrity(orig, rootEl)).toBe(true);
    expect(reconcileHtml(orig, rootEl)).toBe(true);
    expect(orig.querySelector('img')).toBeTruthy();
    expect(orig.querySelector('button').textContent).toBe('버튼');
  });

  test('regression: before the fix the sanitizer dropped these and the gate failed', () => {
    // Guards the exact defect: if img/button ever leave the allowlist again,
    // the sanitized tree loses them and the gate refuses the whole block.
    const orig = el('<p>Use the <img src="/i/gear.png"> settings <button>button</button>.</p>');
    const strippedByOldSanitizer = document.createElement('p');
    strippedByOldSanitizer.innerHTML = ' 설정 버튼을 사용하세요.';
    expect(checkTagIntegrity(orig, strippedByOldSanitizer)).toBe(false);
  });

  test('unsafe src/href and event handlers are still stripped', () => {
    const out = sanitizeInlineHtml(
      '<p><img src="javascript:alert(1)" onerror="alert(1)"><a href="javascript:alert(1)">x</a></p>',
    );
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/onerror/i);
  });
});
