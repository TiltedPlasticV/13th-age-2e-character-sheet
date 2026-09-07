// Script for 13th_Age_Character_Sheet.html. A classic script, not a module:
// modules are fetched under CORS rules and would not load off disk. It runs
// from the end of <body>, so the markup is parsed by the time the init at the
// bottom of this file runs, and it shares the global script scope with the
// class files in classes/.

// Sentinel for the missing-file guard at the end of the HTML. Nothing reads it
// but that guard — leave it in place.
var SHEET_JS_LOADED = true;

let state = {
  fields: {},
  checkboxes: {},
  backgrounds: [],
  icons: [],
  // The ability lists, all the same row shape: kin powers, class features
  // and talents are always on the sheet; `powers` and `spells` are the
  // class-dependent third section (see CLASS_ABILITY_SECTION).
  kinPowers: [],
  features: [],
  talents: [],
  powers: [],
  spells: [],
  feats: [],
  advances: {},
  locks: {},
  activeConditions: {},
  escalation: 0,
  // Per-class bucket for class-module state that isn't a `data-field` input
  // (toggles, counters). Keyed by class and never deleted on a class switch
  // — see the CLASS MODULES block for the data-retention contract.
  classData: {},
  theme: 'necromancer',
  // Display preferences under one key, so the next one doesn't need
  // threading through the load and reset paths. Settings, not character
  // data: like the theme, they survive "New Sheet". See PREF_SWITCHES.
  // `collapsed` is a set of data-section (or data-section-group) keys, not a
  // list of every section: absent means open, so one added later opens by
  // default.
  prefs: { animations: true, diceRoller: true, battleHelper: false, battleHelperOpen: true, collapsed: {} }
};

// ── AUTO-DERIVED FIELDS ───────────────────────────────────────────────
// Each entry: calc(fields) returns the computed value (string), or ''
// if the source is missing. The user can override any of these by typing
// into the field (auto-locks) or by clicking the lock icon.
function intOrNull(v) {
  if (v === '' || v === undefined || v === null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}
function intOrZero(v) { const n = intOrNull(v); return n === null ? 0 : n; }
function signed(n) { return (n >= 0 ? '+' : '') + n; }

function abilityMod(score) {
  const s = intOrNull(score);
  if (s === null) return '';
  return signed(Math.floor((s - 10) / 2));
}

// Parses "2d10 + 4", "2d10+4", "5d8 - 1", "3d6". Returns null if unparseable.
function parseRecoveryDice(str) {
  if (!str) return null;
  const m = String(str).replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!m) return null;
  return { count: +m[1], sides: +m[2], bonus: m[3] ? +m[3] : 0 };
}
// Average of "NdX+B": N * (X+1) / 2 + B. Round down for table convenience.
// Shared by recovery dice and weapon-damage averages — any "NdX+B" string.
function diceAvg(diceStr) {
  const d = parseRecoveryDice(diceStr);
  if (!d) return '';
  return Math.floor(d.count * (d.sides + 1) / 2) + d.bonus;
}
function recoveryAvg(diceStr) { return diceAvg(diceStr); }

// ── CLASS ROSTER ──────────────────────────────────────────────────────
// Everything class-specific lives in `classes/<name>.js`, loaded the first
// time that class is selected (see the CLASS MODULES block). All the sheet
// needs up front is which classes *exist*, so the dropdown can be built
// before any file has loaded. To add one: add the name here and drop the
// file in beside this one — a copy of `classes/_template.js`.
const CLASS_ROSTER = [
  'barbarian', 'bard', 'cleric', 'commander', 'druid', 'fighter', 'monk',
  'necromancer', 'occultist', 'paladin', 'ranger', 'rogue', 'sorcerer', 'wizard',
];

// ── THIRD ABILITY SECTION ─────────────────────────────────────────────
// After Class Features and Talents, casters get Spells, rogues and fighters
// get the same list under their own name, and a class with no third kind of
// ability shows nothing.
//   list:  which state array / section — 'spells' or 'powers'
//   label: the section heading
//   noun:  singular, for the add button ('+ Add Maneuver')
// Kept here rather than in the class modules: it must be known before any
// class file loads, so a player without `classes/rogue.js` still sees
// Powers. Neither list is ever cleared — a class switch only hides rows.
const CLASS_ABILITY_SECTION = {
  bard:        { list: 'spells', label: 'Spells & Songs', noun: 'Spell' },
  cleric:      { list: 'spells', label: 'Spells',         noun: 'Spell' },
  necromancer: { list: 'spells', label: 'Spells',         noun: 'Spell' },
  sorcerer:    { list: 'spells', label: 'Spells',         noun: 'Spell' },
  wizard:      { list: 'spells', label: 'Spells',         noun: 'Spell' },
  fighter:     { list: 'powers', label: 'Maneuvers',      noun: 'Maneuver' },
  rogue:       { list: 'powers', label: 'Powers',         noun: 'Power' },
};

// Level → HP multiplier (13th Age 2e). Levels outside 1–10 have no entry,
// so max HP stays blank/manual until level is a valid 1–10.
const HP_LEVEL_MULT = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 8, 6: 10, 7: 12, 8: 16, 9: 20, 10: 24 };

// max HP = (class baseHp + Con mod) × level multiplier. Blank (and so
// freely editable) until both the class module and a 1–10 level are known.
function maxHpCalc(f) {
  const ci = getClassInfo(f.class);
  if (!ci || ci.baseHp == null) return '';
  const mult = HP_LEVEL_MULT[intOrNull(f.level)];
  if (mult === undefined) return '';
  return (ci.baseHp + intOrZero(f.con_mod)) * mult;
}

// Recovery dice: one die per level, plus Con mod — doubled from 5th level
// and quadrupled from 8th. Both class-varying parts ride in the class
// module: `recoveryDie`, and `recoveryConScales: false` for a class whose
// Con mod stays flat (the necromancer).
//
// Produces an expression ("5d8+6"), not a number — that's what the Roll
// Recovery button and the Avg field parse. With no `recoveryDie` the field
// stays blank and hand-typed.
function recoveryConMult(lvl, ci) {
  if (ci && ci.recoveryConScales === false) return 1;
  return lvl >= 8 ? 4 : lvl >= 5 ? 2 : 1;
}

function recoveryDiceCalc(f) {
  const ci = getClassInfo(f.class);
  if (!ci || ci.recoveryDie == null) return '';
  const lvl = intOrNull(f.level);
  if (lvl === null || lvl < 1 || lvl > 10) return '';
  const bonus = intOrZero(f.con_mod) * recoveryConMult(lvl, ci);
  return lvl + 'd' + ci.recoveryDie + (bonus === 0 ? '' : signed(bonus));
}

// A class's base numbers arrive with its file, so this is null until that
// loads. Every calc treats null as "leave the field blank and editable", so
// a missing class file degrades to a manual sheet.
function getClassInfo(className) {
  return CLASS_MODULES[className] || null;
}

// Fill the class <select> from the roster. Labels are the capitalized key.
function populateClassOptions() {
  const sel = document.querySelector('select[data-field="class"]');
  if (!sel) return;
  sel.appendChild(el('option', { value: '' }, 'Class…'));
  CLASS_ROSTER.forEach(key => {
    sel.appendChild(el('option', { value: key }, key[0].toUpperCase() + key.slice(1)));
  });
}

// 13A defenses use the *middle* of three ability mods (the median).
function middleMod(a, b, c) {
  return [a, b, c].sort((x, y) => x - y)[1];
}

// Shared shape for AC/PD/MD: class base + middle of three mods + level.
// Returns '' (blank, stays editable) when the class is unknown, or when
// there's nothing to compute from yet (no level and no relevant mods).
function defenseCalc(f, defenseKey, modA, modB, modC) {
  const ci = getClassInfo(f.class);
  if (!ci || !ci.defenses) return '';
  const lvl = intOrNull(f.level);
  const haveMod = [modA, modB, modC].some(k => intOrNull(f[k]) !== null);
  if (lvl === null && !haveMod) return '';
  const mid = middleMod(intOrZero(f[modA]), intOrZero(f[modB]), intOrZero(f[modC]));
  return ci.defenses[defenseKey] + mid + intOrZero(f.level);
}

// Order matters: dependents come after their sources so one pass resolves
// chains like dex_score → dex_mod → initiative. `sources` lists the fields
// each calc reads and gates recomputation (typing in `notes` shouldn't walk
// this table), so keep it in sync with `calc` — that's the contract.
const DERIVED_FIELDS = {
  str_mod:      { sources: ['str_score'], calc: f => abilityMod(f.str_score) },
  dex_mod:      { sources: ['dex_score'], calc: f => abilityMod(f.dex_score) },
  con_mod:      { sources: ['con_score'], calc: f => abilityMod(f.con_score) },
  wis_mod:      { sources: ['wis_score'], calc: f => abilityMod(f.wis_score) },
  int_mod:      { sources: ['int_score'], calc: f => abilityMod(f.int_score) },
  cha_mod:      { sources: ['cha_score'], calc: f => abilityMod(f.cha_score) },
  initiative:   { sources: ['dex_mod', 'level'], calc: f => {
    const dex = intOrNull(f.dex_mod);
    const lvl = intOrNull(f.level);
    if (dex === null && lvl === null) return '';
    return signed(intOrZero(f.dex_mod) + intOrZero(f.level));
  }},
  // Per-class base from CLASS_INFO. Defined before staggered/dead so they
  // resolve off the fresh max_hp in the same recompute pass.
  max_hp:       { sources: ['class', 'level', 'con_mod'], calc: f => maxHpCalc(f) },
  staggered:    { sources: ['max_hp'], calc: f => {
    const hp = intOrNull(f.max_hp);
    return hp === null ? '' : Math.floor(hp / 2);
  }},
  dead:         { sources: ['max_hp'], calc: f => {
    const hp = intOrNull(f.max_hp);
    return hp === null ? '' : -Math.floor(hp / 2);
  }},
  // Before recovery_avg, so the average sees the fresh expression.
  recovery_dice: { sources: ['class', 'level', 'con_mod'], calc: f => recoveryDiceCalc(f) },
  recovery_avg: { sources: ['recovery_dice'], calc: f => recoveryAvg(f.recovery_dice) },
  // Average weapon damage from the hit-damage formula (e.g. "1d8+4" → 8).
  melee_avg:    { sources: ['melee_damage'],  calc: f => diceAvg(f.melee_damage) },
  ranged_avg:   { sources: ['ranged_damage'], calc: f => diceAvg(f.ranged_damage) },
  // 13A 2e: a basic *melee* attack misses for damage equal to your level.
  // Ranged miss damage stays manual — it's usually none, and the classes
  // that do get it (or a different melee value) override via their module.
  melee_miss:   { sources: ['level'], calc: f => {
    const lvl = intOrNull(f.level);
    return lvl === null ? '' : lvl;
  }},
  // Defenses take their base from the class module. The *_mod sources are
  // themselves derived, but are defined above and so already fresh here.
  ac: { sources: ['class', 'level', 'con_mod', 'dex_mod', 'wis_mod'],
        calc: f => defenseCalc(f, 'ac', 'con_mod', 'dex_mod', 'wis_mod') },
  pd: { sources: ['class', 'level', 'str_mod', 'con_mod', 'dex_mod'],
        calc: f => defenseCalc(f, 'pd', 'str_mod', 'con_mod', 'dex_mod') },
  md: { sources: ['class', 'level', 'int_mod', 'wis_mod', 'cha_mod'],
        calc: f => defenseCalc(f, 'md', 'int_mod', 'wis_mod', 'cha_mod') },
  // 13A 2e: attunement limit equals character level.
  max_magic: { sources: ['level'], calc: f => {
    const lvl = intOrNull(f.level);
    return lvl === null ? '' : lvl;
  }},
};
// The *active* derived set: DERIVED_FIELDS plus the current class module's
// (see refreshDerivedIndex). Everything downstream reads these, so a class
// field behaves exactly like a built-in one.
let DERIVED = DERIVED_FIELDS;
let DERIVED_KEYS = Object.keys(DERIVED);
let DERIVED_SOURCES = new Set(Object.values(DERIVED).flatMap(d => d.sources));

// Class entries are merged *after* the base ones, so a class calc can read
// a base derived value that resolves earlier in the same recompute pass.
function refreshDerivedIndex() {
  const mod = activeClassModule();
  DERIVED = (mod && mod.derived) ? Object.assign({}, DERIVED_FIELDS, mod.derived) : DERIVED_FIELDS;
  DERIVED_KEYS = Object.keys(DERIVED);
  DERIVED_SOURCES = new Set(Object.values(DERIVED).flatMap(d => d.sources));
}

function recomputeDerived() {
  DERIVED_KEYS.forEach(key => {
    if (state.locks[key]) return;
    const newVal = String(DERIVED[key].calc(state.fields));
    state.fields[key] = newVal;
    const el = document.querySelector(`[data-field="${key}"]`);
    if (el && el.value !== newVal) el.value = newVal;
  });
  updateTierBadge();
  updateHpStatus();
}

// Display-only tier label next to the character name.
// 13A 2e tiers: 1–4 Adventurer, 5–7 Champion, 8+ Epic. Ordered high → low
// so the first matching `min` wins on `.find()`.
const TIERS = [
  { min: 8, label: 'Epic',       icon: '👑' },
  { min: 5, label: 'Champion',   icon: '⚔' },
  { min: 1, label: 'Adventurer', icon: '🗡' },
];
function updateTierBadge() {
  const badge = document.getElementById('tier-badge');
  if (!badge) return;
  badge.innerHTML = '';
  const lvl = parseInt(state.fields.level, 10);
  if (isNaN(lvl)) return;
  const tier = TIERS.find(t => lvl >= t.min);
  if (!tier) return;
  badge.append(
    el('span', { class: 'tier-badge-icon', 'aria-hidden': 'true' }, tier.icon),
    el('span', {}, tier.label)
  );
}

function setLockVisual(toggleEl, inputEl, locked) {
  toggleEl.textContent = locked ? '🔒' : '🔓';
  toggleEl.classList.toggle('locked', locked);
  toggleEl.setAttribute('aria-checked', locked ? 'true' : 'false');
  toggleEl.title = locked
    ? 'Manually set — click to use the auto-calculated value'
    : 'Auto-calculated — typing or clicking here locks it';
}

function initLocks() {
  DERIVED_KEYS.forEach(key => {
    const input = document.querySelector(`[data-field="${key}"]`);
    if (!input || input.parentNode.classList.contains('has-lock')) return;
    const wrap = document.createElement('span');
    wrap.className = 'has-lock';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const toggle = document.createElement('span');
    toggle.className = 'lock-toggle';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('tabindex', '0');
    toggle.setAttribute('aria-label', `Lock ${key.replace(/_/g, ' ')} to manual value`);
    wrap.appendChild(toggle);
    setLockVisual(toggle, input, !!state.locks[key]);
    toggle.addEventListener('click', () => {
      if (state.locks[key]) {
        delete state.locks[key];
        setLockVisual(toggle, input, false);
        recomputeDerived();
      } else {
        state.locks[key] = true;
        setLockVisual(toggle, input, true);
      }
      saveNow();
    });
    // Typing into a derived field auto-locks it.
    input.addEventListener('input', () => {
      if (!state.locks[key]) {
        state.locks[key] = true;
        setLockVisual(toggle, input, true);
        saveNow();
      }
    });
  });
}

// ── DISPLAY PREFERENCES ──
// Each preference is one body class the stylesheet reacts to, so switching
// it off changes nothing but CSS and switching it back needs no repair.
// Deliberately out of the roll and animation code paths.
const PREF_SWITCHES = {
  animations: {
    id: 'pref-animations', bodyClass: 'no-anim',
    on: 'Animations on', off: 'Animations off',
  },
  diceRoller: {
    id: 'pref-dice-roller', bodyClass: 'no-dice',
    on: 'Dice roller on', off: 'Dice roller hidden',
  },
  battleHelper: {
    id: 'pref-battle-helper', bodyClass: 'no-battle-helper',
    on: 'Battle helper on', off: 'Battle helper off',
  },
};

// A missing or malformed `prefs` reads as all-on, so a sheet saved before
// these switches existed loads with the behaviour it was written with.
function normalizePrefs(s) {
  const p = (s && s.prefs && typeof s.prefs === 'object') ? s.prefs : {};
  s.prefs = {
    animations: p.animations !== false,
    diceRoller: p.diceRoller !== false,
    // The odd one out: opt-in rather than opt-out, so a sheet saved before
    // the panel existed doesn't load with something new covering its edge.
    battleHelper: p.battleHelper === true,
    // The rail is only reachable while the module is on, so a stored
    // "collapsed" from a sheet where it is off cannot be a choice anyone
    // made — and an opt-in panel that arrives as a bare 30px rail is one
    // nobody finds. So the collapse is remembered only alongside the module
    // being on, which makes the first switch-on arrive expanded without
    // needing a "have they seen it yet" flag that old saves wouldn't carry.
    battleHelperOpen: p.battleHelper === true ? p.battleHelperOpen !== false : true,
    collapsed: (p.collapsed && typeof p.collapsed === 'object') ? p.collapsed : {},
  };
}

function applyPrefs() {
  if (!state.prefs) normalizePrefs(state);
  Object.entries(PREF_SWITCHES).forEach(([key, cfg]) => {
    const on = state.prefs[key] !== false;
    document.body.classList.toggle(cfg.bodyClass, !on);
    const sw = document.getElementById(cfg.id);
    if (!sw) return;
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  renderBattleHelper();
}

// ── BATTLE HELPER ──
// The panel's own open/collapsed state, kept apart from the switch that
// makes it exist at all: turning the module off and back on brings it back
// the way it was left. The panel is never open while hidden.
function renderBattleHelper() {
  if (!state.prefs) normalizePrefs(state);
  const panel = document.getElementById('battle-helper');
  if (!panel) return;
  const on = state.prefs.battleHelper === true;
  const open = on && state.prefs.battleHelperOpen === true;
  panel.classList.toggle('collapsed', !open);
  const rail = document.getElementById('bh-rail');
  if (rail) rail.setAttribute('aria-expanded', open ? 'true' : 'false');
  const caret = document.getElementById('bh-caret');
  if (caret) caret.textContent = open ? '▸' : '◂';
  renderBattleHelperBody();
}

function toggleBattleHelper() {
  if (!state.prefs) normalizePrefs(state);
  state.prefs.battleHelperOpen = !state.prefs.battleHelperOpen;
  renderBattleHelper();
  saveNow();
}

// ── BATTLE HELPER CONTENTS ──────────────────────────────────────────
// The panel owns no state: every line in it is read back out of `state`
// and the whole body is rebuilt from scratch. That makes "keep it in step
// with the sheet" a single call from saveNow() instead of a subscription
// per widget, and it means the panel can never hold a stale copy of
// anything. Nothing in it is interactive — it reports, the sheet edits.

// Short source tag per ability list, so a line here can be traced back to
// the section it came from. The class-dependent list takes its noun from
// CLASS_ABILITY_SECTION, so a fighter's read "Maneuver".
const ABILITY_TAGS = {
  kinPowers: 'Kin', features: 'Feature', talents: 'Talent',
  powers: 'Power', spells: 'Spell',
};
function abilityTag(listKey) {
  if (listKey !== 'powers') return ABILITY_TAGS[listKey];
  const spec = CLASS_ABILITY_SECTION[currentClassKey()];
  return (spec && spec.list === 'powers') ? spec.noun : ABILITY_TAGS.powers;
}

// Only one of the two class-dependent lists is on the sheet at a time — a
// rogue has Powers and no Spells — so the panel shows exactly what
// applyAbilitySections() does. Spells left in the save data from a previous
// class are hidden by that, not cleared: switch back and they return, here
// and on the sheet alike.
function abilityListVisible(listKey) {
  if (listKey !== 'spells' && listKey !== 'powers') return true;
  const spec = CLASS_ABILITY_SECTION[currentClassKey()];
  return !!spec && spec.list === listKey;
}

// Unticked boxes on one ability row. Level 0 deletes its key, so an unspent
// use is simply an absent one; useLevel also reads the old boolean form.
function unspentUses(item) {
  const total = usageUses(item);
  let left = 0;
  for (let u = 0; u < total; u++) if (!useLevel(item.used && item.used[u], 2)) left++;
  return left;
}

// Every per-battle / per-arc use still unspent, in sheet order.
// Two rows are deliberately absent:
//   • an unprepared spell — it can't be cast, so it isn't available;
//   • a nameless row — there would be nothing to show, and a row being
//     typed shouldn't flicker into the list a character at a time.
function availableAbilities() {
  const out = [];
  ABILITY_LISTS.forEach(key => {
    if (!abilityListVisible(key)) return;
    (state[key] || []).forEach(item => {
      // An At-Will row has no tracker to read — it is simply always there —
      // so it lists unconditionally, under its own heading. A Passive row
      // isn't an action at all and never lists.
      const track = usageMode(item) === 'atwill' ? 'atwill' : usageTrack(item);
      if (!track) return;
      if (key === 'spells' && item.prepared === false) return;
      // A skill check or a bit of roleplay isn't something to reach for
      // mid-fight.
      if (isOutOfBattle(item)) return;
      const name = (item.name || '').trim();
      if (!name) return;
      const row = { name, trigger: triggerMode(item), source: abilityTag(key), track };
      if (track === 'atwill') {
        out.push(Object.assign(row, { left: 1 }));
        return;
      }
      // An unspent desperate box is one more use of the same ability, so it
      // adds to the count rather than repeating the name on a second line —
      // the ☠ says one of them is the one you get back by nearly dying.
      const desperate = USAGE_MODES[usageMode(item)].desperate
        && !useLevel(item.desperate && item.desperate[0], 2);
      const left = unspentUses(item) + (desperate ? 1 : 0);
      if (left) out.push(Object.assign(row, { left, desperate }));
    });
  });
  return out;
}

// Is anything on the sheet tracked at all? Tells "you have spent
// everything" apart from "you have marked nothing as tracked yet" — the
// two empty lists want opposite advice.
function hasTrackedAbilities() {
  return ABILITY_LISTS.some(key => abilityListVisible(key)
    && (state[key] || []).some(item => usageTrack(item) && usageUses(item) > 0));
}

// A class module can add its own trackers — the barbarian's free rage start
// and its when-hit check are neither spells nor features, but they are
// exactly the kind of thing this panel exists to stop you forgetting. The
// hook returns every tracker the class owns and the panel does the
// filtering, so a class never has to know the rule.
function classAbilities() {
  const mod = activeClassModule();
  if (!mod || typeof mod.battleHelper !== 'function') return [];
  let rows = [];
  try { rows = mod.battleHelper() || []; } catch (e) { console.warn('class hook battleHelper', e); }
  const key = currentClassKey();
  const source = key ? key[0].toUpperCase() + key.slice(1) : '';
  return rows
    .filter(r => r && r.name && TRACK_TYPES[r.track] && (r.left === undefined || r.left > 0))
    .map(r => ({ name: r.name, note: r.note, title: r.title, source,
                 trigger: TRIGGERS[r.trigger] ? r.trigger : TRIGGER_DEFAULT,
                 track: r.track, left: r.left === undefined ? 1 : r.left }));
}

// ── The blocks the panel draws ──
// Each one folds away when its heading is clicked, and remembers that in
// collapsedMap() — the same store the sheet's own sections use, so it is a
// display preference that survives "New Sheet" like the theme does. The
// keys are prefixed so they can't collide with a data-section name.
//
// The fold is re-implemented here rather than borrowed from
// refreshCollapsibleSections(), which is bound to the `.section` chrome —
// border, margin, heading band — that a 290px overlay panel has no room
// for. What is worth sharing is the store and the caret, and both are.
function bhSection(key, title, children) {
  const mapKey = 'bh-' + key;
  const collapsed = !!collapsedMap()[mapKey];
  const caret = el('span', { class: 'section-caret', 'aria-hidden': 'true' },
                   collapsed ? '▸' : '▾');
  // Space/Enter reach this through the global keydown handler, which routes
  // any focused role="button" to click().
  const head = el('div', {
    class: 'bh-head', role: 'button', tabindex: '0',
    'aria-expanded': collapsed ? 'false' : 'true',
    title: 'Click to fold this away',
  }, title, caret);
  const sec = el('div', { class: 'bh-section' + (collapsed ? ' collapsed' : '') },
                 head, children);
  head.addEventListener('click', () => {
    const now = !sec.classList.contains('collapsed');
    if (now) collapsedMap()[mapKey] = true; else delete collapsedMap()[mapKey];
    // saveNow() redraws the panel off the map just updated, so the caret and
    // the fold follow from that rather than being set twice.
    saveNow();
  });
  return sec;
}


// The actions everyone has, whatever their class. They are not on the
// sheet and carry no tick box, on purpose: a basic attack has nothing to
// spend, and rally's first use is free with every one after gated on a save
// rather than on a box, so a spent/unspent tracker would misdescribe both.
// The row states the price of a second rally; the counting is the player's,
// and the full wording is in the tooltip.
const BH_UNIVERSAL = [
  { name: 'Basic attack', trigger: 'standard', track: 'atwill' },
  { name: 'Rally', note: 'again: quick save 11+', trigger: 'standard', track: 'battle',
    title: 'Rally — standard action, once per battle for free. To rally '
         + 'again in the same battle, spend a quick action on a normal save '
         + '(11+): succeed and you may rally with this turn’s standard '
         + 'action; fail and the quick action is lost, with no retry until '
         + 'next round. No limit beyond making those saves.' },
];

// The three headings, in the order they read during a turn: what you can
// always do, then what you are spending down.
const BH_GROUPS = [
  { key: 'atwill', label: 'At-will'    },
  { key: 'battle', label: 'Per battle' },
  { key: 'arc',    label: 'Per arc'    },
];

// The tag column means one thing on every row: what the action costs you.
// It used to be where the row came from — which left the rows that come
// from nowhere in particular (a basic attack, rally) tagged with a trigger
// while everything else was tagged with a section, so the column read as
// two different things at once. The trigger is the half worth the width
// mid-fight; provenance is still a hover away.
//
// `note` is a short rules reminder living on the row itself. A row that has
// one gives it the slack instead of the name — see .bh-item.has-note.
function rowTrigger(r) { return TRIGGERS[r.trigger] ? r.trigger : TRIGGER_DEFAULT; }

function bhItem(r) {
  const trigger = TRIGGERS[rowTrigger(r)];
  return el('div', { class: 'bh-item' + (r.note ? ' has-note' : ''),
                     title: r.title || r.source || null },
    el('span', { class: 'bh-item-name' }, r.name),
    r.note ? el('span', { class: 'bh-item-note' }, r.note) : null,
    el('span', { class: 'bh-item-tag' }, trigger.short),
    r.desperate ? el('span', { class: 'bh-item-mark', title: 'Desperate use' }, '☠') : null,
    r.left > 1 ? el('span', { class: 'bh-item-count' }, '×' + r.left) : null
  );
}

function buildBhUses() {
  const rows = availableAbilities().concat(classAbilities());
  // The universal actions go in under the player's own, and are kept out of
  // `rows` so they can't stand in for having any: an otherwise empty list
  // still gets the note telling you how to fill it.
  const listed = rows.concat(BH_UNIVERSAL);
  const sec = bhSection('uses', 'Ready to use', []);
  BH_GROUPS.forEach(group => {
    const items = listed.filter(r => r.track === group.key);
    if (!items.length) return;
    sec.appendChild(el('div', { class: 'bh-group' },
      trackAnnotation(group.key), el('span', {}, group.label)));
    // Inside a cadence, rows cluster by what they cost you: every standard
    // action together, then the free ones, then the reactions. That is the
    // order TRIGGERS is declared in, so the declaration order *is* the
    // reading order and there's no second list to keep in step with it.
    // The clusters carry no heading — the tag column already names the
    // trigger on every row — so the box around them is what says they go
    // together.
    TRIGGER_KEYS.forEach(key => {
      const cluster = items.filter(r => rowTrigger(r) === key);
      if (!cluster.length) return;
      sec.appendChild(el('div', { class: 'bh-subgroup' }, cluster.map(bhItem)));
    });
  });
  if (!rows.length) {
    sec.appendChild(el('div', { class: 'note' }, hasTrackedAbilities()
      ? 'Everything is spent — take a rest.'
      : 'Abilities set to At-Will, Battle or Arc show up here.'));
  }
  return sec;
}

// Post-battle you must keep spending recoveries while you are still
// staggered, so the two numbers that decide it belong side by side: what
// you have left to spend, and how far you still have to climb.
function buildBhStatus() {
  const max = maxRecoveries();
  let spent = 0;
  for (let i = 0; i < max; i++) if (state.checkboxes['rec_' + i]) spent++;
  const left = max - spent;
  const sec = bhSection('status', 'After the battle', [
    el('div', { class: 'bh-stat' },
      el('span', { class: 'bh-stat-num' + (left ? '' : ' bh-spent') }, String(left)),
      el('span', { class: 'bh-stat-label' },
         (left === 1 ? 'recovery' : 'recoveries') + ' left'),
      el('span', { class: 'note' }, 'of ' + max))
  ]);
  sec.appendChild(bhStaggerNode());
  return sec;
}

function bhStaggerNode() {
  const cur = intOrNull(state.fields.current_hp);
  const stag = intOrNull(state.fields.staggered);
  if (cur === null || stag === null) {
    return el('div', { class: 'note' },
      'Fill in current HP and the staggered value to track this.');
  }
  const need = stag + 1 - cur;
  if (need <= 0) return el('div', { class: 'bh-ok' }, '✔ Not staggered');
  // The average is what the recovery estimate is worth — a rough count of
  // how many you are about to burn, not a promise.
  const avg = intOrNull(state.fields.recovery_avg);
  const recs = (avg !== null && avg > 0) ? Math.ceil(need / avg) : null;
  return el('div', { class: 'bh-warn' },
    el('div', { class: 'bh-warn-line' },
      (cur > 0 ? '⚠ Staggered' : '☠ Down') + ' — regain ' + need + ' HP'),
    el('div', { class: 'note' },
      'Keep spending recoveries until you are above ' + stag + ' HP'
      + (recs !== null ? ' · about ' + plural(recs, 'recovery', 'recoveries')
                       + ' at ' + avg + ' avg' : ''))
  );
}

// The one block that isn't read out of `state`: the turn structure is the
// same for everybody. It is built here anyway rather than sitting in the
// HTML, because the panel body is cleared and rebuilt on every change and
// static markup inside it would not survive the first redraw.
//
// Condensed hard — a play aid gets read mid-turn, so the end-of-turn order
// is the only part that earns numbered steps.
function buildBhTurn() {
  return bhSection('turn', 'Anatomy of a turn', [
    el('div', { class: 'bh-turn' },
      el('div', { class: 'note' }, el('b', {}, 'Start'), ' — rarely anything.'),
      el('div', { class: 'note' }, el('b', {}, 'Middle'),
         ' — 1 standard, 1 move and 1 quick action, in any order.'),
      el('div', { class: 'note' }, el('b', {}, 'End'), ' — in this order:'),
      el('ol', { class: 'note bh-turn-steps' },
        el('li', {}, 'Take any ongoing damage.'),
        el('li', {}, 'Save against ongoing damage and any other save-ends condition.'),
        el('li', {}, 'Effects you created that end this turn end now.')),
      el('div', { class: 'note' }, el('b', {}, 'Rest of round'),
         ' — 1 interrupt action, any time until your next turn starts.'))
  ]);
}

// Rebuilt whole, and only while the panel is on screen — reopening it draws
// it fresh, so there is nothing to catch up on. The body is the scrolling
// element, so its position is carried across the rebuild: an autosave
// firing mid-scroll must not throw the player back to the top.
function renderBattleHelperBody() {
  if (!state.prefs) normalizePrefs(state);
  const body = document.getElementById('bh-body');
  if (!body) return;
  if (state.prefs.battleHelper !== true || state.prefs.battleHelperOpen !== true) return;
  const scrollTop = body.scrollTop;
  body.innerHTML = '';
  // What you need mid-battle comes first; the recovery block is what you
  // read once the fighting stops, and the turn structure is reference text
  // you stop needing, so both sit under the list rather than pushing it
  // down.
  body.appendChild(buildBhUses());
  body.appendChild(buildBhStatus());
  body.appendChild(buildBhTurn());
  body.scrollTop = scrollTop;
}

// Toasted rather than logged: the log lives in the dice tray, which one of
// these switches can hide.
function togglePref(key) {
  if (!state.prefs) normalizePrefs(state);
  state.prefs[key] = state.prefs[key] === false;
  applyPrefs();
  showToast(state.prefs[key] ? PREF_SWITCHES[key].on : PREF_SWITCHES[key].off);
  saveNow();
}

// ── COLLAPSIBLE SECTIONS ────────────────────────────────────────────
// A section folds away when its heading is clicked. Which ones are folded is
// a display preference rather than character data, so it rides in
// state.prefs beside the animation and dice-roller switches and survives
// "New Sheet" for the same reason the theme does.
function collapsedMap() {
  if (!state.prefs) normalizePrefs(state);
  if (!state.prefs.collapsed) state.prefs.collapsed = {};
  return state.prefs.collapsed;
}

// Sections sharing a `data-section-group` wrapper — the half-width pair in a
// combo-row — fold together and under one key, because half a folded band
// reads as a layout bug rather than a choice.
function sectionPeers(section) {
  const group = section.closest('[data-section-group]');
  return group ? Array.from(group.querySelectorAll('.section[data-section]')) : [section];
}

function sectionKey(section) {
  const group = section.closest('[data-section-group]');
  return group ? group.dataset.sectionGroup : section.dataset.section;
}

function setSectionCollapsed(section, collapsed) {
  sectionPeers(section).forEach(peer => {
    const head = peer.querySelector('.section-head');
    const caret = head && head.querySelector('.section-caret');
    peer.classList.toggle('collapsed', collapsed);
    if (head) head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (caret) caret.textContent = collapsed ? '▸' : '▾';
    // Textareas measure zero while hidden, so the ones coming back into view
    // need re-measuring — see the zero guard in flushAutoGrow.
    if (!collapsed) peer.querySelectorAll('textarea.field-block').forEach(autoGrow);
  });
  const map = collapsedMap();
  if (collapsed) map[sectionKey(section)] = true;
  else delete map[sectionKey(section)];
}

// Wires any section not yet wired, then pushes the saved state onto all of
// them. Idempotent, so it can run again whenever new sections appear —
// a class module mounting its own, for instance.
function refreshCollapsibleSections() {
  const map = collapsedMap();
  document.querySelectorAll('.section[data-section]').forEach(section => {
    const head = section.querySelector('.section-head');
    if (!head) return;
    if (!head.dataset.collapsible) {
      head.dataset.collapsible = '1';
      head.setAttribute('role', 'button');
      head.setAttribute('tabindex', '0');
      head.title = 'Click to fold this section away';
      // Space/Enter already reach this through the global keydown handler,
      // which routes any focused role="button" to click().
      head.appendChild(el('span', { class: 'section-caret', 'aria-hidden': 'true' }, '▾'));
      head.addEventListener('click', () => {
        setSectionCollapsed(section, !section.classList.contains('collapsed'));
        saveNow();
      });
    }
    setSectionCollapsed(section, !!map[sectionKey(section)]);
  });
}

function setTheme(t) {
  document.body.setAttribute('data-theme', t);
  state.theme = t;
  document.getElementById('theme-select').value = t;
  saveNow();
}

// Show whichever third ability section the current class calls for, and
// name it. Hiding is display-only — the rows stay in state and come back
// untouched if the class changes back.
function applyAbilitySections() {
  const spec = CLASS_ABILITY_SECTION[currentClassKey()] || null;
  const kind = spec ? spec.list : '';
  document.getElementById('spells-section').style.display = kind === 'spells' ? '' : 'none';
  document.getElementById('powers-section').style.display = kind === 'powers' ? '' : 'none';
  if (kind === 'spells') {
    document.getElementById('spells-heading').textContent = spec.label;
  } else if (kind === 'powers') {
    document.getElementById('powers-heading').textContent = spec.label;
    document.getElementById('add-power-btn').textContent = '+ Add ' + spec.noun;
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// Textareas grow to fit their text. Measuring that (`scrollHeight`) forces a
// synchronous layout of a two-column sheet, so doing it inline with a
// keystroke re-flows everything between the keypress and the letter
// appearing. Requests are queued and flushed on the next animation frame
// instead, in one write→read→write pass: N textareas cost one layout.
const _growQueue = new Set();
let _growFrame = 0;
function autoGrow(ta) {
  if (!ta) return;
  _growQueue.add(ta);
  if (!_growFrame) _growFrame = requestAnimationFrame(flushAutoGrow);
}
function flushAutoGrow() {
  _growFrame = 0;
  const list = [..._growQueue];
  _growQueue.clear();
  // Release every height first, then read every height, then write them
  // back. Interleaving these (the obvious per-textarea loop) makes each
  // read re-run layout for the whole document.
  list.forEach(ta => { ta.style.height = 'auto'; });
  const heights = list.map(ta => ta.scrollHeight);
  // A textarea inside a folded section measures zero. Writing that back
  // would leave it collapsed when the section reopens, so keep the last
  // good height and re-measure on expand instead.
  list.forEach((ta, i) => { if (heights[i]) ta.style.height = heights[i] + 'px'; });
}
function autoGrowAll() {
  document.querySelectorAll('textarea.field-block').forEach(autoGrow);
}

// Deferring to the next frame is right for keystrokes, but wrong when a list
// has just been rebuilt: the browser lays out once *before* that frame, with
// every textarea still collapsed to one row. Near the bottom of the sheet the
// document is briefly short enough that the scroll position gets clamped, and
// growing the rows back afterwards doesn't restore it — the page jumps
// upwards and you lose the row you were editing. Rebuilds therefore measure
// straight away. It costs no extra layout: the queue is flushed in the same
// single batched write→read→write pass, just now instead of in a frame's time.
function autoGrowAllNow() {
  autoGrowAll();
  if (_growFrame) { cancelAnimationFrame(_growFrame); _growFrame = 0; }
  flushAutoGrow();
}

// Sequential-tracker enforcement for ordered checkbox rows (recoveries,
// skulls). Only the boundary boxes are interactive — the first unchecked and
// the last checked; the rest get `.disabled` + `aria-disabled` and leave the
// tab order. No gaps can form, which matches how the mechanics work in play
// (you spend the *next* recovery, you fail the *next* death save) and keeps
// Quick Rest's "preserve skull 0, clear the rest" meaningful.
function applySequentialState(boxes, prefix) {
  let firstUnchecked = -1;
  for (let i = 0; i < boxes.length; i++) {
    if (!state.checkboxes[prefix + i]) { firstUnchecked = i; break; }
  }
  // All checked: firstUnchecked stays -1 and only the final box is live.
  // None checked: lastChecked is -1 and only box 0 is.
  const lastChecked = firstUnchecked === -1 ? boxes.length - 1 : firstUnchecked - 1;
  boxes.forEach((box, i) => {
    const checked = !!state.checkboxes[prefix + i];
    const interactive = (checked && i === lastChecked) || (!checked && i === firstUnchecked);
    box.classList.toggle('disabled', !interactive);
    if (interactive) {
      box.removeAttribute('aria-disabled');
      box.setAttribute('tabindex', '0');
    } else {
      box.setAttribute('aria-disabled', 'true');
      box.setAttribute('tabindex', '-1');
    }
  });
}

// Number of recovery boxes: an explicit 0 is respected (some monsters of
// the week have no recoveries!), blank defaults to 8, and a typo like
// "888" is capped rather than rendering hundreds of boxes.
function maxRecoveries() {
  const n = intOrNull(state.fields.max_recoveries);
  if (n === null || n < 0) return 8;
  return Math.min(n, 30);
}

function renderRecoveries() {
  const row = document.getElementById('recoveries-row');
  const label = row.querySelector('.hp-label');
  row.innerHTML = '';
  row.appendChild(label);
  const max = maxRecoveries();
  const boxes = [];
  for (let i = 0; i < max; i++) {
    const box = document.createElement('div');
    box.className = 'check-box' + (state.checkboxes['rec_' + i] ? ' checked' : '');
    box.textContent = '✕';
    box.setAttribute('role', 'checkbox');
    box.setAttribute('aria-checked', state.checkboxes['rec_' + i] ? 'true' : 'false');
    box.setAttribute('aria-label', `Recovery ${i + 1}`);
    box.addEventListener('click', () => {
      // Disabled state is the authoritative gate — the keyboard handler
      // also routes through el.click(), so this one check covers both.
      if (box.classList.contains('disabled')) return;
      const next = !state.checkboxes['rec_' + i];
      state.checkboxes['rec_' + i] = next;
      box.classList.toggle('checked', next);
      box.setAttribute('aria-checked', next ? 'true' : 'false');
      // Toggling moves the boundary, so every sibling's state needs reeval.
      applySequentialState(boxes, 'rec_');
      saveNow();
    });
    boxes.push(box);
    row.appendChild(box);
  }
  applySequentialState(boxes, 'rec_');
  row.insertAdjacentHTML('beforeend', trackAnnotationHtml('arc'));
}

function renderSkulls() {
  const row = document.getElementById('skulls-row');
  row.innerHTML = '';
  let max = parseInt(state.fields.max_skulls);
  if (isNaN(max) || max < 5) max = 5;
  if (max > 8) max = 8;
  state.fields.max_skulls = max;
  const skulls = [];
  for (let i = 0; i < max; i++) {
    const isFirst = i === 0;
    const isLast = i === max - 1;
    const firstMiddle = i === 1;
    const lastMiddle = i === max - 2;
    if (isFirst) {
      row.insertAdjacentHTML('beforeend', trackAnnotationHtml('arc'));
    }
    if (firstMiddle) {
      row.insertAdjacentHTML('beforeend', '<span class="skull-bracket">[</span>');
    }
    const skull = document.createElement('div');
    skull.className = 'skull-box' + (state.checkboxes['skull_' + i] ? ' checked' : '');
    skull.textContent = '💀';
    skull.setAttribute('role', 'checkbox');
    skull.setAttribute('aria-checked', state.checkboxes['skull_' + i] ? 'true' : 'false');
    skull.setAttribute('aria-label', `Failed death save ${i + 1}`);
    skull.addEventListener('click', () => {
      if (skull.classList.contains('disabled')) return;
      const next = !state.checkboxes['skull_' + i];
      state.checkboxes['skull_' + i] = next;
      skull.classList.toggle('checked', next);
      skull.setAttribute('aria-checked', next ? 'true' : 'false');
      applySequentialState(skulls, 'skull_');
      saveNow();
    });
    skulls.push(skull);
    row.appendChild(skull);
    if (lastMiddle && max > 2) {
      row.insertAdjacentHTML('beforeend', '<span class="skull-bracket">]</span>' + trackAnnotationHtml('battle', { style: 'margin-right:4px' }));
    }
    if (isLast) {
      row.insertAdjacentHTML('beforeend', '<span class="track-annotation" style="color:var(--accent)">DEAD</span>');
    }
  }
  applySequentialState(skulls, 'skull_');
  const cfg = el('span', { class: 'skulls-config' },
    el('input', {
      class: 'field-inline', value: max,
      placeholder: '#', title: 'Number of skulls',
      inputmode: 'numeric',
      onchange: e => { state.fields.max_skulls = e.target.value; renderSkulls(); saveNow(); }
    })
  );
  row.appendChild(cfg);
}

// Tiny hyperscript-style DOM helper. Attrs starting with `on` become event
// listeners; everything else becomes an attribute (with `class`/`value`
// shortcuts). Children may be nodes, strings, arrays, or null (skipped).
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'value') node.value = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  });
  children.flat().forEach(c => {
    if (c === null || c === undefined || c === false) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

// Refresh-cadence annotations rendered next to a use-tracker.
// Add new types here (e.g. arc, recharge) and use trackAnnotationHtml(type) anywhere.
const TRACK_TYPES = {
  arc:    { symbol: '↺', title: 'Refreshes per arc' },
  battle: { symbol: '⚔', title: 'Refreshes per battle' },
  // Nothing on the sheet draws this one — an at-will has no uses to tick,
  // which is the whole point of it. It lives here so the battle helper can
  // head its at-will group the same way it heads the other two.
  atwill: { symbol: '∞', title: 'Always available' },
};
function trackAnnotation(type, opts = {}) {
  const t = TRACK_TYPES[type];
  return el('span', { class: 'track-annotation', style: opts.style || null, title: t.title }, t.symbol);
}
// String form for the renderers that build their rows with insertAdjacentHTML.
function trackAnnotationHtml(type, opts = {}) {
  return trackAnnotation(type, opts).outerHTML;
}

// Shared "use" tracker: N check-boxes backed by state[stateKey][idx][prop][u],
// for powers, spells and icon relationships. opts:
//   prop    which map on the row the ticks live in (default 'used'); icons
//           pass 'available' for their second track, a desperate power
//           'desperate' for its recharge box
//   glyph   what a ticked box shows (default '✕')
//   states  how many levels a box cycles through (see below)
//   variant extra class on the box, for a track that must read as a
//           different kind of tick rather than one more of the same
//   title   hover text, when the box needs explaining on its own
//
// `states` is how many levels a box cycles through:
//   2 (default) — off / on
//   3           — off / on / "twist", the icon track's available-but-with-a-
//                 guaranteed-complication state
// Level 0 deletes the key, which keeps saves lean and reads the old boolean
// form as 1.
function useLevel(v, states) {
  let n = v === true ? 1 : (parseInt(v, 10) || 0);
  if (n < 0) n = 0;
  if (n > states - 1) n = states - 1;
  return n;
}
function boxClass(lvl, variant) {
  return 'check-box' + (variant ? ' ' + variant : '')
    + (lvl >= 1 ? ' checked' : '') + (lvl === 2 ? ' twist' : '');
}
// 2 = "mixed" is the natural ARIA value for the partial/twist state.
function boxAria(lvl) {
  return lvl === 2 ? 'mixed' : (lvl === 1 ? 'true' : 'false');
}

function appendUses(parent, stateKey, idx, count, valuesObj, opts = {}) {
  const states = opts.states || 2;
  for (let u = 0; u < count; u++) {
    const lvl = useLevel(valuesObj && valuesObj[u], states);
    const box = el('div', {
      class: boxClass(lvl, opts.variant),
      role: 'checkbox', tabindex: '0',
      'aria-checked': boxAria(lvl),
      'aria-label': opts.label || null,
      title: opts.title || null
    }, opts.glyph || '✕');
    box.addEventListener('click', () => cycleUse(stateKey, idx, u, box, opts));
    parent.appendChild(box);
  }
}

function cycleUse(stateKey, idx, useIdx, boxEl, opts = {}) {
  const prop = opts.prop || 'used';
  const states = opts.states || 2;
  const item = state[stateKey][idx];
  if (!item[prop]) item[prop] = {};
  const next = (useLevel(item[prop][useIdx], states) + 1) % states;
  if (next === 0) delete item[prop][useIdx];
  else item[prop][useIdx] = next;
  boxEl.className = boxClass(next, opts.variant);
  boxEl.setAttribute('aria-checked', boxAria(next));
  saveNow();
}

function renderBackgrounds() {
  const list = document.getElementById('backgrounds-list');
  list.innerHTML = '';
  state.backgrounds.forEach((bg, i) => {
    list.appendChild(el('div', { class: 'row' },
      el('input', {
        class: 'field-inline field-flex', value: bg.name, placeholder: 'Background name',
        oninput: e => { state.backgrounds[i].name = e.target.value; }
      }),
      el('input', {
        class: 'field-inline field-md', value: bg.bonus, placeholder: '+0',
        oninput: e => { state.backgrounds[i].bonus = e.target.value; }
      }),
      el('button', {
        class: 'roll-btn',
        title: 'Roll skill check: d20 + level + background (add the relevant ability mod yourself)',
        'aria-label': `Roll ${bg.name || 'background'} skill check`,
        onclick: () => {
          collectState();
          const b = state.backgrounds[i];
          rollD20(`${b.name || 'Background'} (+ ability mod)`,
                  intOrZero(state.fields.level) + intOrZero(b.bonus));
        }
      }, '🎲'),
      el('button', {
        class: 'remove-btn',
        onclick: () => { state.backgrounds.splice(i, 1); renderBackgrounds(); saveNow(); }
      }, '×')
    ));
  });
}
function addBackground() { state.backgrounds.push({ name: '', bonus: '' }); renderBackgrounds(); saveNow(); }

function renderIcons() {
  const list = document.getElementById('icons-list');
  list.innerHTML = '';
  state.icons.forEach((ic, i) => {
    const dice = Math.min(Math.max(parseInt(ic.dice) || 0, 0), 3);
    const availTrack = el('div', { class: 'icon-track' });
    const usedTrack  = el('div', { class: 'icon-track' });
    if (dice > 0) {
      appendUses(availTrack, 'icons', i, dice, ic.available, { prop: 'available', glyph: '✓', states: 3 });
      appendUses(usedTrack,  'icons', i, dice, ic.used);
    }
    list.appendChild(el('div', { class: 'icon-rel-row' },
      el('input', {
        class: 'field-inline icon-dice', value: ic.dice, placeholder: '#',
        inputmode: 'numeric',
        oninput: e => { state.icons[i].dice = e.target.value; },
        onchange: () => { renderIcons(); saveNow(); }
      }),
      el('input', {
        class: 'field-inline icon-mod', value: ic.mod, placeholder: '±',
        oninput: e => { state.icons[i].mod = e.target.value; }
      }),
      el('input', {
        class: 'field-inline icon-name', value: ic.name, placeholder: 'Icon name',
        oninput: e => { state.icons[i].name = e.target.value; }
      }),
      dice > 0 ? availTrack : el('span'),
      dice > 0 ? usedTrack  : el('span'),
      el('span', { style: 'display:flex; align-items:center;' },
        el('button', {
          class: 'roll-btn',
          title: 'Roll relationship dice: each 5 or 6 earns a use',
          'aria-label': `Roll ${ic.name || 'icon'} relationship dice`,
          onclick: () => rollIconDice(i)
        }, '🎲'),
        el('button', {
          class: 'remove-btn',
          onclick: () => { state.icons.splice(i, 1); renderIcons(); saveNow(); }
        }, '×')
      )
    ));
  });
}
function addIcon() { state.icons.push({ dice: '', mod: '', name: '', used: {}, available: {} }); renderIcons(); saveNow(); }

// ── USAGE MODES ───────────────────────────────────────────────────────
// Every ability row is exactly one of these, so a single <select> answers
// both "is this tracked?" and "when does it refresh?" — they aren't
// independent questions, and splitting them would allow states like
// "passive, refreshes per arc" that mean nothing.
//
// `track` is the TRACK_TYPES annotation, and doubles as the flag for both
// "shows use checkboxes" and "a rest clears it": a Passive class feature or
// an At-Will power has no tracker to draw and nothing to refresh.
//
// The stored value is the token, never the label, so renaming a label later
// isn't a data migration.
//
// `uses` fixes the number of boxes and takes the Uses field away with it:
// a mode that is 1/arc by definition has nothing for the player to set.
// `desperate` adds the second, differently-drawn box beside it.
const USAGE_MODES = {
  // The only mode with no trigger: a passive isn't set off by anything, so
  // the control isn't drawn for it (the stored value stays put).
  passive:   { label: 'Passive', trigger: false },
  atwill:    { label: 'At-Will' },
  battle:    { label: 'Battle', track: 'battle' },
  arc:       { label: 'Arc',    track: 'arc'    },
  // 1/arc, plus one recharge per arc off a failed death save or the last
  // recovery — two separate 1/arc uses, so two separate boxes.
  desperate: { label: 'Arc / Desperate', track: 'arc', uses: 1, desperate: true },
};
const USAGE_KEYS = Object.keys(USAGE_MODES);
const USAGE_DEFAULT = 'passive';

// ── TRIGGERS ──────────────────────────────────────────────────────────
// What sets an ability off. Free text before, and it barely varied: rows
// were a standard action or they were not really an action at all, so a
// closed set says more in less space and gives the battle helper something
// it can reason about.
//
// A Passive row has no trigger by definition and doesn't draw the control
// — the stored value is hidden, never cleared, so setting the row back to
// a usable mode brings the same trigger back.
//
// `outOfBattle` is the one flag anything reads: a skill check or a bit of
// roleplay has no place in a battle helper.
// `short` is what the battle helper's tag column shows — the same word
// without the "action" the dropdown needs to read as a sentence.
const TRIGGERS = {
  standard:    { label: 'Standard action', short: 'Standard' },
  free:        { label: 'Free action',     short: 'Free' },
  hit:         { label: 'Getting hit',     short: 'Getting hit' },
  outofbattle: { label: 'Out of battle',   short: 'Out of battle', outOfBattle: true },
};
const TRIGGER_KEYS = Object.keys(TRIGGERS);
// Most abilities cost a standard action, and it is the reading that puts a
// row *in* the battle helper rather than quietly out of it.
const TRIGGER_DEFAULT = 'standard';
// An unknown token reads as the default rather than throwing, exactly as
// usageMode() does — a row from a future format degrades instead of
// breaking the list.
function triggerMode(item) {
  return (item && TRIGGERS[item.trigger]) ? item.trigger : TRIGGER_DEFAULT;
}
function isOutOfBattle(item) { return TRIGGERS[triggerMode(item)].outOfBattle === true; }

// Every state array rendered by renderPowerLike. Used by the usage
// migration and by the rest hooks, both of which walk all five alike.
const ABILITY_LISTS = ['kinPowers', 'features', 'talents', 'powers', 'spells'];

// An unknown token reads as Passive rather than throwing, so a row from a
// future format degrades to the harmless mode instead of breaking the list.
function usageMode(item) {
  return (item && USAGE_MODES[item.usage]) ? item.usage : USAGE_DEFAULT;
}
function usageTrack(item) { return USAGE_MODES[usageMode(item)].track; }
// How many use boxes a row draws: the mode's fixed count, else whatever the
// player typed into Uses (untracked modes draw none).
function usageUses(item) {
  const mode = USAGE_MODES[usageMode(item)];
  if (mode.uses) return mode.uses;
  return mode.track ? (parseInt(item.max_uses) || 0) : 0;
}

// Emptying a list drops the document's height by everything that was in it,
// and the browser clamps the scroll position to the new, much shorter page.
// Re-appending the rows restores the height but not the position. Chrome's
// scroll anchoring often papers over this, but it works by holding onto a
// node that stays put — and `innerHTML = ''` destroys every candidate inside
// the list, so when the viewport is filled by list rows there is nothing left
// to anchor to and the jump sticks. That's the view from the bottom of a long
// spell list, which is exactly where it was reported. Restore it explicitly
// rather than depending on the heuristic.
function captureScroll() { return { x: window.scrollX, y: window.scrollY }; }
function restoreScroll(pos) {
  if (window.scrollX !== pos.x || window.scrollY !== pos.y) window.scrollTo(pos.x, pos.y);
}

// A rebuild also destroys whatever control the player was using — pick a
// usage mode and focus lands back on <body>, so the keyboard flow ends on
// the row you just changed. Note where focus was and put it back.
// `preventScroll` matters: re-focusing must not undo the position restored
// above.
function captureListFocus(list) {
  const active = document.activeElement;
  if (!active || !list.contains(active) || !active.className) return null;
  const block = active.closest('.power-block');
  return block ? { row: [...list.children].indexOf(block), cls: active.className } : null;
}
function restoreListFocus(list, mark) {
  if (!mark || mark.row < 0) return;
  const block = list.children[mark.row];
  if (!block) return;
  const node = block.querySelector('.' + mark.cls.trim().split(/\s+/).join('.'));
  if (node) node.focus({ preventScroll: true });
}

// Unified renderer for powers and spells. opts:
//   listId, stateKey, namePlaceholder, descPlaceholder, withPrep
function renderPowerLike(opts) {
  const { listId, stateKey, namePlaceholder, descPlaceholder, withPrep } = opts;
  const list = document.getElementById(listId);
  const focusMark = captureListFocus(list);
  const scrollPos = captureScroll();
  list.innerHTML = '';
  const rerender = () => renderPowerLike(opts);
  state[stateKey].forEach((item, i) => {
    // A Passive or At-Will row has nothing to track, so the Uses count and
    // its checkboxes aren't drawn. They are *hidden, never cleared* — set
    // the row back to Battle or Arc and the same ticks come back.
    const track = usageTrack(item);
    const mode = USAGE_MODES[usageMode(item)];
    const maxU = usageUses(item);
    const useChecks = el('div', { class: 'use-checks' });
    if (maxU > 0) {
      appendUses(useChecks, stateKey, i, maxU, item.used);
      // Drawn as a skull rather than one more ✕ because it isn't one more of
      // the same use: it's the one you get back by nearly dying.
      if (mode.desperate) {
        appendUses(useChecks, stateKey, i, 1, item.desperate, {
          prop: 'desperate', glyph: '☠', variant: 'desperate',
          label: 'Desperate use',
          title: 'Desperate use — regained once per arc when you fail a death '
               + 'save or spend your last recovery'
        });
      }
      useChecks.appendChild(trackAnnotation(track));
    }
    const prepBtn = withPrep ? el('div', {
      class: 'prep-btn' + (item.prepared !== false ? ' active' : ''),
      role: 'checkbox', tabindex: '0',
      'aria-checked': item.prepared !== false ? 'true' : 'false',
      'aria-label': 'Prepared', title: 'Prepared',
      onclick: ev => toggleSpellPrep(i, ev.currentTarget)
    }, '✦') : null;
    const usageSel = el('select', {
      class: 'field-inline power-usage', 'aria-label': 'Usage',
      title: 'How this refreshes. Battle and Arc rows are cleared by the rest '
           + 'buttons; Passive and At-Will rows are left alone.',
      onchange: e => {
        const row = state[stateKey][i];
        row.usage = e.target.value;
        // Battle and Arc almost always mean one use. Filling it in beats
        // showing a tracked row with no boxes to tick.
        if (usageTrack(row) && !USAGE_MODES[usageMode(row)].uses
            && !(parseInt(row.max_uses) > 0)) row.max_uses = '1';
        rerender();
        saveNow();
      }
    }, USAGE_KEYS.map(k => el('option', { value: k }, USAGE_MODES[k].label)));
    usageSel.value = usageMode(item);
    const triggerSel = el('select', {
      class: 'field-inline power-trigger', 'aria-label': 'Trigger',
      title: 'What sets this off. An Out of battle row — a skill check, '
           + 'a bit of roleplay — is left out of the battle helper.',
      onchange: e => { state[stateKey][i].trigger = e.target.value; saveNow(); }
    }, TRIGGER_KEYS.map(k => el('option', { value: k }, TRIGGERS[k].label)));
    triggerSel.value = triggerMode(item);
    const header = el('div', { class: 'power-header' },
      el('span', { class: 'drag-handle', title: 'Drag to reorder' }, '⋮⋮'),
      prepBtn,
      el('input', {
        class: 'field-inline power-name', value: item.name, placeholder: namePlaceholder,
        oninput: e => { state[stateKey][i].name = e.target.value; }
      }),
      mode.trigger === false ? null : triggerSel,
      usageSel,
      maxU > 0 ? useChecks : null,
      (track && !mode.uses) ? el('input', {
        class: 'field-inline field-sm', value: item.max_uses || '',
        placeholder: 'Uses', title: 'Number of use checkboxes',
        inputmode: 'numeric',
        onchange: e => { state[stateKey][i].max_uses = e.target.value; rerender(); saveNow(); }
      }) : null,
      el('button', {
        class: 'remove-btn',
        onclick: () => { state[stateKey].splice(i, 1); rerender(); saveNow(); }
      }, '×')
    );
    const desc = el('textarea', {
      rows: '1', class: 'field-block', placeholder: descPlaceholder,
      oninput: e => { state[stateKey][i].desc = e.target.value; }
    });
    desc.value = item.desc || '';
    const blockClasses = 'power-block' + (withPrep && item.prepared === false ? ' unprepared' : '');
    list.appendChild(el('div', { class: blockClasses }, header, desc));
  });
  enableReorder(listId, stateKey, rerender);
  autoGrowAllNow();
  restoreScroll(scrollPos);
  restoreListFocus(list, focusMark);
}

function renderKinPowers() {
  renderPowerLike({
    listId: 'kin-powers-list', stateKey: 'kinPowers',
    namePlaceholder: 'Kin power name',
    descPlaceholder: 'What it does…'
  });
}
function renderFeatures() {
  renderPowerLike({
    listId: 'features-list', stateKey: 'features',
    namePlaceholder: 'Feature name',
    descPlaceholder: 'What it does…'
  });
}
function renderTalents() {
  renderPowerLike({
    listId: 'talents-list', stateKey: 'talents',
    namePlaceholder: 'Talent name',
    descPlaceholder: 'What it does…'
  });
}
function renderPowers() {
  const spec = CLASS_ABILITY_SECTION[currentClassKey()];
  const noun = (spec && spec.list === 'powers') ? spec.noun : 'Power';
  renderPowerLike({
    listId: 'powers-list', stateKey: 'powers',
    namePlaceholder: noun + ' name',
    descPlaceholder: 'Target, effect…'
  });
}
function renderSpells() {
  renderPowerLike({
    listId: 'spells-list', stateKey: 'spells',
    namePlaceholder: 'Spell name',
    descPlaceholder: 'Target, attack, effect…',
    withPrep: true
  });
}
// The rest hooks clear use-trackers across every ability list, so they need
// to redraw all five.
function renderAbilityLists() {
  renderKinPowers(); renderFeatures(); renderTalents(); renderPowers(); renderSpells();
}

function blankPowerRow() {
  return { name: '', trigger: TRIGGER_DEFAULT, usage: USAGE_DEFAULT, desc: '',
           max_uses: '', used: {} };
}
function addKinPower() { state.kinPowers.push(blankPowerRow()); renderKinPowers(); saveNow(); }
function addFeature() { state.features.push(blankPowerRow()); renderFeatures(); saveNow(); }
function addTalent() { state.talents.push(blankPowerRow()); renderTalents(); saveNow(); }
function addPower() { state.powers.push(blankPowerRow()); renderPowers(); saveNow(); }
function addSpell() { state.spells.push(Object.assign(blankPowerRow(), { prepared: true })); renderSpells(); saveNow(); }

function toggleSpellPrep(i, btn) {
  state.spells[i].prepared = !state.spells[i].prepared;
  btn.classList.toggle('active', state.spells[i].prepared);
  btn.setAttribute('aria-checked', state.spells[i].prepared ? 'true' : 'false');
  btn.closest('.power-block').classList.toggle('unprepared', !state.spells[i].prepared);
  saveNow();
}

// Drag-and-drop reordering for any `.power-block` list backed by a state
// array. Only the `.drag-handle` arms the row, so text selection inside the
// inputs still works. HTML5 drag events don't fire on touch devices, hence
// the parallel touch path below — same hints, same reorder math.
function enableReorder(listId, stateKey, render) {
  const list = document.getElementById(listId);
  if (!list) return;
  const blocks = list.querySelectorAll('.power-block');
  blocks.forEach((block, idx) => {
    const handle = block.querySelector('.drag-handle');
    if (!handle) return;
    handle.addEventListener('mousedown', () => { block.draggable = true; });

    // ── Touch reorder ──
    handle.addEventListener('touchstart', e => {
      // Suppress page scroll + synthetic mouse events for the gesture.
      e.preventDefault();
      block.classList.add('dragging');
      let targetBlock = null;
      let dropBefore = true;

      const clearHint = () => {
        if (targetBlock) targetBlock.classList.remove('drag-over-top', 'drag-over-bottom');
      };

      const onMove = ev => {
        ev.preventDefault();
        const t = ev.touches[0];
        if (!t) return;
        const under = document.elementFromPoint(t.clientX, t.clientY);
        const newTarget = under && under.closest('.power-block');
        if (newTarget !== targetBlock) clearHint();
        targetBlock = newTarget;
        // Restrict to the same list so a power can't be dropped into spells.
        if (!targetBlock || targetBlock === block || !list.contains(targetBlock)) return;
        const rect = targetBlock.getBoundingClientRect();
        dropBefore = t.clientY < rect.top + rect.height / 2;
        targetBlock.classList.toggle('drag-over-top', dropBefore);
        targetBlock.classList.toggle('drag-over-bottom', !dropBefore);
      };

      const onEnd = () => {
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('touchcancel', onEnd);
        block.classList.remove('dragging');
        clearHint();
        if (!targetBlock || targetBlock === block || !list.contains(targetBlock)) return;
        const siblings = Array.from(list.querySelectorAll('.power-block'));
        const targetIdx = siblings.indexOf(targetBlock);
        if (targetIdx < 0) return;
        let to = targetIdx + (dropBefore ? 0 : 1);
        const from = idx;
        if (from < to) to -= 1;
        if (from === to) return;
        const arr = state[stateKey];
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        render();
        saveNow();
      };

      // passive:false so onMove can preventDefault the scroll.
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      document.addEventListener('touchcancel', onEnd);
    }, { passive: false });

    block.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${stateKey}:${idx}`);
      block.classList.add('dragging');
    });
    block.addEventListener('dragend', () => {
      block.draggable = false;
      block.classList.remove('dragging');
      list.querySelectorAll('.power-block').forEach(b => {
        b.classList.remove('drag-over-top', 'drag-over-bottom');
      });
    });
    block.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = block.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      block.classList.toggle('drag-over-top', before);
      block.classList.toggle('drag-over-bottom', !before);
    });
    block.addEventListener('dragleave', () => {
      block.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    block.addEventListener('drop', e => {
      e.preventDefault();
      const data = e.dataTransfer.getData('text/plain') || '';
      const [srcKey, srcIdxStr] = data.split(':');
      if (srcKey !== stateKey) return;
      const from = parseInt(srcIdxStr, 10);
      const rect = block.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      let to = idx + (before ? 0 : 1);
      if (from < to) to -= 1;
      if (from === to || isNaN(from)) return;
      const arr = state[stateKey];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      render();
      saveNow();
    });
  });
}

function renderFeats() {
  const list = document.getElementById('feats-list');
  list.innerHTML = '';
  state.feats.forEach((ft, i) => {
    list.appendChild(el('div', { class: 'row' },
      el('input', {
        class: 'field-inline field-flex', value: ft.name,
        placeholder: 'Feat name / source',
        oninput: e => { state.feats[i].name = e.target.value; }
      }),
      el('button', {
        class: 'remove-btn',
        onclick: () => { state.feats.splice(i, 1); renderFeats(); saveNow(); }
      }, '×')
    ));
  });
}
function addFeat() { state.feats.push({ name: '' }); renderFeats(); saveNow(); }

const ADVANCES = [
  { key: 'feat',           label: 'Feat' },
  { key: 'max_hp',         label: 'Max HP ↑' },
  { key: 'attunement',     label: '+1 Attunement' },
  { key: 'pd',             label: '+1 PD' },
  { key: 'md',             label: '+1 MD' },
  { key: 'skill_init',     label: '+1 Skill & Init' },
  { key: 'power_spell',    label: 'Power/Spell' },
  { key: 'class_feature',  label: 'Class Feature',    note: 'some classes' },
  { key: 'talent',         label: 'Talent',           note: 'some classes' },
  { key: 'ability_scores', label: '+1 Ability Scores', note: 'lvl 3/6/9' },
  { key: 'ability_mults',  label: 'Ability ×2/×4',   note: 'lvl 4/7' },
];

function renderAdvances() {
  const grid = document.getElementById('advances-grid');
  grid.innerHTML = '';
  ADVANCES.forEach(adv => {
    const item = document.createElement('div');
    item.className = 'advance-item';
    item.setAttribute('role', 'checkbox');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-checked', state.advances[adv.key] ? 'true' : 'false');
    item.setAttribute('aria-label', adv.label);
    const box = document.createElement('div');
    box.className = 'check-box' + (state.advances[adv.key] ? ' checked' : '');
    box.textContent = '✕';
    box.setAttribute('aria-hidden', 'true');
    const lbl = document.createElement('span');
    lbl.className = 'advance-label';
    lbl.textContent = adv.label;
    if (adv.note) {
      const note = document.createElement('span');
      note.className = 'advance-note';
      note.textContent = ` (${adv.note})`;
      lbl.appendChild(note);
    }
    item.appendChild(box);
    item.appendChild(lbl);
    item.addEventListener('click', () => {
      const next = !state.advances[adv.key];
      state.advances[adv.key] = next;
      box.classList.toggle('checked', next);
      item.setAttribute('aria-checked', next ? 'true' : 'false');
      saveNow();
    });
    grid.appendChild(item);
  });
}

// ══════════════════════════════════════════════════════════════════════
//  CLASS MODULES — per-class sections, attacks, fields and behaviour
// ══════════════════════════════════════════════════════════════════════
//
// A module is one declarative entry in CLASS_MODULES, keyed by the string
// the class <select> stores. Every part is optional:
//
//   slots:      { <slot name>: () => Node } — content injected into the
//               matching `[data-class-slot]` host. Slots today:
//                 'attacks'      — extra cards in the Basic Attacks section
//                 'hp-side'      — inline panel right of recoveries + skulls
//                 'skulls-under' — strip directly beneath the skull track
//                 'sections'     — whole extra sections after Basic Attacks
//               Adding a slot = add a host div + its name to CLASS_SLOTS.
//   slotFit:    [ <slot name>, … ] — slots that should shrink to their
//               content instead of taking their default share of the row.
//               Adds `.slot-fit` to the host; only 'hp-side' styles it.
//   derived:    DERIVED_FIELDS-shaped entries merged over the base set while
//               this class is active, so class fields get the same
//               auto-calculation and lock/override behaviour as built-ins.
//   defenses:   { ac, pd, md } base values, and
//   baseHp:     the per-class HP base — both read by DERIVED_FIELDS.
//   css:        a stylesheet injected once on registration, so a class's
//               look travels with its file.
//   onMount / onUnmount:      DOM work the slots can't express.
//   onQuickRest / onFullHeal: react to the rest buttons (see classHook).
//
// ── NOTHING IS EVER LOST WHEN SWITCHING CLASS ─────────────────────────
// Class content is *unmounted*, never cleared. Class FIELDS are ordinary
// `data-field` inputs with a class-prefixed key, and collectState() only
// reads inputs currently on screen — so an unmounted one can't be blanked.
// Everything else goes in state.classData[<class>] via classData(). Both
// save with `state`; only a deliberate "New Sheet" clears them.
const CLASS_SLOTS = ['attacks', 'hp-side', 'skulls-under', 'sections'];
const CLASS_DIR = 'classes/';

// Populated by registerClass() as class files load; empty at startup.
const CLASS_MODULES = {};
const _classLoad = {};   // class name → Promise<boolean loaded>

// The entry point every `classes/*.js` file calls.
function registerClass(name, mod) {
  if (!name || !mod) return;
  CLASS_MODULES[name] = mod;
  if (mod.css) injectClassCss(name, mod.css);
}

// A class file ships its own styles so its look travels with it.
function injectClassCss(name, css) {
  const id = 'class-css-' + name;
  if (document.getElementById(id)) return;
  document.head.appendChild(el('style', { id }, css));
}

// A classic <script> tag, not fetch() or import(): both of those are blocked
// on file:// pages, and the sheet has to work opened straight off disk.
// Loading is lazy and one-shot per class, and a missing file is not an
// error — the sheet falls back to manual defenses and HP.
function loadClassModule(name) {
  if (_classLoad[name]) return _classLoad[name];
  _classLoad[name] = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = CLASS_DIR + name + '.js';
    script.onload  = () => resolve(true);
    script.onerror = () => {
      console.warn(`No class module found at ${script.src} — using the base sheet.`);
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return _classLoad[name];
}

function currentClassKey() { return state.fields.class || ''; }
function activeClassModule() { return CLASS_MODULES[currentClassKey()] || null; }

// The current class's bucket of non-field state, created on first use.
// Pass a class name to reach another class's bucket explicitly.
function classData(className) {
  const key = className || currentClassKey() || '_none';
  if (!state.classData) state.classData = {};
  if (!state.classData[key]) state.classData[key] = {};
  return state.classData[key];
}

// Fire an optional lifecycle hook on the active module. Errors are
// contained so a broken module can't take the rest of the sheet down.
function classHook(name) {
  const mod = activeClassModule();
  if (!mod || typeof mod[name] !== 'function') return;
  try { mod[name](); } catch (e) { console.warn('class hook ' + name, e); }
}

let _mountedClass = null;

function mountClassSlot(name) {
  const host = document.querySelector(`[data-class-slot="${name}"]`);
  if (!host) return;
  host.innerHTML = '';
  const mod = activeClassModule();
  const build = mod && mod.slots && mod.slots[name];
  // Sizing is re-applied on every mount, so it leaves with the class.
  host.classList.toggle('slot-fit',
    !!(build && mod.slotFit && mod.slotFit.includes(name)));
  if (!build) return;
  try {
    const node = build();
    if (node) host.appendChild(node);
  } catch (e) { console.warn('class slot ' + name, e); }
}

// Re-render every slot for the current class, then wire up what was built:
// values out of state.fields, lock toggles, and a recompute so mirrored
// values land immediately. Safe to call before the class file has loaded —
// it renders what's known, kicks off the load and runs again on arrival.
// `opts.notify` toasts a missing file: worth saying when the user just
// picked the class, not on a page load they didn't ask for.
function renderClassContent(opts = {}) {
  const key = currentClassKey();
  if (key && !CLASS_MODULES[key] && !_classLoad[key]) {
    loadClassModule(key).then(ok => {
      if (!ok && opts.notify) showToast(`No ${key} module found`);
      renderClassContent();
    });
  }
  if (_mountedClass !== key) {
    const prev = CLASS_MODULES[_mountedClass];
    if (prev && typeof prev.onUnmount === 'function') {
      try { prev.onUnmount(); } catch (e) { console.warn('onUnmount', e); }
    }
    _mountedClass = key;
  }
  refreshDerivedIndex();
  // Which third ability section shows, and what it's called, is a property
  // of the class name alone — so this runs whether or not the file loaded.
  applyAbilitySections();
  renderPowers();       // the row placeholders follow the section's noun
  CLASS_SLOTS.forEach(mountClassSlot);
  document.querySelectorAll('[data-class-slot] [data-field]').forEach(node => {
    node.value = state.fields[node.dataset.field] || '';
  });
  initLocks();          // skips inputs already wrapped; wires the new ones
  recomputeDerived();
  classHook('onMount');
  refreshCollapsibleSections();
  autoGrowAll();
  // The class file arrives asynchronously and calls back through here, so
  // this is where its battleHelper() rows first become reachable.
  renderBattleHelperBody();
}

const STORAGE_KEY = '13a_sheet';
let _saveTimer;
let _initializing = true;
let _applying = false;
function saveNow() {
  clearTimeout(_saveTimer);
  if (_initializing || _applying) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collectState())); } catch(e) {}
  // Every mutation on the sheet ends here, which makes this the one place
  // the battle helper has to be redrawn from — and it runs *after*
  // collectState(), so state.fields is already current.
  renderBattleHelperBody();
}
function autoSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveNow, 400);
}
// Flush any pending debounced save when the tab is hidden or closing, so
// keystrokes inside the 400ms autosave window aren't lost.
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow();
});

function collectState() {
  document.querySelectorAll('[data-field]').forEach(el => { state.fields[el.dataset.field] = el.value; });
  return JSON.parse(JSON.stringify(state));
}

function saveToFile() {
  const data = collectState();
  const name = (data.fields.name || 'character').replace(/[^a-zA-Z0-9_-]/g, '_');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Sheet saved');
}

// Old saves carry one combined `powers` list and a free-text `talents` box.
// Move both into the new lists so nothing typed goes missing, and into
// *visible* ones: the combined list becomes Class Features, which every
// sheet shows, rather than the class-dependent Powers section.
function migrateAbilityLists(s) {
  if (!s || typeof s !== 'object') return;
  if (!Array.isArray(s.features)) {
    s.features = Array.isArray(s.powers) ? s.powers : [];
    s.powers = [];
  }
  if (!Array.isArray(s.talents)) {
    const text = s.fields && s.fields.talents;
    s.talents = text ? [Object.assign(blankPowerRow(), { desc: text })] : [];
    if (s.fields) delete s.fields.talents;
  }
}

// Usage was free text before it became a closed set. Map what's
// recognisable and drop the rest to Passive: the unrecognised values are
// exactly the rows the free-text field couldn't describe ("N/A", "always
// on"), which is why the closed set exists. Idempotent — a value that is
// already a token is left alone — so it can run on every load.
const USAGE_PATTERNS = [
  [/at.?-?will/i, 'atwill'],
  [/battle|encounter/i, 'battle'],
  [/arc|daily/i, 'arc'],
];
function migrateUsage(s) {
  if (!s || typeof s !== 'object') return;
  ABILITY_LISTS.forEach(key => {
    if (!Array.isArray(s[key])) return;
    s[key].forEach(item => {
      if (!item || typeof item !== 'object') return;
      if (USAGE_MODES[item.usage]) return;
      const hit = USAGE_PATTERNS.find(([re]) => re.test(String(item.usage || '')));
      item.usage = hit ? hit[1] : USAGE_DEFAULT;
    });
  });
}

// Triggers were free text before they became a closed set, and the real
// sheets show what that looked like: "Std", "Skill check", "Interrupt
// action (Getting hit)", "Miss with attack". Map what's recognisable and
// let the rest read as the default.
//
// Note what this does *not* do: it never deletes `action`. The mapping is a
// judgement call on rows the closed set can't describe exactly ("Multiple
// triggers", "All actions"), and the sheet's first rule is that what the
// player typed doesn't go missing — so the original text stays in the row,
// unrendered, as the record of it. Idempotent, so it runs on every load.
const TRIGGER_PATTERNS = [
  // Anything that fires off being hit, interrupts included — that is very
  // nearly the only thing an interrupt action is ever spent on. The
  // look-ahead keeps "miss with attack" out of it.
  [/hit(?!\s*with)|damaged|interrupt/i, 'hit'],
  [/out.?of.?(battle|combat)|skill|ritual/i, 'outofbattle'],
  [/free/i, 'free'],
  [/standard|std|attack|melee|ranged/i, 'standard'],
];
function migrateTrigger(s) {
  if (!s || typeof s !== 'object') return;
  ABILITY_LISTS.forEach(key => {
    if (!Array.isArray(s[key])) return;
    s[key].forEach(item => {
      if (!item || typeof item !== 'object') return;
      if (TRIGGERS[item.trigger]) return;
      const raw = String(item.trigger || item.action || '');
      const hit = TRIGGER_PATTERNS.find(([re]) => re.test(raw));
      item.trigger = hit ? hit[1] : TRIGGER_DEFAULT;
    });
  });
}

function loadFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      // A valid sheet always carries a `fields` object. Catches a
      // mis-selected file before it overwrites the current state.
      if (!parsed || typeof parsed !== 'object' || typeof parsed.fields !== 'object' || parsed.fields === null) {
        showToast('Not a valid character sheet');
        return;
      }
      state = parsed;
      migrateAbilityLists(state);
      if (!state.checkboxes) state.checkboxes = {};
      if (!state.backgrounds) state.backgrounds = [];
      if (!state.icons) state.icons = [];
      if (!state.kinPowers) state.kinPowers = [];
      if (!state.powers) state.powers = [];
      if (!state.spells) state.spells = [];
      if (!state.feats) state.feats = [];
      if (!state.advances) state.advances = {};
      if (!state.locks) state.locks = {};
      if (!state.activeConditions) state.activeConditions = {};
      if (!state.classData) state.classData = {};
      if (typeof state.escalation !== 'number') state.escalation = 0;
      if (!state.theme) state.theme = 'necromancer';
      migrateUsage(state);
      migrateTrigger(state);
      normalizePrefs(state);
      applyState();
      autoSave();
      showToast('Sheet loaded');
    } catch (err) { showToast('Error reading file'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function applyState() {
  _applying = true;
  try {
    setTheme(state.theme || 'necromancer');
    applyPrefs();
    document.querySelectorAll('[data-field]').forEach(el => { el.value = state.fields[el.dataset.field] || ''; });
    recomputeDerived();
    // Sync each lock toggle's visual to the current state (visuals were
    // created once at init; locks may have flipped on load/reset).
    document.querySelectorAll('.lock-toggle').forEach(toggle => {
      const input = toggle.previousElementSibling;
      if (!input) return;
      const key = input.dataset.field;
      if (key) setLockVisual(toggle, input, !!state.locks[key]);
    });
    [renderRecoveries, renderSkulls, renderBackgrounds, renderIcons, renderKinPowers, renderFeatures, renderTalents, renderPowers, renderSpells, renderFeats, renderAdvances, renderConditions, renderEscalation, renderClassContent, updateHpStatus].forEach(fn => {
      try { fn(); } catch(e) { console.warn(fn.name, e); }
    });
    // After renderClassContent, so a class module's own sections are wired.
    refreshCollapsibleSections();
  } finally {
    _applying = false;
  }
}

// ── REST / HEAL ACTIONS ──────────────────────────────────────────────
// Skull/recovery state lives in `state.checkboxes` under keys like
// `skull_3` / `rec_2`. We mutate that map and re-render the affected
// trackers; the renderers read the same keys back out.

// Clear the use-trackers on every ability row that refreshes here. Matched
// on refresh cadence rather than mode, so a mode added later refreshes with
// whichever track it declares and no call site needs updating — Arc /
// Desperate rides in on 'arc' that way. Because usage is a closed set this
// is exact: Passive and At-Will rows have no track and are skipped by
// definition, not by guessing at what the player typed.
// Returns how many rows actually had ticks, for the log line.
function clearUses(tracks) {
  let n = 0;
  ABILITY_LISTS.forEach(key => {
    (state[key] || []).forEach(item => {
      if (!tracks.includes(usageTrack(item))) return;
      if (Object.keys(item.used || {}).length
          || Object.keys(item.desperate || {}).length) n++;
      item.used = {};
      item.desperate = {};
    });
  });
  return n;
}

// Icon relationship dice are rolled fresh each arc, so both tracks go with
// them — the rolled-but-unspent one and the spent one.
function clearIconTracks() {
  let n = 0;
  (state.icons || []).forEach(ic => {
    if (Object.keys(ic.used || {}).length || Object.keys(ic.available || {}).length) n++;
    ic.used = {};
    ic.available = {};
  });
  return n;
}

function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

function quickRest() {
  // skull_0 survives — a lasting wound that carries across rests.
  Object.keys(state.checkboxes).forEach(key => {
    const m = key.match(/^skull_(\d+)$/);
    if (m && parseInt(m[1], 10) > 0) delete state.checkboxes[key];
  });
  const refreshed = clearUses(['battle']);
  renderSkulls();
  renderAbilityLists();
  classHook('onQuickRest');
  logAction('Quick Rest', 'Death-save skulls cleared (first preserved)'
    + (refreshed ? ` · ${plural(refreshed, 'per-battle ability', 'per-battle abilities')} refreshed` : ''));
  saveNow();
  showToast('Quick rest');
}

function fullHealUp() {
  // Clear every skull and recovery checkbox, and refill current HP.
  Object.keys(state.checkboxes).forEach(key => {
    if (/^(skull|rec)_\d+$/.test(key)) delete state.checkboxes[key];
  });
  // Set current HP from max HP. If max is blank, leave current blank
  // rather than writing "undefined" or stale data into the field.
  const max = state.fields.max_hp || '';
  state.fields.current_hp = max;
  setFieldDom('current_hp');
  // A full heal-up ends the battle/arc: temp HP, conditions and the
  // escalation die don't carry over.
  state.fields.temp_hp = '';
  setFieldDom('temp_hp');
  state.activeConditions = {};
  state.escalation = 0;
  // A full heal-up ends the arc, so per-battle *and* per-arc trackers go
  // with it, icon relationships included.
  const refreshed = clearUses(['battle', 'arc']);
  const iconsReset = clearIconTracks();
  renderConditions();
  renderEscalation();
  renderSkulls();
  renderRecoveries();
  renderAbilityLists();
  renderIcons();
  classHook('onFullHeal');
  updateHpStatus();
  const bits = [
    `HP → ${max || '—'}`,
    'recoveries & skulls reset',
    'conditions, temp HP & escalation cleared',
  ];
  if (refreshed) bits.push(`${plural(refreshed, 'ability', 'abilities')} refreshed`);
  if (iconsReset) bits.push(`${plural(iconsReset, 'icon relationship', 'icon relationships')} reset`);
  logAction('Full Heal-Up', bits.join(' · '));
  saveNow();
  showToast('Fully healed');
}

// Push a state.fields value back into its DOM input (the reverse of the
// input listener's sync). Used by actions that mutate fields directly.
function setFieldDom(key) {
  const node = document.querySelector(`[data-field="${key}"]`);
  if (node) node.value = state.fields[key] || '';
}

// ── HP STATUS (staggered / down / dead) ─────────────────────────────
// Purely visual: compares current HP against the staggered and death
// thresholds and shows a pulsing badge next to the Temp HP card.
function updateHpStatus() {
  const badge = document.getElementById('hp-status');
  if (!badge) return;
  badge.className = 'hp-status-badge';
  badge.textContent = '';
  const cur = intOrNull(state.fields.current_hp);
  if (cur === null) return;
  const stag = intOrNull(state.fields.staggered);
  const dead = intOrNull(state.fields.dead);
  if (dead !== null && cur <= dead) {
    badge.classList.add('down'); badge.textContent = '☠ DEAD';
  } else if (cur <= 0) {
    badge.classList.add('down'); badge.textContent = '☠ DOWN';
  } else if (stag !== null && cur <= stag) {
    badge.classList.add('staggered'); badge.textContent = '⚠ STAGGERED';
  }
}

// ── DAMAGE / HEAL QUICK-APPLY ───────────────────────────────────────
function hpAdjustAmount() {
  const inp = document.getElementById('hp-adjust-amt');
  const n = parseInt(inp.value, 10);
  if (isNaN(n) || n <= 0) { showToast('Enter an amount first'); return null; }
  inp.value = '';
  return n;
}

// "47/60"-style suffix for log lines; just "47" when max HP is unknown.
function hpFraction(cur) {
  const maxHp = intOrNull(state.fields.max_hp);
  return cur + (maxHp !== null ? '/' + maxHp : '');
}

function applyDamage() {
  const n = hpAdjustAmount();
  if (n === null) return;
  collectState();
  let temp = intOrZero(state.fields.temp_hp);
  let remaining = n;
  const absorbed = Math.min(temp, remaining);
  temp -= absorbed;
  remaining -= absorbed;
  const cur = intOrZero(state.fields.current_hp) - remaining;
  state.fields.temp_hp = temp ? String(temp) : '';
  state.fields.current_hp = String(cur);
  setFieldDom('temp_hp');
  setFieldDom('current_hp');
  updateHpStatus();
  const status = document.getElementById('hp-status').textContent;
  logAction('Damage taken',
    (absorbed ? `${absorbed} soaked by temp HP · ` : '') +
    `HP → ${hpFraction(cur)}` + (status ? ` · ${status}` : ''),
    '−' + n);
  saveNow();
  showToast(absorbed ? `−${n} (${absorbed} soaked by temp HP)` : `−${n} HP`);
}

function applyHeal() {
  const n = hpAdjustAmount();
  if (n === null) return;
  collectState();
  const maxHp = intOrNull(state.fields.max_hp);
  let cur = intOrZero(state.fields.current_hp) + n;
  if (maxHp !== null && cur > maxHp) cur = maxHp;
  state.fields.current_hp = String(cur);
  setFieldDom('current_hp');
  updateHpStatus();
  logAction('Healed', `HP → ${hpFraction(cur)}`, '+' + n);
  saveNow();
  showToast(`+${n} HP`);
}

// ── DICE ROLLER ─────────────────────────────────────────────────────
function rollDie(sides) { return Math.floor(Math.random() * sides) + 1; }

// Roll an "NdX+B" expression (reuses parseRecoveryDice). Returns
// { rolls, bonus, total } or null if unparseable / absurdly large.
function rollExpr(str) {
  const d = parseRecoveryDice(str);
  if (!d || d.count > 50 || d.sides > 1000 || d.sides < 1) return null;
  const rolls = [];
  let sum = 0;
  for (let i = 0; i < d.count; i++) {
    const v = rollDie(d.sides);
    rolls.push(v);
    sum += v;
  }
  return { rolls, bonus: d.bonus, total: sum + d.bonus };
}
function exprDetail(expr, r) {
  return `${expr}: [${r.rolls.join(', ')}]` + (r.bonus ? ' ' + signed(r.bonus) : '');
}

function openDiceTray() {
  document.getElementById('dice-tray').classList.remove('collapsed');
  document.getElementById('dice-tray-head').setAttribute('aria-expanded', 'true');
  document.getElementById('dice-tray-caret').textContent = '▾';
}
function toggleDiceTray() {
  const collapsed = document.getElementById('dice-tray').classList.toggle('collapsed');
  document.getElementById('dice-tray-head').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  document.getElementById('dice-tray-caret').textContent = collapsed ? '▸' : '▾';
}

// Prepend an entry to the dice & action log (newest on top, capped at 30)
// and pop the tray open so the result is visible. The log is intentionally
// not persisted — it's table chatter, not character data.
function logRoll(title, detail, total, cls) {
  openDiceTray();
  const log = document.getElementById('roll-log');
  log.prepend(el('div', { class: 'roll-entry' + (cls ? ' ' + cls : '') },
    el('div', { class: 'roll-entry-main' },
      el('div', { class: 'roll-entry-title', title: title }, title),
      detail ? el('div', { class: 'roll-entry-detail' }, detail) : null
    ),
    (total === '' || total === null || total === undefined)
      ? null
      : el('div', { class: 'roll-entry-total' }, String(total))
  ));
  while (log.children.length > 30) log.removeChild(log.lastChild);
}
// Automated sheet actions (damage applied, rests, …) log here too, so
// every button that mutates state leaves a visible summary of what it did.
function logAction(title, detail, value) {
  logRoll(title, detail, value === undefined ? '' : value, 'action');
}

// Shared d20 roll. Reports the natural die (13A cares about even/odd
// triggers), flags nat 1/20, and adds the escalation die for attacks only —
// an active Fear pill blocks it. `opts.critFrom` widens the crit range.
function rollD20(title, bonus, opts = {}) {
  const critFrom = opts.critFrom || 20;
  const nat = rollDie(20);
  const fearBlocked = !!(opts.escalation && state.activeConditions && state.activeConditions.fear);
  const esc = (opts.escalation && !fearBlocked) ? (state.escalation || 0) : 0;
  const total = nat + bonus + esc;
  const parts = [`d20: ${nat} (${nat % 2 === 0 ? 'even' : 'odd'})`];
  if (bonus) parts.push(signed(bonus));
  if (esc) parts.push(`esc +${esc}`);
  if (fearBlocked && (state.escalation || 0) > 0) parts.push('fear: no esc');
  if (critFrom < 20) parts.push(`crit ${critFrom}+`);
  let cls = '';
  if (nat >= critFrom) { cls = 'crit'; title += ' — CRIT!'; }
  else if (nat === 1) { cls = 'fumble'; title += ' — natural 1'; }
  logRoll(title, parts.join('  '), total, cls);
}

function rollAttack(weaponField, fallbackTitle, bonusField) {
  collectState();
  rollD20(state.fields[weaponField] || fallbackTitle,
          intOrZero(state.fields[bonusField]), { escalation: true });
}

function rollDamage(field, title) {
  collectState();
  const expr = (state.fields[field] || '').trim();
  const r = rollExpr(expr);
  if (!r) { showToast('Set damage like "2d6+3" first'); return; }
  logRoll(title, exprDetail(expr, r), r.total);
}

// Spend the next unspent recovery, roll the recovery dice, and apply the
// healing to current HP (capped at max when max is known).
function rollRecovery() {
  collectState();
  const expr = (state.fields.recovery_dice || '').trim();
  const r = rollExpr(expr);
  if (!r) { showToast('Set Recovery Dice (e.g. "3d8+2") first'); return; }
  const max = maxRecoveries();
  let slot = -1;
  for (let i = 0; i < max; i++) {
    if (!state.checkboxes['rec_' + i]) { slot = i; break; }
  }
  if (slot === -1) { showToast('No recoveries left!'); return; }
  state.checkboxes['rec_' + slot] = true;
  const maxHp = intOrNull(state.fields.max_hp);
  let cur = intOrZero(state.fields.current_hp) + r.total;
  if (maxHp !== null && cur > maxHp) cur = maxHp;
  state.fields.current_hp = String(cur);
  setFieldDom('current_hp');
  renderRecoveries();
  updateHpStatus();
  logRoll(`Recovery (${max - slot - 1} left)`,
          `${exprDetail(expr, r)} · HP → ${hpFraction(cur)}`, '+' + r.total);
  saveNow();
}

// Icon relationship roll: Nd6, each 5 or 6 earning a use. Whether a use
// comes with a twist is decided when it's played, not here — that's what
// the 3-state "available" track is for.
function rollIconDice(i) {
  const ic = state.icons[i];
  const n = Math.min(Math.max(parseInt(ic.dice) || 0, 0), 3);
  if (!n) { showToast('Set the number of dice first'); return; }
  const rolls = [];
  for (let k = 0; k < n; k++) rolls.push(rollDie(6));
  const successes = rolls.filter(v => v >= 5).length;
  const label = successes ? `${successes} use${successes > 1 ? 's' : ''}` : 'no 5s or 6s';
  logRoll(`${ic.name || 'Icon'} — ${label}`, `[${rolls.join(', ')}]`,
          successes, successes ? 'crit' : '');
}

const ROLL_HANDLERS = {
  d20:    () => rollD20('d20', 0),
  d20esc: () => rollD20('d20 + escalation', 0, { escalation: true }),
  d6:     () => logRoll('d6', '', rollDie(6)),
  '2d6':  () => { const a = rollDie(6), b = rollDie(6); logRoll('2d6', `${a} + ${b}`, a + b); },
  save:   () => {
    const n = rollDie(20);
    logRoll('Save (11+) — ' + (n >= 11 ? 'success' : 'failed'), `d20: ${n}`,
            n, n >= 11 ? 'crit' : 'fumble');
  },
  init:            () => { collectState(); rollD20('Initiative', intOrZero(state.fields.initiative)); },
  melee_atk:       () => rollAttack('melee_weapon', 'Melee attack', 'melee_vs_ac'),
  ranged_atk_near: () => rollAttack('ranged_weapon', 'Ranged attack (near)', 'ranged_vs_ac_near'),
  ranged_atk_far:  () => rollAttack('ranged_weapon', 'Ranged attack (far)', 'ranged_vs_ac_far'),
  melee_dmg:       () => rollDamage('melee_damage', 'Melee damage'),
  ranged_dmg:      () => rollDamage('ranged_damage', 'Ranged damage'),
};

// ── ESCALATION DIE ──────────────────────────────────────────────────
// Persisted in state.escalation (0–6). Attack rolls add it automatically.
function renderEscalation() {
  const v = state.escalation || 0;
  const big = document.getElementById('esc-value');
  const mini = document.getElementById('esc-mini-value');
  if (big) big.textContent = v;
  if (mini) mini.textContent = v;
}
function bumpEscalation(delta) {
  state.escalation = Math.min(6, Math.max(0, (state.escalation || 0) + delta));
  renderEscalation();
  saveNow();
}

// ── CONDITION PILLS ─────────────────────────────────────────────────
// Standard 13A conditions as toggleable chips; tooltips carry the rules
// reminder. Active keys persist in state.activeConditions.
const CONDITIONS = [
  { key: 'confused',   label: 'Confused',   tip: 'Your attacks target a random nearby ally; you can\'t make opportunity attacks (save ends).' },
  { key: 'dazed',      label: 'Dazed',      tip: '−4 to attacks (save ends).' },
  { key: 'fear',       label: 'Fear',       tip: '−4 to attacks and you can\'t use the escalation die (save ends).' },
  { key: 'grabbed',    label: 'Grabbed',    tip: 'Stuck; −5 to attack anyone other than the creature grabbing you.' },
  { key: 'hampered',   label: 'Hampered',   tip: 'You can only make basic attacks (save ends).' },
  { key: 'helpless',   label: 'Helpless',   tip: '−4 to defenses; attackers crit you on a natural 16+ (save ends).' },
  { key: 'stuck',      label: 'Stuck',      tip: 'You can\'t move, pop free, or change position (save ends).' },
  { key: 'stunned',    label: 'Stunned',    tip: '−4 to defenses and you can\'t take actions (save ends).' },
  { key: 'vulnerable', label: 'Vulnerable', tip: 'Attacks against you crit on a natural 16+.' },
  { key: 'weakened',   label: 'Weakened',   tip: '−4 to attacks AND defenses (save ends).' },
];

function renderConditions() {
  const wrap = document.getElementById('cond-pills');
  if (!wrap) return;
  wrap.innerHTML = '';
  CONDITIONS.forEach(c => {
    const active = !!state.activeConditions[c.key];
    const pill = el('div', {
      class: 'cond-pill' + (active ? ' active' : ''),
      role: 'checkbox', tabindex: '0',
      'aria-checked': active ? 'true' : 'false',
      title: c.tip
    }, c.label);
    pill.addEventListener('click', () => {
      const next = !state.activeConditions[c.key];
      if (next) state.activeConditions[c.key] = true;
      else delete state.activeConditions[c.key];
      pill.classList.toggle('active', next);
      pill.setAttribute('aria-checked', next ? 'true' : 'false');
      saveNow();
    });
    wrap.appendChild(pill);
  });
}

function resetSheet() {
  if (!confirm('Start a new blank sheet? Any unsaved changes will be lost.')) return;
  // Settings (theme, prefs) survive a reset; only character data is cleared.
  state = { fields: {}, checkboxes: {}, backgrounds: [], icons: [], kinPowers: [], features: [], talents: [], powers: [], spells: [], feats: [], advances: {}, locks: {}, activeConditions: {}, classData: {}, escalation: 0, theme: state.theme, prefs: state.prefs };
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
  applyState();
  showToast('New sheet');
}


document.addEventListener('input', (e) => {
  if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
  if (e.target.dataset && e.target.dataset.field) {
    const key = e.target.dataset.field;
    // Sync synchronously, or recomputeDerived reads the last saved value.
    state.fields[key] = e.target.value;
    // Only when the edited field actually feeds a derived value — typing in
    // `notes` shouldn't walk DERIVED_FIELDS.
    if (DERIVED_SOURCES.has(key)) recomputeDerived();
    // Swaps the whole class-module layer; nothing is cleared. notify: the
    // user picked this class, so say so if its file is missing.
    if (key === 'class') renderClassContent({ notify: true });
    // Not derived sources, but they drive the staggered/down badge.
    // The autosave below redraws the battle helper too, but 400ms late.
    // These are the fields it reads out loud, so they get it immediately.
    if (['current_hp', 'temp_hp', 'staggered', 'dead', 'max_hp'].includes(key)) {
      updateHpStatus();
      renderBattleHelperBody();
    }
  }
  autoSave();
});

// Space / Enter toggle any focused custom checkbox (recoveries, skulls,
// power-use trackers, prep buttons, incremental advances) or switch
// (lock toggles on auto-derived fields).
document.addEventListener('keydown', (e) => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  const el = e.target;
  if (!el || !el.getAttribute) return;
  const role = el.getAttribute('role');
  if (role !== 'checkbox' && role !== 'switch' && role !== 'button') return;
  e.preventDefault();
  el.click();
});

// Re-render trackers only after the user commits a value (blur / Enter), so
// typing "12" doesn't briefly redraw with 1 box on the first keystroke.
document.addEventListener('change', (e) => {
  if (!e.target.dataset) return;
  if (e.target.dataset.field === 'max_recoveries') renderRecoveries();
});

// Load from localStorage on init
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    state = JSON.parse(saved);
    migrateAbilityLists(state);
    if (!state.checkboxes) state.checkboxes = {};
    if (!state.backgrounds) state.backgrounds = [];
    if (!state.icons) state.icons = [];
    if (!state.kinPowers) state.kinPowers = [];
    if (!state.powers) state.powers = [];
    if (!state.feats) state.feats = [];
    if (!state.spells) state.spells = [];
    if (!state.advances) state.advances = {};
    if (!state.locks) state.locks = {};
    if (!state.activeConditions) state.activeConditions = {};
    if (!state.classData) state.classData = {};
    if (typeof state.escalation !== 'number') state.escalation = 0;
    if (!state.theme) state.theme = 'necromancer';
    migrateUsage(state);
    migrateTrigger(state);
    normalizePrefs(state);
  }
} catch(e) {}

// Every static button is wired here rather than with inline onclick, so the
// markup stays CSP-friendly and each entry point that mutates state is
// listed in one place.
function wireStaticHandlers() {
  const ACTIONS = {
    'add-background': addBackground,
    'add-icon':       addIcon,
    'add-kin-power':  addKinPower,
    'add-feature':    addFeature,
    'add-talent':     addTalent,
    'add-power':      addPower,
    'add-spell':      addSpell,
    'add-feat':       addFeat,
    'quick-rest':     quickRest,
    'full-heal':      fullHealUp,
    'hp-damage':      applyDamage,
    'hp-heal':        applyHeal,
    'roll-recovery':  rollRecovery,
  };
  document.querySelectorAll('[data-action]').forEach(btn => {
    const fn = ACTIONS[btn.dataset.action];
    if (fn) btn.addEventListener('click', fn);
  });
  // Static roll buttons (attacks, damage, initiative, dice-tray quick rolls).
  document.querySelectorAll('[data-roll]').forEach(btn => {
    const fn = ROLL_HANDLERS[btn.dataset.roll];
    if (fn) btn.addEventListener('click', fn);
  });
  document.getElementById('dice-tray-head').addEventListener('click', toggleDiceTray);
  document.getElementById('bh-rail').addEventListener('click', toggleBattleHelper);
  document.getElementById('esc-plus').addEventListener('click', () => bumpEscalation(1));
  document.getElementById('esc-minus').addEventListener('click', () => bumpEscalation(-1));
  document.getElementById('esc-reset').addEventListener('click', () => {
    state.escalation = 0; renderEscalation(); saveNow();
  });
  // Enter in the amount field applies damage — the common case in play.
  document.getElementById('hp-adjust-amt').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyDamage(); }
  });
  Object.entries(PREF_SWITCHES).forEach(([key, cfg]) => {
    const sw = document.getElementById(cfg.id);
    if (sw) sw.addEventListener('click', () => togglePref(key));
  });
  document.getElementById('theme-select').addEventListener('change', e => setTheme(e.target.value));
  document.getElementById('btn-save').addEventListener('click', saveToFile);
  document.getElementById('btn-load').addEventListener('click', () => document.getElementById('load-input').click());
  document.getElementById('btn-reset').addEventListener('click', resetSheet);
  document.getElementById('load-input').addEventListener('change', loadFromFile);
}

// Numeric keypad on mobile, for positive integers only. Signed values (mods,
// vs-AC, initiative) and dice notation stay plain text: iOS's numeric keypad
// has no `-`, so those fields would become untypeable.
const NUMERIC_FIELDS = [
  'level',
  'str_score','dex_score','con_score','wis_score','int_score','cha_score',
  'ac','pd','md',
  'max_hp','current_hp','temp_hp','staggered',
  'max_recoveries','recovery_avg',
  'melee_avg','melee_miss','ranged_avg','ranged_miss',
  'max_spells','max_magic','base_ac','shield',
];
function applyInputModes() {
  NUMERIC_FIELDS.forEach(key => {
    const input = document.querySelector(`[data-field="${key}"]`);
    if (input) input.setAttribute('inputmode', 'numeric');
  });
}

// Init
wireStaticHandlers();
populateClassOptions();
applyInputModes();
initLocks();
applyState();
autoGrowAll();
if (state.backgrounds.length === 0) { addBackground(); addBackground(); }
if (state.icons.length === 0) { addIcon(); }
if (state.kinPowers.length === 0) { addKinPower(); }
if (state.features.length === 0) { addFeature(); }
if (state.talents.length === 0) { addTalent(); }
if (state.powers.length === 0) { addPower(); }
if (state.spells.length === 0) { addSpell(); }
if (state.feats.length === 0) { addFeat(); }
_initializing = false;

// Recalculate textarea heights once webfonts have loaded (fallback-font
// metrics differ enough to mis-wrap text and lock in a too-tall height),
// and again whenever the viewport width changes wrap points.
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(autoGrowAll);
}
window.addEventListener('resize', autoGrowAll);
