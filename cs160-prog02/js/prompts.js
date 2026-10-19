/* prompts.js — every prompt template and design constant in one place,
 * so the report's prompt appendix can be copied straight from this file. */

const LEVELS = [
  { id: 'aswritten', name: 'As written', target: 'certified text', lo: null, hi: null },
  { id: 'plain', name: 'Plain English', target: 'grade 11–13', lo: 11, hi: 13,
    style: 'Reads like a newspaper editorial. Keep technical terms but define each one the first time it is used.' },
  { id: 'everyday', name: 'Everyday', target: 'grade 7–9', lo: 7, hi: 9,
    style: 'Short sentences and common words. Leave nothing undefined.' },
  { id: 'simplest', name: 'Simplest', target: 'grade 3–4', lo: 3, hi: 4,
    style: 'Write for an elementary-school reader. Use a short, relatable story (for example a family, a neighbor, a town) to explain what the law would do. Very short sentences and very simple words.' },
];

const LENGTHS = [
  { id: 'headline', name: 'Headline', target: '25 words or fewer', lo: 1, hi: 25 },
  { id: 'short', name: 'Short', target: '75–100 words', lo: 75, hi: 100 },
  { id: 'standard', name: 'Standard', target: '250–300 words', lo: 250, hi: 300 },
  { id: 'complete', name: 'Complete', target: 'no cap', lo: null, hi: null },
];

/* Qualifiers that limit scope, size or duration. If the legal text contains one and the
 * rendering drops it, the interface flags it (no AI involved in the check). */
const QUALIFIERS = ['one-time', 'one time', 'billion', 'million', 'percent', '%', 'repeal', 'except', 'unless',
  'only', 'not ', 'two-thirds', 'majority', 'temporary', 'exempt', 'limit', 'prohibit'];

/* ---------- Feature 1: render a measure ---------- */
function measurePrompt(measure, level, length) {
  const lenRule = length.hi === null
    ? 'Length: no word limit. Cover every provision of the law, in order.'
    : `Length: ${length.target}. This is a hard limit — count your words.`;
  return `You rewrite California ballot measure legal text so an ordinary voter can understand it.

RULES
- Use ONLY the legal text below. Do not add facts, numbers, opinions, predictions, or anything you know from outside the text.
- Do not say whether the measure is good or bad, and do not tell anyone how to vote.
- Target reading level: U.S. school grade ${level.lo}–${level.hi} (Flesch–Kincaid). ${level.style}
- ${lenRule}
- Keep every qualifier that limits scope, amount, or duration (for example "one-time", dollar thresholds, percentages, exceptions, "only", "unless"). If the length limit makes that hard, drop detail, NOT qualifiers.
- Text inside [DELETED: ...] is existing law that this measure REMOVES. If the measure repeals something, say clearly what is being repealed.
- After each sentence or point, cite the section it comes from in square brackets, like [Sec. 3]. (Skip citations for a Headline of 25 words or fewer.)
- Output plain text only. No markdown headings, no bullet symbols, no preamble like "Here is".

${measure.label} — FULL LEGAL TEXT:
${measure.fullText}`;
}

/* ---------- Feature 1b: topics of concern ---------- */
const TOPICS = [
  { id: 'taxes', label: 'My Taxes', covers: 'Taxes & spending, including how public money is spent',
    words: ['tax', 'taxes', 'taxpayer', 'taxpayers', 'revenue', 'revenues', 'fund', 'funds', 'funding', 'appropriation', 'appropriated', 'appropriate', 'budget', 'spending', 'expenditure', 'fee', 'fees', 'assessment', 'bond', 'bonds'],
    why: 'Words for money coming in (tax, revenue, fee, assessment) and money going out (fund, appropriate, expenditure, budget).' },
  { id: 'home', label: 'My Home', covers: 'Rent & housing costs, including renting and owning',
    words: ['housing', 'home', 'homes', 'homeowner', 'homeowners', 'mortgage', 'rent', 'rents', 'rental', 'renter', 'renters', 'tenant', 'tenants', 'landlord', 'landlords', 'residential', 'apartment', 'apartments', 'dwelling', 'dwellings', 'property tax'],
    why: 'The handout\'s list, plus plurals. "Property" alone was excluded because legal text uses it for every kind of asset.' },
  { id: 'health', label: 'My Health and Schools', covers: 'Your health, and help for families & schools',
    words: ['health', 'medical', 'medi-cal', 'hospital', 'hospitals', 'clinic', 'clinics', 'patient', 'patients', 'school', 'schools', 'student', 'students', 'education', 'teacher', 'teachers', 'child', 'children', 'family', 'families', 'college'],
    why: 'Health-care delivery words and education words; "care" alone was excluded because it matches "child care" and "duty of care".' },
  { id: 'neighborhood', label: 'My Neighborhood', covers: 'Local services & environment, including water and roads',
    words: ['local', 'city', 'cities', 'county', 'counties', 'water', 'road', 'roads', 'street', 'transit', 'park', 'parks', 'environment', 'environmental', 'pollution', 'wildfire', 'infrastructure', 'neighborhood', 'community'],
    why: 'Local-government words and physical-environment words (water, roads, parks, wildfire).' },
  { id: 'vote', label: 'My Vote and My Say', covers: 'Elections & your vote',
    words: ['vote', 'voter', 'voters', 'voting', 'election', 'elections', 'ballot', 'candidate', 'candidates', 'campaign', 'campaigns', 'initiative', 'referendum', 'electorate', 'public comment', 'hearing'],
    why: 'Election words, plus "public comment" and "hearing" because those are how voters have a say between elections.' },
];

function topicPrompt(measure, topic) {
  return `A voter wants to know what a California ballot measure means for one topic: "${topic.label}" (${topic.covers}).

Return JSON only, in exactly this shape:
{
  "says": [ { "point": "one plain-English sentence", "quote": "exact words copied from the legal text", "section": "Sec. N" } ],
  "silent": "one sentence on what the text does NOT say about this topic",
  "opinion": "under 70 words: your own view of whether this looks good, bad, or mixed for this topic and why",
  "lean": "favorable" | "unfavorable" | "mixed"
}

RULES
- "says": up to 3 points, using ONLY the legal text below. Each "quote" must be copied word-for-word from the text (under 25 words).
- If the text says little or nothing about this topic, return an empty "says" list and say so in "silent". Do not stretch.
- "opinion" is clearly YOUR opinion. Do not tell the voter how to vote.
- Everyday reading level (grade 7–9). Text in [DELETED: ...] is being removed from the law.

${measure.label} FULL LEGAL TEXT:
${measure.fullText}`;
}

/* ---------- Feature 2: compare the two sides ---------- */
const DIMENSIONS = [
  { id: 'does', name: 'What the measure does' },
  { id: 'money', name: 'Money: cost, revenue, taxes' },
  { id: 'who', name: 'Who is affected' },
  { id: 'trust', name: 'Accountability & risks' },
];

function comparePrompt(measure) {
  const a = measure.arguments;
  const doc = (k, name) => `=== ${name} (key: ${k}) ===\n${a[k].text}`;
  return `Below are the four printed documents for ${measure.label} in the California voter guide:
the YES side's Argument in Favor, the NO side's Rebuttal to it, the NO side's Argument Against, and the YES side's Rebuttal to that.

Extract each side's main claims for these four dimensions: ${DIMENSIONS.map((d) => `"${d.id}" (${d.name})`).join(', ')}.

Return JSON only, in exactly this shape:
{
  "dimensions": [
    {
      "id": "does" | "money" | "who" | "trust",
      "yes": null OR { "claim": "neutral one-sentence paraphrase", "quote": "exact words copied from that side's document, under 25 words", "source": "argumentInFavor" | "rebuttalToAgainst", "answered": true | false },
      "no":  null OR { "claim": "...", "quote": "...", "source": "argumentAgainst" | "rebuttalToFavor", "answered": true | false }
    }
  ]
}

RULES
- Use null when that side never makes a claim on that dimension. Do NOT invent a claim to fill the cell.
- "source": the document where the claim FIRST appears. If it first appears in a rebuttal, use the rebuttal's key.
- "answered": true only if the OTHER side's rebuttal directly responds to this claim.
- Paraphrase neutrally. Never say which side is correct. Do not add facts that are not in the documents.
- "quote" must be copied character-for-character from the document.

${doc('argumentInFavor', 'ARGUMENT IN FAVOR — YES side')}

${doc('rebuttalToFavor', 'REBUTTAL TO ARGUMENT IN FAVOR — NO side')}

${doc('argumentAgainst', 'ARGUMENT AGAINST — NO side')}

${doc('rebuttalToAgainst', 'REBUTTAL TO ARGUMENT AGAINST — YES side')}`;
}

/* ---------- Feature 3: explain an office ---------- */
function officePrompt(office) {
  const extra = office.additionalContext.map((c) => `- ${c.fact}`).join('\n');
  return `Explain a local elected office to a voter in Berkeley, California, at an everyday reading level (grade 7–9).

THE ONLY FACTS YOU MAY USE (from the class handout):
Office: ${office.name}
Jurisdiction: ${office.jurisdiction}
What it decides: ${office.description}
${extra ? 'Additional facts:\n' + extra : ''}

Return JSON only, in exactly this shape:
{
  "headline": "short title, under 8 words",
  "intro": "2 sentences that make a voter care, using a concrete everyday moment in Berkeley",
  "decides": ["3 short items: what this office controls, each traceable to the facts above"],
  "doesNotControl": [ { "item": "something voters often assume this office controls but it does not", "basis": "handout" | "scope" } ],
  "whyItMatters": "1–2 sentences"
}

RULES
- "decides" must come only from the facts above. Do not add powers, numbers, names, or history.
- "doesNotControl": 2–3 items. Use "basis": "handout" when the facts above state the boundary directly; use "basis": "scope" when it follows only from the office's stated jurisdiction or subject (e.g. a transit board does not set water rates). Never name a real person.
- Do not mention any candidate. Do not tell anyone how to vote.`;
}

/* ---------- Feature 3b: illustrations ---------- */
const SCENES = {
  'berkeley-rent-board': ['renters touring a sunny Berkeley apartment with a property manager', 'a tenant and landlord looking over a lease at a kitchen table', 'a repair person fixing a leaky faucet in an older Berkeley apartment', 'a family carrying moving boxes up the steps of a brown-shingle duplex', 'roommates opening a rent-increase envelope in their shared living room', 'a row of colorful Berkeley apartment buildings at dusk with lit windows'],
  'ac-transit-ward-1': ['a green-and-white city bus pulling up to a stop on a tree-lined Berkeley avenue', 'riders boarding a bus with bikes on the front rack', 'a bus stop shelter at dawn with a few commuters waiting', 'a bus driver\'s view of a busy East Bay street through the windshield', 'students with backpacks stepping off a bus near a campus-area street', 'a bus route map on a stop pole with a bus approaching in the distance'],
  'bart-director': ['a regional commuter train arriving at an elevated outdoor station', 'commuters on a train platform at rush hour', 'a train crossing a long bridge over the bay at sunset', 'maintenance workers in vests inspecting rail tracks', 'a station faregate area with riders tapping transit cards', 'the inside of a quiet train car late at night with a few seated riders'],
  'ebmud-director': ['a reservoir in the East Bay hills on a clear morning', 'a backyard garden with drought-tolerant plants and a drip line', 'water utility workers repairing a pipe under a residential street', 'a kitchen faucet filling a glass of water', 'a large water treatment facility with settling basins', 'a dry hillside and a half-full reservoir during a drought'],
  'peralta-ccd-trustee': ['a community college classroom with adult students of different ages', 'students studying in a modern downtown college library', 'a welding or nursing training lab at a community college', 'a college counselor helping a student plan classes', 'students walking into a mid-rise city college building downtown', 'an evening class with working adults taking notes'],
};

function scenePickPrompt(office, used) {
  const list = SCENES[office.id].map((s, i) => `${i}: ${s}`).join('\n');
  return `Pick ONE scene that best shows a voter what the "${office.name}" affects in everyday life.
Avoid these already-used numbers if possible: [${used.join(', ')}].
Scenes:
${list}
Return JSON only: {"scene": <number>, "why": "under 15 words"}`;
}

/* The image prompt template. The rules are fixed; only the scene changes. */
function imagePrompt(office, scene) {
  return `Editorial illustration in a warm, flat, mid-century gouache style with soft paper texture and a limited palette of muted teal, ochre, and cream.
Scene: ${scene}, in Berkeley / the East Bay, California.
It should help a voter picture what the ${office.name} affects in daily life.
RULES: No text, letters, numbers, signs, logos, or brand names anywhere in the image. No ballots, voting booths, flags, seals, or anything that could look like official election material.
People, if any, are small, invented, ordinary community members of varied ages and backgrounds, seen at a distance or from behind; no close-up faces and no one who resembles a real person or politician.`;
}
