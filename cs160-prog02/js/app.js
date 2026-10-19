/* app.js — the interface. Facts come only from data/datapack.json; the model only
 * translates, compares and explains what we hand it. The official summary is never sent. */

let PACK = null;
const state = { measure: null, level: 'everyday', length: 'short', compareId: null, office: null };
const imgs = {}; // officeId -> [{src, scene, why, prompt, cost, ms, at}]

/* ---------------- helpers ---------------- */
const $ = (id) => document.getElementById(id);
const norm = (s) => String(s || '').toLowerCase().replace(/\[deleted:|\]/g, ' ').replace(/[“”"]/g, '"').replace(/[‘’']/g, "'")
  .replace(/[—–]/g, '-').replace(/[^a-z0-9$%'"-]+/g, ' ').trim();
const quoteFound = (quote, source) => !!quote && norm(source).includes(norm(quote));
const citeHTML = (t) => esc(t).replace(/\[(Sec(?:tion)?\.?\s*[^\]]{1,30})\]/gi, '<span class="cite" title="Section of the legal text this comes from">$1</span>');
const stripCites = (t) => t.replace(/\[(Sec(?:tion)?\.?\s*[^\]]{1,30})\]/gi, '');
const wc = (t) => (t.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;
const paras = (t) => t.split(/\n+/).filter((p) => /[A-Za-z]{3}/.test(p));
const money = (c) => '$' + Number(c || 0).toFixed(c < 0.001 ? 5 : 4);

function ticking(el, label) {
  const t0 = Date.now();
  el.innerHTML = `<div class="loading"><span class="spinner"></span>${esc(label)} <span class="elapsed">0.0s</span></div>`;
  const span = el.querySelector('.elapsed');
  const id = setInterval(() => { span.textContent = ((Date.now() - t0) / 1000).toFixed(1) + 's'; }, 100);
  return () => clearInterval(id);
}
function errBox(el, err) {
  el.innerHTML = `<div class="error"><b>That call failed.</b> ${esc(err.message)}<br><span class="small">Nothing was charged unless the cost counter moved. You can try again.</span></div>`;
}
function metaLine(r, extra = '') {
  return `<div class="machine">Machine-written by <b>${esc(r.model)}</b>. It can be wrong. Nothing here is official. · ${(r.ms / 1000).toFixed(1)}s · ${money(r.cost)}${r.cached ? ' · <span class="chip">shown from cache, $0 now</span>' : ''} ${extra}</div>`;
}

/* ---------------- tabs ---------------- */
document.querySelectorAll('.tab').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
});

/* ---------------- key + model ---------------- */
$('apiKey').value = LS.get('represent.key', '');
$('apiKey').onchange = () => LS.set('represent.key', $('apiKey').value.trim());
$('model').value = LS.get('represent.model', 'google/gemini-2.5-flash-lite');
$('model').onchange = () => { LS.set('represent.model', $('model').value); if (state.measure) renderMeasureArea(); };

/* =====================================================================
 * 1. MEASURES
 * ===================================================================== */
function renderMeasureCards() {
  $('measureCards').innerHTML = PACK.measures.map((m) => `
    <button class="card" data-id="${m.id}">
      <div class="card-h">${esc(m.label)}</div>
      <div class="card-t">${esc(m.official.title)}</div>
      <div class="card-f"><span>≈ ${m.wordCount.toLocaleString()} words of legal text</span><span>Open →</span></div>
    </button>`).join('');
  $('measureCards').querySelectorAll('.card').forEach((c) => c.onclick = () => openMeasure(c.dataset.id));
}

function openMeasure(id) {
  state.measure = PACK.measures.find((m) => m.id === id);
  $('measureCards').querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
  const m = state.measure;
  $('measureView').hidden = false;
  $('mLabel').textContent = m.label;
  $('mTitle').textContent = m.official.title;
  $('mOfficial').href = m.sources.officialPage;
  $('mPdf').href = m.sources.legalTextPdf;
  $('officialSummary').innerHTML = `<p><b>Title:</b> ${esc(m.official.title)}</p><p>${esc(m.official.summaryFull || m.official.summary)}</p>
    <p class="small muted">Flesch–Kincaid grade of the state's own summary: <b>${fleschKincaid(m.official.summaryFull || m.official.summary).grade}</b></p>`;
  $('topicOut').innerHTML = '';
  renderKnobs();
  renderMeasureArea();
  renderTopics();
  $('measureView').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderKnobs() {
  $('levelSeg').innerHTML = LEVELS.map((l) => `<button class="${state.level === l.id ? 'on' : ''}" data-v="${l.id}">${l.name}<small>${l.target}</small></button>`).join('');
  $('lengthSeg').innerHTML = LENGTHS.map((l) => `<button class="${state.length === l.id ? 'on' : ''}" data-v="${l.id}" ${state.level === 'aswritten' ? 'disabled' : ''}>${l.name}<small>${l.target}</small></button>`).join('');
  $('levelSeg').querySelectorAll('button').forEach((b) => b.onclick = () => { state.level = b.dataset.v; renderKnobs(); renderMeasureArea(); });
  $('lengthSeg').querySelectorAll('button').forEach((b) => b.onclick = () => { state.length = b.dataset.v; renderKnobs(); renderMeasureArea(); });
  const L = LEVELS.find((l) => l.id === state.level), N = LENGTHS.find((l) => l.id === state.length);
  $('levelTarget').textContent = L.lo ? `target grade ${L.lo}–${L.hi}` : 'no AI';
  $('lengthTarget').textContent = state.level === 'aswritten' ? '' : N.target;
  $('lengthNote').hidden = state.level !== 'aswritten';
  $('lengthNote').textContent = 'Length does not apply to "As written": the certified text is shown in full, exactly as the state printed it. Shortening it would make it no longer the certified text.';

  const warn = $('comboWarn');
  let msg = '';
  if (state.level !== 'aswritten') {
    if (state.length === 'headline') msg = '<b>Tight space.</b> 25 words cannot hold every provision. Models tend to drop qualifiers ("one-time", thresholds, exceptions) first. The qualifier check under the result shows what fell out.';
    else if (state.level === 'simplest' && state.length === 'short') msg = '<b>Tight space, simple words.</b> Short lengths at a grade 3–4 level tend to lose qualifiers and exceptions. The qualifier check below the result shows what, if anything, fell out.';
    if (state.measure.wordCount > 10000 && state.length !== 'complete') msg += (msg ? '<br>' : '') + `<b>Very long measure.</b> ${state.measure.wordCount.toLocaleString()} words of legal text are being squeezed into ${LENGTHS.find((l) => l.id === state.length).target}. Expect the most loss here.`;
  }
  warn.hidden = !msg; warn.innerHTML = msg;
}

function certifiedHTML(m) {
  return esc(m.fullText).replace(/\[DELETED: ([^\]]*)\]/g, '<del title="Existing law this measure removes">$1</del>').replace(/\n/g, '<br>');
}

function renderMeasureArea() {
  const m = state.measure, area = $('renderArea');
  if (state.level === 'aswritten') {
    const fk = fleschKincaid(operativeText(m.fullText));
    area.innerHTML = `<div class="certified">
      <div class="block-h"><span class="badge official">CERTIFIED TEXT · NOT AI</span> ${esc(m.label)} as printed by the state · no model involved · $0</div>
      <div class="statrow"><span class="stat">Flesch–Kincaid grade <b>${fk.grade}</b></span><span class="stat">${m.wordCount.toLocaleString()} words</span><span class="stat"><del>struck text</del> = existing law being removed</span></div>
      <div class="fulltext">${certifiedHTML(m)}</div></div>`;
    return;
  }
  const key = ['m', m.id, state.level, state.length, currentModel()].join('|');
  const cached = cacheGet(key);
  if (cached) return showRendering(cached, true);
  const L = LEVELS.find((l) => l.id === state.level), N = LENGTHS.find((l) => l.id === state.length);
  area.innerHTML = `<div class="pending">
    <div class="block-h">${esc(L.name)} · ${esc(N.name)}: not generated yet</div>
    <p class="small">This sends the full legal text (${m.wordCount.toLocaleString()} words) to <b>${esc(currentModel())}</b> and asks for a rewrite at grade ${L.lo}–${L.hi}, ${N.target}. ${m.wordCount > 10000 ? 'Long measure: expect 5–20 seconds.' : 'Usually a few seconds.'} The cost is added to the session total. Versions you have already generated are reused for free.</p>
    <details class="small"><summary>Show exactly what will be sent</summary><pre>${esc(measurePrompt(m, L, N).slice(0, 2500))}${m.fullText.length > 1500 ? '\n… (full legal text continues)' : ''}</pre></details>
    <button class="primary" id="genBtn">Generate this version</button></div>`;
  $('genBtn').onclick = () => generateRendering(key);
}

async function generateRendering(key) {
  const m = state.measure, L = LEVELS.find((l) => l.id === state.level), N = LENGTHS.find((l) => l.id === state.length);
  const stop = ticking($('renderArea'), `Rewriting ${m.label} at ${L.name} · ${N.name}…`);
  try {
    const r = await askModel(measurePrompt(m, L, N), { op: `Render ${m.label} ${L.name}/${N.name}` });
    const rec = { text: r.text.trim(), model: r.model, cost: r.cost, ms: r.ms, at: r.at, level: state.level, length: state.length, mid: m.id };
    cacheSet(key, rec);
    stop(); showRendering(rec, false);
  } catch (e) { stop(); errBox($('renderArea'), e); }
}

function showRendering(rec, cached) {
  const m = state.measure, L = LEVELS.find((l) => l.id === rec.level), N = LENGTHS.find((l) => l.id === rec.length);
  const plain = stripCites(rec.text), fk = fleschKincaid(plain), words = wc(plain);
  const gradeOk = fk.grade !== null && fk.grade <= L.hi + 1 && fk.grade >= L.lo - 1;
  const lenOk = N.hi === null || (words <= N.hi && words >= (N.lo || 0));
  // qualifier check — plain string search, no AI
  const src = operativeText(m.fullText).toLowerCase(), out = plain.toLowerCase();
  const KEY_Q = ['one-time', 'billion', 'million', 'percent', 'repeal', 'two-thirds', 'temporary', 'exempt', 'except', 'unless'];
  const present = KEY_Q.filter((q) => src.includes(q));
  const kept = present.filter((q) => out.includes(q) || (q === 'percent' && out.includes('%')) || (q === 'one-time' && out.includes('one time')));
  const lost = present.filter((q) => !kept.includes(q));
  $('renderArea').innerHTML = `<div class="ai">
    <div class="block-h"><span class="badge ai">AI-GENERATED</span> ${esc(m.label)} · ${esc(L.name)} · ${esc(N.name)} — from the full legal text only
      <button class="link" id="showCert">Read the full legal text</button></div>
    <div class="statrow">
      <span class="stat ${gradeOk ? 'ok' : 'off'}">Asked grade ${L.lo}–${L.hi} · got <b>${fk.grade}</b></span>
      <span class="stat ${lenOk ? 'ok' : 'off'}">Asked ${N.target} · got <b>${words}</b> words</span>
    </div>
    <div class="gen">${citeHTML(rec.text).replace(/\n+/g, '</p><p>').replace(/^/, '<p>')}</p></div>
    <div class="qual ${lost.length ? 'off' : 'ok'}"><b>Qualifier check (no AI):</b> ${present.length === 0 ? 'the legal text has none of the tracked qualifiers.' :
      (lost.length ? `the legal text says <b>${lost.map((q) => '“' + q + '”').join(', ')}</b> but this version never does. Read the full text before relying on it.` : 'every tracked qualifier in the legal text (' + present.map((q) => '“' + q + '”').join(', ') + ') survived.')}
      ${kept.length && lost.length ? `<br><span class="small">Kept: ${kept.map((q) => '“' + q + '”').join(', ')}</span>` : ''}</div>
    ${metaLine({ ...rec, cached })}
    <button class="secondary" id="regen">Regenerate (new call)</button>
    <div id="certBox" hidden class="certified"><div class="block-h"><span class="badge official">CERTIFIED TEXT · NOT AI</span> <a href="${m.sources.legalTextPdf}" target="_blank">state PDF ↗</a></div><div class="fulltext">${certifiedHTML(m)}</div></div>
  </div>`;
  $('showCert').onclick = () => { $('certBox').hidden = !$('certBox').hidden; };
  $('regen').onclick = () => generateRendering(['m', m.id, rec.level, rec.length, currentModel()].join('|'));
}

/* ---------- topics (keyword count, no AI) ---------- */
function topicCounts(m) {
  const ps = paras(operativeText(m.fullText));
  return TOPICS.map((t) => {
    const re = new RegExp('\\b(' + t.words.map((w) => w.replace(/[-]/g, '\\-')).join('|') + ')\\b', 'i');
    const n = ps.filter((p) => re.test(p)).length;
    return { t, n, total: ps.length };
  }).sort((a, b) => b.n - a.n);
}

function renderTopics() {
  const counts = topicCounts(state.measure);
  const max = Math.max(1, ...counts.map((c) => c.n));
  $('topics').innerHTML = counts.map((c, i) => `
    <div class="topic">
      <div class="topic-top"><div><b>${esc(c.t.label)}</b> ${i < 2 && c.n > 0 ? '<span class="chip dark">Most mentioned here</span>' : ''}${c.n === 0 ? '<span class="chip">Not mentioned</span>' : ''}
        <div class="muted small">${esc(c.t.covers)}</div></div>
        <button class="secondary" data-t="${c.t.id}">Explain</button></div>
      <div class="bar"><span style="width:${(c.n / max) * 100}%"></span></div>
      <div class="small muted">${c.n} of ${c.total} paragraphs (${Math.round((c.n / c.total) * 100)}%) ·
        <details class="inline"><summary>keywords</summary>${esc(c.t.words.join(', '))}</details></div>
    </div>`).join('');
  $('topics').querySelectorAll('button[data-t]').forEach((b) => b.onclick = () => explainTopic(b.dataset.t, false));
}

async function explainTopic(tid, force) {
  const m = state.measure, t = TOPICS.find((x) => x.id === tid), out = $('topicOut');
  const key = ['t', m.id, tid, currentModel()].join('|');
  let rec = force ? null : cacheGet(key), cached = !!rec;
  out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (!rec) {
    const stop = ticking(out, `Reading ${m.label} for “${t.label}”…`);
    try {
      const r = await askModel(topicPrompt(m, t), { op: `Topic ${m.label}: ${t.label}`, json: true });
      rec = { ...r.json, model: r.model, cost: r.cost, ms: r.ms, at: r.at };
      cacheSet(key, rec); stop();
    } catch (e) { stop(); return errBox(out, e); }
  }
  const says = Array.isArray(rec.says) ? rec.says : [];
  out.innerHTML = `<div class="ai">
    <div class="block-h"><span class="badge ai">AI-GENERATED</span> ${esc(m.label)} · ${esc(t.label)} · Everyday <a href="${m.sources.legalTextPdf}" target="_blank" class="link">Read the full legal text ↗</a></div>
    <div class="label-sm">WHAT THE TEXT SAYS</div>
    ${says.length ? says.map((s) => `<div class="point"><p>${esc(s.point)}</p>
      <div class="small">${s.section ? `<span class="cite">${esc(s.section)}</span>` : ''}
      ${quoteFound(s.quote, m.fullText) ? `<span class="verified">✓ quote found in legal text</span>` : `<span class="unverified">⚠ quote not found in the legal text — treat this point with suspicion</span>`}
      <q>${esc(s.quote)}</q></div></div>`).join('') : '<p class="muted">The model found nothing in the text about this topic.</p>'}
    <div class="label-sm">NOT ADDRESSED IN THE TEXT</div><p>${esc(rec.silent || '—')}</p>
    <div class="opinion"><div class="label-sm"><span class="badge opinion">AI OPINION</span> Leans ${esc(rec.lean || 'mixed')} on this topic</div>
      <p>${esc(rec.opinion || '')}</p>
      <div class="small">This is the AI's own view. It is not a fact, it is not in the law, and it may draw on knowledge from outside the text. It does not tell you how to vote.</div></div>
    ${metaLine({ ...rec, cached })}
    <button class="secondary" id="topicRegen">Regenerate (new call)</button></div>`;
  $('topicRegen').onclick = () => explainTopic(tid, true);
}

/* =====================================================================
 * 2. COMPARE
 * ===================================================================== */
const DOCS = {
  argumentInFavor: { side: 'yes', name: 'Argument in favor' },
  rebuttalToAgainst: { side: 'yes', name: 'Rebuttal to the argument against' },
  argumentAgainst: { side: 'no', name: 'Argument against' },
  rebuttalToFavor: { side: 'no', name: 'Rebuttal to the argument in favor' },
};

function setupCompare() {
  $('cMeasure').innerHTML = PACK.measures.map((m) => `<option value="${m.id}">${esc(m.label)} — ${esc(m.official.title.split('.')[0])}</option>`).join('');
  $('cMeasure').value = 'prop-40';
  $('cMeasure').onchange = renderCompare;
  $('cDisclaimer').innerHTML = `<b>Please note:</b> ${esc(PACK.meta.argumentDisclaimer)} <span class="small">(printed at the foot of every argument page in the state guide)</span>`;
  renderCompare();
}

const STOP = new Set(['of', 'the', 'and', 'for', 'california', 'ca', 'association', 'assn', 'inc', 'council', 'state', 'a', 'in', '&']);
function orgKey(o) { return norm(o).split(' ').filter((w) => w && !STOP.has(w)); }
function orgsOverlap(a, b) {
  const A = orgKey(a), B = orgKey(b);
  if (!A.length || !B.length) return false;
  if (A.join(' ') === B.join(' ')) return true;
  const bg = (x) => new Set(x.slice(0, -1).map((w, i) => w + ' ' + x[i + 1]));
  const ba = bg(A); for (const g of bg(B)) if (ba.has(g)) return true;
  return false;
}

/* Groups both sides claim to speak for — plain text search of the printed documents, no AI. */
const GROUPS = ['Planned Parenthood', 'teachers', 'nurses', 'doctors', 'firefighters', 'small business', 'taxpayers', 'patients', 'seniors', 'renters', 'homeowners', 'workers', 'League of Women Voters'];
function claimedByBoth(m) {
  const txt = (side) => Object.values(m.arguments).filter((d) => d.side === side).map((d) => d.text + ' ' + d.signers.map((s) => s.raw).join(' ')).join(' ').toLowerCase();
  const Y = txt('yes'), N = txt('no');
  const cnt = (t, g) => (t.match(new RegExp('\\b' + g.toLowerCase() + '\\b', 'g')) || []).length;
  const hits = GROUPS.map((g) => ({ g, y: cnt(Y, g), n: cnt(N, g) })).filter((x) => x.y && x.n);
  if (!hits.length) return '';
  return `<div class="warn"><b>Both sides invoke the same groups.</b> ${hits.map((h) => `“${esc(h.g)}” (YES side ${h.y}×, NO side ${h.n}×)`).join(' · ')}.
    <span class="small">Counted by searching the printed arguments, rebuttals and signatures; no AI. This guide does not say which side represents them.</span></div>`;
}

function renderCompare() {
  const m = PACK.measures.find((x) => x.id === $('cMeasure').value);
  state.compareId = m.id;
  const a = m.arguments;
  const docLine = (k) => `<div class="docline"><b>${DOCS[k].name}</b> · ${a[k].wordCount} words ${a[k].round === 'rebuttal' ? '· answers the other side\'s argument' : ''}
    <details class="inline"><summary>read printed text</summary><div class="printed">${esc(a[k].text).replace(/\n/g, '<br>')}</div></details></div>`;
  $('cStructure').innerHTML = `<h3 class="section-h">Who wrote what <span class="muted small">— from the printed pages, no AI</span></h3>
    <p class="small muted">Each side got one argument and one rebuttal. The rebuttal is written by the side that did NOT write the argument it answers, and nobody gets to answer a rebuttal.</p>
    <div class="two"><div class="sidecol yes"><div class="side-h">URGES A YES VOTE</div>${docLine('argumentInFavor')}${docLine('rebuttalToAgainst')}</div>
    <div class="sidecol no"><div class="side-h">URGES A NO VOTE</div>${docLine('argumentAgainst')}${docLine('rebuttalToFavor')}</div></div>
    <p class="small"><a href="${m.sources.argumentsPage}" target="_blank">The four printed documents on the state's site ↗</a></p>`;

  // signers — straight from the data pack, no AI
  const signers = { yes: [], no: [] };
  for (const [k, d] of Object.entries(a)) for (const s of d.signers) signers[d.side].push({ ...s, doc: DOCS[k].name });
  const both = [];
  for (const y of signers.yes) for (const n of signers.no) if (orgsOverlap(y.organization || '', n.organization || '')) both.push([y, n]);
  const flag = (s, side) => both.some((p) => p[side === 'yes' ? 0 : 1] === s);
  const sl = (arr, side) => arr.map((s) => `<div class="signer ${flag(s, side) ? 'flag' : ''}"><b>${esc(s.name)}</b>${s.title ? ', ' + esc(s.title) : ''}<div class="small muted">${esc(s.organization || '')} · signed the ${esc(s.doc.toLowerCase())}</div></div>`).join('');
  $('cSigners').innerHTML = `<h3 class="section-h">Who signed <span class="muted small">— names and organizations are the state's, not AI</span></h3>
    ${both.length ? `<div class="warn"><b>Same organization on both sides.</b> ${both.map(([y, n]) => `“${esc(y.organization)}” (YES) and “${esc(n.organization)}” (NO)`).join('; ')}. Matched by comparing organization names in code; check the printed pages.</div>` : '<p class="small muted">No organization signed for both sides.</p>'}
    ${claimedByBoth(m)}
    <div class="two"><div class="sidecol yes"><div class="side-h">URGES A YES VOTE</div>${sl(signers.yes, 'yes')}</div><div class="sidecol no"><div class="side-h">URGES A NO VOTE</div>${sl(signers.no, 'no')}</div></div>`;

  const key = ['c', m.id, currentModel()].join('|');
  const cached = cacheGet(key);
  $('cRun').innerHTML = `<h3 class="section-h">What each side claims</h3>
    ${cached ? '' : `<p class="small muted">One call sends all four printed documents (${Object.values(a).reduce((s, d) => s + d.wordCount, 0).toLocaleString()} words) to ${esc(currentModel())} and asks for structured JSON across four dimensions. It does not send the legal text or the official summary.</p>`}
    <button class="primary" id="cGo">${cached ? 'Regenerate (new call)' : 'Extract the claims'}</button>`;
  $('cGo').onclick = () => runCompare(m, key);
  if (cached) showCompare(m, cached, true); else $('cOut').innerHTML = '';
}

async function runCompare(m, key) {
  const stop = ticking($('cOut'), `Extracting claims from the four ${m.label} documents…`);
  try {
    const r = await askModel(comparePrompt(m), { op: `Compare ${m.label}`, json: true });
    if (!Array.isArray(r.json.dimensions)) throw new Error('JSON came back without a "dimensions" list.');
    const rec = { ...r.json, model: r.model, cost: r.cost, ms: r.ms, at: r.at };
    cacheSet(key, rec); stop(); showCompare(m, rec, false);
    $('cGo').textContent = 'Regenerate (new call)';
  } catch (e) { stop(); errBox($('cOut'), e); }
}

function showCompare(m, rec, cached) {
  const a = m.arguments;
  const cell = (c, side, otherHas) => {
    if (!c || !c.claim) return `<div class="cell empty"><span class="chip">${otherHas ? 'Did not raise this' : 'Not raised'}</span>
      <p class="small muted">${otherHas ? `The ${side.toUpperCase()} side's argument and rebuttal never address this point. That is different from disputing it.` : ''}</p></div>`;
    const sideArg = side === 'yes' ? 'argumentInFavor' : 'argumentAgainst';
    let doc = a[c.source] ? c.source : sideArg;
    // Code check (no AI): if the quote actually appears in this side's original argument, it was not "new in a rebuttal".
    const corrected = a[doc].round === 'rebuttal' && quoteFound(c.quote, a[sideArg].text);
    if (corrected) doc = sideArg;
    const inReb = a[doc].round === 'rebuttal';
    const found = quoteFound(c.quote, a[doc].text) || quoteFound(c.quote, Object.values(a).filter((d) => d.side === side).map((d) => d.text).join(' '));
    return `<div class="cell">
      <div class="chips"><span class="chip">${inReb ? 'Rebuttal' : 'Argument'}</span>
        ${inReb ? '<span class="chip amber">New in a rebuttal</span>' : (c.answered ? '<span class="chip">Answered by other side</span>' : '<span class="chip">Not answered</span>')}
        <span class="badge ai sm">AI-generated wording</span></div>
      <p>${esc(c.claim)}</p>
      ${inReb ? '<p class="small muted">Raised for the first time in a rebuttal, so the other side never got to respond.</p>' : ''}
      ${corrected ? '<p class="small"><span class="chip amber">Source corrected by code</span> The model said this first appeared in a rebuttal, but the quote is in this side\'s original argument.</p>' : ''}
      <div class="small">${found ? '<span class="verified">✓ quote found in printed text</span>' : '<span class="unverified">⚠ the quote the model gave was not found in the printed text</span>'} <q>${esc(c.quote || '')}</q></div>
      <details class="inline small"><summary>Original text ↗</summary><div class="printed">${esc(a[doc].text).replace(/\n/g, '<br>')}</div></details>
    </div>`;
  };
  const rows = DIMENSIONS.map((d) => {
    const row = rec.dimensions.find((x) => x.id === d.id) || {};
    const y = row.yes && row.yes.claim ? row.yes : null, n = row.no && row.no.claim ? row.no : null;
    const tag = y && n ? '<span class="chip dark">Both sides address this</span>' : y ? '<span class="chip">Only the YES side raises this</span>' : n ? '<span class="chip">Only the NO side raises this</span>' : '<span class="chip">Neither side addresses this</span>';
    return `<div class="dim"><div class="dim-h"><b>${esc(d.name)}</b> ${tag}</div>
      <div class="two"><div class="sidecol yes"><div class="side-h">YES SIDE</div>${cell(y, 'yes', !!n)}</div><div class="sidecol no"><div class="side-h">NO SIDE</div>${cell(n, 'no', !!y)}</div></div></div>`;
  }).join('');
  $('cOut').innerHTML = `<div class="ai"><div class="block-h"><span class="badge ai">AI-GENERATED</span> Claims extracted from the four printed documents. This guide does not judge which side is right.</div>
    <div class="disclaimer small">${esc(PACK.meta.argumentDisclaimer)}</div>${rows}${metaLine({ ...rec, cached })}</div>`;
}

/* =====================================================================
 * 3. OFFICES
 * ===================================================================== */
function renderOfficeCards() {
  $('officeCards').innerHTML = PACK.offices.map((o) => `<button class="card" data-id="${o.id}"><div class="card-h">${esc(o.name)}</div><div class="card-t">${esc(o.jurisdiction)}</div><div class="card-f"><span>${esc(o.description.split(/[.,]/)[0])}</span><span>Open →</span></div></button>`).join('');
  $('officeCards').querySelectorAll('.card').forEach((c) => c.onclick = () => openOffice(c.dataset.id));
}

function openOffice(id) {
  const o = PACK.offices.find((x) => x.id === id);
  state.office = o;
  $('officeCards').querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
  $('officeView').innerHTML = `
    <h2>${esc(o.name)}</h2><div class="muted">${esc(o.jurisdiction)}</div>
    <div class="handout"><div class="block-h"><span class="badge official">FROM THE HANDOUT</span> What the data pack says this office decides · not generated</div>
      <p>${esc(o.description)}</p>${o.additionalContext.map((c) => `<p class="small">• ${esc(c.fact)}</p>`).join('')}
      <p class="small muted">Source: ${esc(o.source)}. The handout says nothing more than this; the AI explainer below fills in the rest.</p></div>
    <div class="two wide">
      <div><div class="col-h">Explain this office</div>
        <p class="small muted">One AI call turns the handout's facts into a clearer explanation, including what the office does <b>not</b> control. Costs a fraction of a cent.</p>
        <details class="small"><summary>Show exactly what will be sent</summary><pre>${esc(officePrompt(o))}</pre></details>
        <button class="primary" id="oGo">Explain this office</button><div id="oOut"></div></div>
      <div><div class="col-h">Illustration</div>
        <p class="small muted">The AI chooses one of ${SCENES[o.id].length} scenes about this office (avoiding ones already drawn), then an image model draws it. About $0.04 each.</p>
        <details class="small"><summary>Show the scene list and image prompt template</summary><ol start="0">${SCENES[o.id].map((s) => `<li>${esc(s)}</li>`).join('')}</ol><pre>${esc(imagePrompt(o, '{chosen scene}'))}</pre></details>
        <button class="primary" id="iGo">${(imgs[o.id] || []).length ? 'Generate another (the AI may pick a different scene)' : 'Generate illustration'}</button>
        <div id="iOut"></div><div id="iGallery"></div></div>
    </div>`;
  $('oGo').onclick = () => explainOffice(o, true);
  $('iGo').onclick = () => illustrate(o);
  const cached = cacheGet(['o', o.id, currentModel()].join('|'));
  if (cached) { showOffice(o, cached, true); $('oGo').textContent = 'Generate a different version (new call)'; }
  renderGallery(o);
  $('officeView').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function explainOffice(o) {
  const key = ['o', o.id, currentModel()].join('|');
  const stop = ticking($('oOut'), `Explaining ${o.name}…`);
  try {
    const r = await askModel(officePrompt(o), { op: `Explain ${o.name}`, json: true });
    const rec = { ...r.json, model: r.model, cost: r.cost, ms: r.ms, at: r.at };
    cacheSet(key, rec); stop(); showOffice(o, rec, false);
    $('oGo').textContent = 'Generate a different version (new call)';
  } catch (e) { stop(); errBox($('oOut'), e); }
}

function showOffice(o, rec, cached) {
  const list = (xs) => (Array.isArray(xs) ? xs : []).map((x) => `<li>${esc(typeof x === 'string' ? x : x.item)}${x.basis ? ` <span class="chip ${x.basis === 'handout' ? '' : 'amber'}">${x.basis === 'handout' ? 'stated in handout' : 'inferred from scope — verify'}</span>` : ''}</li>`).join('');
  $('oOut').innerHTML = `<div class="ai"><div class="block-h"><span class="badge ai">AI-GENERATED</span> Explainer: ${esc(o.name)}</div>
    <h3 class="serif">${esc(rec.headline || o.name)}</h3><p>${esc(rec.intro || '')}</p>
    <div class="label-sm">WHAT IT DECIDES</div><ul>${list(rec.decides)}</ul>
    <div class="label-sm">WHAT IT DOES NOT CONTROL</div><ul>${list(rec.doesNotControl)}</ul>
    <div class="label-sm">WHY IT MATTERS</div><p>${esc(rec.whyItMatters || '')}</p>
    ${metaLine({ ...rec, cached })}</div>`;
}

async function illustrate(o) {
  const out = $('iOut');
  const list = imgs[o.id] = imgs[o.id] || [];
  const used = list.map((x) => x.sceneIdx);
  let stop = ticking(out, 'The AI is choosing a scene…');
  try {
    const pick = await askModel(scenePickPrompt(o, used), { op: `Pick scene: ${o.name}`, json: true, model: 'google/gemini-2.5-flash-lite' });
    let idx = Number(pick.json.scene);
    if (!(idx >= 0 && idx < SCENES[o.id].length)) idx = Math.floor(Math.random() * SCENES[o.id].length);
    const scene = SCENES[o.id][idx], prompt = imagePrompt(o, scene);
    stop(); stop = ticking(out, `Drawing scene ${idx}: “${scene}” (usually 7–20s)…`);
    const r = await makeImage(prompt, `Image: ${o.name}`);
    list.unshift({ ...r, sceneIdx: idx, scene, why: pick.json.why || '', prompt, cost: r.cost + pick.cost, office: o.name });
    stop(); out.innerHTML = '';
    $('iGo').textContent = 'Generate another (the AI may pick a different scene)';
    renderGallery(o);
  } catch (e) { stop(); errBox(out, e); }
}

function renderGallery(o) {
  const list = imgs[o.id] || [];
  $('iGallery').innerHTML = list.length ? list.map((x, i) => `
    <figure class="ai img ${i ? 'thumb' : ''}"><div class="block-h"><span class="badge ai">AI-GENERATED IMAGE</span> An illustration, not a photo of a real place, person, or event.</div>
      <img src="${x.src}" alt="AI illustration: ${esc(x.scene)}">
      <figcaption class="small">Scene ${x.sceneIdx} chosen by the AI: <i>${esc(x.scene)}</i>${x.why ? ' — ' + esc(x.why) : ''}<br>
      ${esc(x.model)} · ${(x.ms / 1000).toFixed(1)}s · ${money(x.cost)} · <a href="${x.src}" download="${o.id}-${x.sceneIdx}.png">Download</a>
      <details class="inline"><summary>exact image prompt</summary><pre>${esc(x.prompt)}</pre></details></figcaption></figure>`).join('') : '<div class="placeholder">No image yet</div>';
  renderContactSheet();
}

function renderContactSheet() {
  let el = $('contactSheet');
  if (!el) { el = document.createElement('div'); el.id = 'contactSheet'; $('tab-office').appendChild(el); }
  const all = PACK.offices.flatMap((o) => (imgs[o.id] || []).map((x) => ({ ...x, oname: o.name })));
  el.innerHTML = all.length ? `<h3 class="section-h">Contact sheet <span class="muted small">— every illustration generated this session · all AI-generated</span></h3>
    <div class="sheet">${all.map((x) => `<figure><img src="${x.src}" alt=""><figcaption class="small"><span class="badge ai sm">AI</span> ${esc(x.oname)} · scene ${x.sceneIdx}</figcaption></figure>`).join('')}</div>` : '';
}

/* ---------------- boot ---------------- */
(window.DATAPACK ? Promise.resolve(window.DATAPACK) : fetch('data/datapack.json').then((r) => r.json())).then((pack) => {
  PACK = pack;
  renderMeasureCards(); setupCompare(); renderOfficeCards(); renderCost();
}).catch((e) => { document.querySelector('main').innerHTML = `<div class="error">Could not load data/datapack.json (${esc(e.message)}). Serve this folder with <code>python -m http.server 8000</code> instead of opening the file directly.</div>`; });
