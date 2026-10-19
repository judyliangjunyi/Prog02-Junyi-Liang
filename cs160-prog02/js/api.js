/* api.js — every call to OpenRouter goes through here.
 *
 * WHERE THE API KEY GOES (for graders):
 *   Option A: paste it into the "OpenRouter key" field in the page header (saved in this browser's localStorage).
 *   Option B: copy js/config.local.example.js to js/config.local.js and paste the key there (gitignored).
 * The key is never written into any committed file.
 */

const IMAGE_MODEL = 'google/gemini-2.5-flash-image';
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

function getKey() {
  const typed = document.getElementById('apiKey').value.trim();
  if (typed) return typed;
  if (typeof OPENROUTER_API_KEY !== 'undefined' && !OPENROUTER_API_KEY.startsWith('YOUR_')) return OPENROUTER_API_KEY;
  return '';
}
function currentModel() { return document.getElementById('model').value; }

/* ---------- Cost ledger: exact cost from usage.cost on every reply ---------- */
const ledger = { session: [], allTime: LS.get('represent.allTimeCost', 0) };

function recordCost(op, model, usage, ms) {
  const cost = Number(usage?.cost || 0);
  ledger.session.push({ op, model, tokens: (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0), ms, cost });
  ledger.allTime += cost;
  LS.set('represent.allTimeCost', ledger.allTime);
  renderCost();
  return cost;
}

function renderCost() {
  const total = ledger.session.reduce((s, r) => s + r.cost, 0);
  document.getElementById('costTotal').textContent = '$' + total.toFixed(4);
  document.getElementById('costCalls').textContent = ledger.session.length + (ledger.session.length === 1 ? ' call' : ' calls');
  const tb = document.querySelector('#costTable tbody');
  tb.innerHTML = ledger.session.slice().reverse().map((r) =>
    `<tr><td>${esc(r.op)}</td><td>${esc(r.model.split('/')[1])}</td><td>${r.tokens.toLocaleString()}</td><td>${(r.ms / 1000).toFixed(1)}s</td><td>$${r.cost.toFixed(5)}</td></tr>`).join('');
  document.getElementById('costAll').textContent = `All sessions in this browser: $${ledger.allTime.toFixed(4)} of the $5.00 cap.`;
}

/* ---------- Cache: same request never costs twice ---------- */
function cacheGet(key) { return LS.get('represent.cache.' + key, null); }
function cacheSet(key, val) { LS.set('represent.cache.' + key, val); }

/* ---------- Text call ---------- */
async function askModel(prompt, { op = 'text', json = false, model = currentModel() } = {}) {
  const key = getKey();
  if (!key) throw new Error('No API key. Paste your OpenRouter key into the field at the top right.');
  const t0 = performance.now();
  const body = { model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 };
  if (json) body.response_format = { type: 'json_object' };
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, 'X-Title': 'Represent CS160' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || res.statusText);
  const ms = performance.now() - t0;
  const cost = recordCost(op, model, data.usage, ms);
  const text = data.choices?.[0]?.message?.content || '';
  let parsed = null;
  if (json) parsed = parseJSONLoose(text);
  return { text, json: parsed, cost, ms, model, at: new Date().toISOString() };
}

function parseJSONLoose(text) {
  const t = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw new Error('The model did not return valid JSON. This happens — press regenerate. (Logged as a failure.)');
}

/* ---------- Image call ---------- */
async function makeImage(prompt, op = 'image') {
  const key = getKey();
  if (!key) throw new Error('No API key. Paste your OpenRouter key into the field at the top right.');
  const t0 = performance.now();
  const res = await fetch('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, 'X-Title': 'Represent CS160' },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, aspect_ratio: '3:2' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || res.statusText);
  const ms = performance.now() - t0;
  const cost = recordCost(op, IMAGE_MODEL, data.usage, ms);
  const img = data.data[0];
  return { src: `data:${img.media_type || 'image/png'};base64,${img.b64_json}`, cost, ms, model: IMAGE_MODEL, at: new Date().toISOString() };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
