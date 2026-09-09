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

// ── ABILITY MODIFIER SCALING ──
// One table, two users. Wherever 13A 2e adds an ability modifier to
// something that already grows with level, it scales the same way: ×1
// through 4th, ×2 at champion, ×4 at epic, plus a flat amount over the last
// three levels. Basic attack damage reads it, and so does a recovery roll.
// Ordered high → low so the first matching `min` wins, as TIERS does.
const MOD_SCALING = [
  { min: 10, mult: 4, flat: 15 },
  { min: 9,  mult: 4, flat: 10 },
  { min: 8,  mult: 4, flat: 5 },
  { min: 5,  mult: 2, flat: 0 },
  { min: 1,  mult: 1, flat: 0 },
];
function modScaling(lvl) { return MOD_SCALING.find(s => lvl >= s.min); }

// Several 13A values are simply your level — miss damage, the attunement
// limit. Blank until there is one, which leaves the field hand-typed.
function levelValue(f) {
  const lvl = intOrNull(f.level);
  return lvl === null ? '' : lvl;
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
  druid:       { list: 'spells', label: 'Spells',         noun: 'Spell' },
  occultist:   { list: 'spells', label: 'Spells',         noun: 'Spell' },
  fighter:     { list: 'powers', label: 'Maneuvers',      noun: 'Maneuver' },
  rogue:       { list: 'powers', label: 'Powers',         noun: 'Power' },
  // Commands and tactics are two kinds of thing but one list to read from
  // in play, so they share a section.
  commander:   { list: 'powers', label: 'Commands & Tactics', noun: 'Command' },
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

// Recovery dice: one die per level, plus the tier-scaled Con mod — the same
// scaling for every class without exception. Only the die varies, and it
// rides in the class module as `recoveryDie`.
//
// Produces an expression ("5d8+6"), not a number — that's what the Roll
// Recovery button and the Avg field parse. With no `recoveryDie` the field
// stays blank and hand-typed.
//
// Split from the calc below so a class whose die isn't a constant can reuse
// the formula — the bard's is d8 or d6 depending on a choice they make.
function recoveryDiceFor(f, die) {
  if (die == null) return '';
  const lvl = intOrNull(f.level);
  if (lvl === null || lvl < 1 || lvl > 10) return '';
  const s = modScaling(lvl);
  const bonus = intOrZero(f.con_mod) * s.mult + s.flat;
  return lvl + 'd' + die + (bonus === 0 ? '' : signed(bonus));
}

function recoveryDiceCalc(f) {
  const ci = getClassInfo(f.class);
  return ci ? recoveryDiceFor(f, ci.recoveryDie) : '';
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

// Which three mods each defense takes the middle of. One table, so the
// tooltip explaining a defense can't drift from the sum that produced it.
const DEFENSE_MODS = {
  ac: ['con_mod', 'dex_mod', 'wis_mod'],
  pd: ['str_mod', 'con_mod', 'dex_mod'],
  md: ['int_mod', 'wis_mod', 'cha_mod'],
};

// 13A defenses use the *middle* of three ability mods (the median). The
// field it came from rides along, so the tooltip can name the ability
// rather than just showing a number with no explanation.
function middleOf(f, defenseKey) {
  return DEFENSE_MODS[defenseKey]
    .map(key => ({ key, mod: intOrZero(f[key]) }))
    .sort((x, y) => x.mod - y.mod)[1];
}

// Shared shape for PD and MD: class base + middle of three mods + level.
// (AC parts company with them — it is built from the gear row instead, so
// armor, a shield and a magic bonus can each be seen and edited.)
// Returns '' (blank, stays editable) when the class is unknown, or when
// there's nothing to compute from yet (no level and no relevant mods).
function defenseCalc(f, defenseKey) {
  const ci = getClassInfo(f.class);
  if (!ci || !ci.defenses) return '';
  const lvl = intOrNull(f.level);
  const haveMod = DEFENSE_MODS[defenseKey].some(k => intOrNull(f[k]) !== null);
  if (lvl === null && !haveMod) return '';
  return ci.defenses[defenseKey] + middleOf(f, defenseKey).mod + intOrZero(f.level);
}

// ── HEALING POTIONS ─────────────────────────────────────
// 13A 2e allocates healing potions per arc off the character's level, and
// they are *replaced* rather than added to — an unused potion doesn't bank.
// So the stock is a derived field per tier: the level table fills it, and a
// potion bought or looted mid-arc is typed straight over it, locking that
// tier alone. Spent ticks live in state.checkboxes under `potion_<tier>_N`,
// beside `rec_` and `skull_`, so they save, load and reset for free.
//
// `cap` is a ceiling on the hp one drink restores, not on the character.
const POTION_TIERS = [
  { key: 'adventurer', label: 'Adventurer', bonus: '1d8', cap: 30 },
  { key: 'champion',   label: 'Champion',   bonus: '2d8', cap: 60 },
  { key: 'epic',       label: 'Epic',       bonus: '4d8', cap: null },
];
// Level → what that level is handed. Levels outside 1–10 have no entry, so
// the stock fields stay blank and hand-typed exactly as max HP does.
const POTIONS_BY_LEVEL = {
  1:  { adventurer: 1 },
  2:  { adventurer: 2 },
  3:  { adventurer: 1, champion: 1 },
  4:  { champion: 2 },
  5:  { adventurer: 1, champion: 2 },
  6:  { champion: 1, epic: 1 },
  7:  { epic: 2 },
  8:  { champion: 1, epic: 2 },
  9:  { epic: 3 },
  10: { epic: 4 },
};
function potionsAtLevel(f, tier) {
  const row = POTIONS_BY_LEVEL[intOrNull(f.level)];
  return row === undefined ? '' : (row[tier] || 0);
}
// How many of a tier the character has, ticked or not. A typo like "99" is
// capped rather than drawing a hundred boxes — maxRecoveries' reasoning.
function potionStock(tier) {
  const n = intOrNull(state.fields['potions_' + tier]);
  if (n === null || n < 0) return 0;
  return Math.min(n, 20);
}
function potionKey(tier, i) { return 'potion_' + tier + '_' + i; }
// Unspent potions of one tier — what the battle helper counts, and what
// drinking one needs at least one of.
function potionsLeft(tier) {
  const stock = potionStock(tier);
  let left = 0;
  for (let i = 0; i < stock; i++) if (!state.checkboxes[potionKey(tier, i)]) left++;
  return left;
}
// Two numbers and nothing else: the section head names them, the ticks
// count them, and the row has to fit beside the magic items in a combo row.
function potionEffect(t) {
  return '+' + t.bonus + ' · ' + (t.cap === null ? 'no cap' : 'max ' + t.cap);
}
// The long form, for a tooltip — where there is room to say what the dice
// are added to and what drinking one costs.
function potionTitle(t) {
  return t.label + ' healing potion — heal a recovery +' + t.bonus + ' hp'
       + (t.cap === null ? '' : ', to a maximum of ' + t.cap)
       + '. Drinking is a standard action and spends a recovery too.';
}
// "1 adventurer, 2 champion" — the restocked allocation, for the heal-up log.
function potionSummary() {
  return POTION_TIERS
    .map(t => { const n = potionStock(t.key); return n ? n + ' ' + t.key : null; })
    .filter(Boolean).join(', ');
}

// ── ARMOR ─────────────────────────────────────────────────────────────
// Each class has its own armor table — the same three rows, different
// numbers, and different attack penalties for wearing more than the class
// is trained for. It lives in the class module as `armor`, one entry per
// printed row, so a class file carries its table exactly as the book
// prints it:
//
//   armor: {
//     none:   { ac: 10 },
//     light:  { ac: 13 },
//     heavy:  { ac: 14, atk: -2 },
//     shield: { ac: 1, atk: -2 },   // `ac` is only the field's placeholder
//     default: 'light',             // the heaviest row with no penalty
//   }
//
// The Shield box stays hand-typed — a magic shield is worth more than the
// table's +1 — so the shield row contributes its penalty and a hint, not a
// value. `atk` may be a function of the fields for a rule that depends on
// the character (the ranger's shield, the cleric's heavy armor), and
// `default` may be too (the cleric's, which follows their focus).
//
// Without a table — no class picked, or its file missing — Base AC stays
// blank and hand-typed, exactly as max HP and recovery dice do.
const ARMOR_ROWS = [
  { key: 'none',  label: 'None' },
  { key: 'light', label: 'Light' },
  { key: 'heavy', label: 'Heavy' },
];
const ARMOR_KEYS = ARMOR_ROWS.map(r => r.key);

function armorTable(f) {
  const ci = getClassInfo(f.class);
  return (ci && ci.armor) || null;
}
// A table value that may be a plain number or a rule about the character.
function armorValue(v, f) {
  if (typeof v === 'function') return v(f) || 0;
  return v || 0;
}
// Which row the dropdown starts on: the class's heaviest penalty-free
// armor. '' when the class is unknown, which leaves the field blank.
function armorDefaultRow(f) {
  const t = armorTable(f);
  if (!t) return '';
  const row = typeof t.default === 'function' ? t.default(f) : t.default;
  return ARMOR_KEYS.includes(row) ? row : '';
}
function baseAcCalc(f) {
  const t = armorTable(f);
  const row = t && t[f.armor_type];
  return row && row.ac != null ? row.ac : '';
}

// AC = base + shield + misc + the middle of Con/Dex/Wis + level. Base AC is
// itself derived and lockable, so a player in something the table doesn't
// cover locks that one box and the rest of the sum still works.
function acCalc(f) {
  const base = intOrNull(f.base_ac);
  if (base === null) return '';
  return base + intOrZero(f.shield) + intOrZero(f.ac_misc)
       + middleOf(f, 'ac').mod + intOrZero(f.level);
}

// The class's whole armor table as text, for the dropdown's tooltip: the
// numbers behind the choice, so picking armor doesn't send anyone to the
// book. Columns are pipe-separated rather than space-padded — a native
// tooltip renders in a proportional font, where padding lines nothing up.
// Rows read live, so a penalty that depends on the character (the ranger's
// shield) shows what it currently costs.
const ARMOR_TIP_LEAD =
  "Your class's armor table sets Base AC from this, and any attack penalty it carries";

function armorTableTooltip(f) {
  const t = armorTable(f);
  if (!t) return ARMOR_TIP_LEAD + '.\n' + HINT_NEEDS_CLASS;
  // The shield rides along at the bottom: it isn't one of the choices in
  // this dropdown, but it's the rest of the same table.
  const rows = ARMOR_ROWS.concat(t.shield ? [{ key: 'shield', label: 'Shield' }] : []);
  const lines = rows.filter(r => t[r.key]).map(r => {
    const row = t[r.key];
    // The shield's `ac` is a bonus on top; the armor rows' is the Base AC.
    const ac = row.ac == null ? '—' : (r.key === 'shield' ? signed(row.ac) : row.ac);
    const pen = armorValue(row.atk, f);
    return [r.label, ac, pen ? signed(pen) : '—'].join(' | ');
  });
  return ARMOR_TIP_LEAD + '.\n\n'
       + 'ARMOR TYPE | BASE AC | ATK PENALTY\n' + lines.join('\n');
}

// Wearing more armor than the class is trained for costs attack rolls, and
// so does a shield for most classes. Talents undo this often enough — and
// in ways too varied to encode (the druid's especially) — that one switch
// turns the whole thing off.
const ARMOR_NO_PENALTY = 'armor_no_penalty';
function armorPenaltyWaived() { return !!state.checkboxes[ARMOR_NO_PENALTY]; }

function armorAtkPenalty(f) {
  if (armorPenaltyWaived()) return 0;
  const t = armorTable(f);
  if (!t) return 0;
  const worn = t[f.armor_type];
  let pen = worn ? armorValue(worn.atk, f) : 0;
  // A shield you aren't carrying costs nothing; any value in the box means
  // you are carrying one.
  if (t.shield && intOrZero(f.shield) !== 0) pen += armorValue(t.shield.atk, f);
  return pen;
}
// Whether this class can be penalised at all. Fighters and paladins can't,
// so they never see the switch that turns penalties off.
function armorHasPenalties(f) {
  const t = armorTable(f);
  if (!t) return false;
  return ARMOR_KEYS.concat('shield').some(k => t[k] && t[k].atk !== undefined);
}

// ── BASIC ATTACKS ─────────────────────────────────────────────────────
// Every class's basic attack is the same shape in 13A 2e — an ability mod
// + level to hit, and level × the weapon's die + a scaling ability bonus
// on a hit. Only *which* ability differs, so the whole progression lives
// here and a class module carries nothing but its deviations.
//
// The player supplies the weapon: its name, and its damage die. No weapon
// table — a die is one keystroke and covers every weapon in the game,
// magical ones included. The `_misc` fields are the ± a magic weapon or a
// talent adds; they're the one part of the sum the sheet can't know.
//
// Which ability each half uses is a dropdown, and the dropdown is itself a
// derived field: the class fills it in, and choosing locks it exactly like
// typing over a number. That is what makes the bard's and ranger's
// Str-or-Dex choice, and thrown weapons adding Strength damage, need no
// special case anywhere — the player just picks.
const ABILITIES = [
  { key: 'str', label: 'Strength',     short: 'Str', mod: 'str_mod' },
  { key: 'dex', label: 'Dexterity',    short: 'Dex', mod: 'dex_mod' },
  { key: 'con', label: 'Constitution', short: 'Con', mod: 'con_mod' },
  { key: 'wis', label: 'Wisdom',       short: 'Wis', mod: 'wis_mod' },
  { key: 'int', label: 'Intelligence', short: 'Int', mod: 'int_mod' },
  { key: 'cha', label: 'Charisma',     short: 'Cha', mod: 'cha_mod' },
];
const ABILITY_BY_KEY = Object.fromEntries(ABILITIES.map(a => [a.key, a]));
const ABILITY_BY_MOD = Object.fromEntries(ABILITIES.map(a => [a.mod, a]));
const ABILITY_MOD_FIELDS = ABILITIES.map(a => a.mod);

function ability(key) { return ABILITY_BY_KEY[key] || ABILITY_BY_KEY.str; }
function abilityShort(key) { return ability(key).short; }
// Every tooltip that shows its working is built from these: one term per
// thing being added, its contribution inside the brackets. "Base (10) +
// Str (+4)" can't be misread the way "base 10 + Str +4" could, where the
// sign looks like a fourth thing to add. A modifier keeps its sign; a
// count — a level, a base — doesn't have one to keep.
function calcTerm(label, value) { return label + ' (' + value + ')'; }

// What a working-tooltip says while its field is still blank. A blank
// derived field is waiting on something; these name what.
const HINT_NEEDS_CLASS = 'Auto-calculated once you pick a class';
const HINT_NEEDS_LEVEL = 'Auto-calculated once you set your level';

// Same, addressed by the mod field a defense reads rather than by key.
function abilityShortByMod(modField) {
  const a = ABILITY_BY_MOD[modField];
  return a ? a.short : modField;
}
// The mod an attack half is currently using. Unknown key → Strength, which
// is what an empty dropdown would mean anyway.
function abilityModValue(f, key) { return intOrZero(f[ability(key).mod]); }

// The weapon's damage die, rolled once per level: "d8", "1d8" and "8" all
// mean one d8. A count is only honoured when spelled with a `d` ("2d6"),
// so "10" reads as a d10 rather than ten of something.
function parseWeaponDie(str) {
  if (!str) return null;
  const m = String(str).replace(/\s+/g, '').match(/^(?:(\d+)d|d?)(\d+)$/i);
  if (!m) return null;
  const count = m[1] ? +m[1] : 1;
  const sides = +m[2];
  return (count > 0 && sides > 0) ? { count, sides } : null;
}

// What a class does differently. Everything unstated falls back to these —
// right for most of the roster, and still right when the class file is
// missing, so basic attacks auto-calculate on a sheet that has no module
// at all. See `attacks` in classes/_template.js.
const ATTACK_DEFAULTS = {
  melee:  { ability: 'str' },
  ranged: { ability: 'dex' },
};
function attackInfo(f, kind) {
  const ci = getClassInfo(f.class);
  const spec = ci && ci.attacks && ci.attacks[kind];
  return Object.assign({}, ATTACK_DEFAULTS[kind], spec || {});
}

// Attack bonus: ability mod + level + whatever the player added. Blank
// until there's a level, which leaves the field hand-typed as before.
function attackBonusCalc(f, kind) {
  const lvl = intOrNull(f.level);
  if (lvl === null) return '';
  return signed(abilityModValue(f, f[kind + '_atk_ability'])
              + lvl + intOrZero(f[kind + '_atk_misc']) + armorAtkPenalty(f));
}

// Hit damage: level × the weapon die, + the scaled ability mod. Blank
// until both a level and a die are known — the sheet has nothing to say
// about damage before then, so the field stays blank and editable.
function attackDamageCalc(f, kind) {
  const lvl = intOrNull(f.level);
  const die = parseWeaponDie(f[kind + '_weapon_die']);
  if (lvl === null || lvl < 1 || die === null) return '';
  const s = modScaling(lvl);
  const bonus = abilityModValue(f, f[kind + '_dmg_ability']) * s.mult
              + s.flat + intOrZero(f[kind + '_dmg_misc']);
  return (die.count * lvl) + 'd' + die.sides + (bonus === 0 ? '' : signed(bonus));
}

// The sum in words, for the field's tooltip. A number like "5d8+21" should
// never be a mystery — least of all the flat +5 that appears at 8th level.
function attackWorking(f, kind, half) {
  const lvl = intOrNull(f.level);
  if (lvl === null) return 'Auto-calculated once you set your level';
  const abKey = f[kind + '_' + half + '_ability'];
  const mod = abilityModValue(f, abKey);
  const misc = intOrZero(f[kind + '_' + half + '_misc']);
  const parts = [];
  if (half === 'atk') {
    parts.push(calcTerm(abilityShort(abKey), signed(mod)), calcTerm('Level', lvl));
  } else {
    const die = parseWeaponDie(f[kind + '_weapon_die']);
    if (!die) return 'Auto-calculated once you set the weapon damage die';
    const s = modScaling(lvl);
    parts.push(calcTerm('Weapon',
      lvl + ' × ' + (die.count > 1 ? die.count : '') + 'd' + die.sides));
    parts.push(calcTerm(abilityShort(abKey),
      signed(mod) + (s.mult > 1 ? ' × ' + s.mult : '')));
    if (s.flat) parts.push(calcTerm('Epic', signed(s.flat)));
  }
  if (misc) parts.push(calcTerm('Misc', signed(misc)));
  if (half === 'atk') {
    const armor = armorAtkPenalty(f);
    if (armor) parts.push(calcTerm('Armor', signed(armor)));
  }
  return parts.join(' + ');
}

// The sum behind a defense, for its tooltip — the same job the attack
// tooltips do. Naming which of the three mods came out in the middle is the
// point of it: that is the part of 13A's defense rule people misremember.
function defenseWorking(f, key) {
  const lvl = intOrZero(f.level);
  if (key === 'initiative') {
    if (intOrNull(f.dex_mod) === null && intOrNull(f.level) === null) return HINT_NEEDS_LEVEL;
    return calcTerm('Dex', signed(intOrZero(f.dex_mod))) + ' + ' + calcTerm('Level', lvl);
  }

  let base;
  if (key === 'ac') {
    base = intOrNull(f.base_ac);
    if (base === null) return 'Auto-calculated once Base AC is known';
  } else {
    const ci = getClassInfo(f.class);
    if (!ci || !ci.defenses) return HINT_NEEDS_CLASS;
    if (intOrNull(f.level) === null
        && !DEFENSE_MODS[key].some(k => intOrNull(f[k]) !== null)) return HINT_NEEDS_LEVEL;
    base = ci.defenses[key];
  }

  const mid = middleOf(f, key);
  const short = abilityShortByMod(mid.key);
  const parts = [
    calcTerm('Base', base),
    calcTerm(short, signed(mid.mod)),
    calcTerm('Level', lvl),
  ];
  if (key === 'ac') {
    const shield = intOrZero(f.shield);
    const misc = intOrZero(f.ac_misc);
    if (shield) parts.push(calcTerm('Shield', signed(shield)));
    if (misc) parts.push(calcTerm('Misc', signed(misc)));
  }
  // Why that ability and not one of the other two. On its own line: it is
  // the one part of the tooltip that isn't a term in the sum, and putting
  // it in brackets beside a value would read as part of the arithmetic —
  // the thing this format exists to avoid.
  return parts.join(' + ') + '\n'
       + short + ' is the middle of ' + DEFENSE_MODS[key].map(abilityShortByMod).join('/');
}

// The sums behind the Hit Points block. Max HP is the one number on the
// sheet where the order of operations is easy to get wrong — the Con mod
// joins the class base *before* the level multiplier, not after — so the
// brackets there are doing real work rather than just holding a value.
function hpWorking(f, key) {
  if (key === 'max_hp') {
    const ci = getClassInfo(f.class);
    if (!ci || ci.baseHp == null) return HINT_NEEDS_CLASS;
    const lvl = intOrNull(f.level);
    const mult = HP_LEVEL_MULT[lvl];
    if (mult === undefined) return HINT_NEEDS_LEVEL;
    return '(' + calcTerm('Base', ci.baseHp)
         + ' + ' + calcTerm('Con', signed(intOrZero(f.con_mod)))
         + ') × ' + calcTerm('Level ' + lvl + ' multiplier', mult);
  }

  if (key === 'staggered' || key === 'dead') {
    const hp = intOrNull(f.max_hp);
    if (hp === null) return 'Auto-calculated once Max HP is known';
    return calcTerm('Max HP', hp) + ' ÷ 2, rounded down'
         + (key === 'dead' ? ', below zero' : '');
  }

  // recovery_dice. The die is read back out of the expression rather than
  // from the class, because two classes choose theirs (see the bard's
  // dropdown and the cleric's) and the tooltip has to describe whichever
  // one actually produced the value.
  const lvl = intOrNull(f.level);
  if (lvl === null || lvl < 1 || lvl > 10) return HINT_NEEDS_LEVEL;
  const ci = getClassInfo(f.class);
  const parsed = parseRecoveryDice(f.recovery_dice);
  const sides = parsed ? parsed.sides : (ci ? ci.recoveryDie : null);
  if (sides == null) return HINT_NEEDS_CLASS;
  const sc = modScaling(lvl);
  const parts = [
    calcTerm('Dice', lvl + ' × d' + sides),
    calcTerm('Con', signed(intOrZero(f.con_mod)) + (sc.mult > 1 ? ' × ' + sc.mult : '')),
  ];
  if (sc.flat) parts.push(calcTerm('Epic', signed(sc.flat)));
  return parts.join(' + ');
}

function updateHpHints() {
  ['max_hp', 'staggered', 'dead', 'recovery_dice'].forEach(key => {
    const box = document.querySelector(`[data-field="${key}"]`);
    if (box) box.title = hpWorking(state.fields, key);
  });
}

function updateDefenseHints() {
  ['ac', 'pd', 'md', 'initiative'].forEach(key => {
    const box = document.querySelector(`[data-field="${key}"]`);
    if (box) box.title = defenseWorking(state.fields, key);
  });
}

// Everything about the attack cards that isn't a field value: the tooltips
// showing the working, the Str-or-Dex hint, and the thrown-weapon note.
// All three follow the same numbers, so they refresh from one place.
function updateAttackHints() {
  ['melee', 'ranged'].forEach(kind => {
    const info = attackInfo(state.fields, kind);
    const hint = document.querySelector(`[data-attack-choice="${kind}"]`);
    if (hint) {
      hint.textContent = info.choice
        ? '(' + info.choice.map(abilityShort).join(' or ') + ')' : '';
    }
    const note = document.querySelector(`[data-attack-note="${kind}"]`);
    if (note) note.textContent = info.note || '';
    const dmg = document.querySelector(`[data-field="${kind}_damage"]`);
    if (dmg) dmg.title = attackWorking(state.fields, kind, 'dmg');
    document.querySelectorAll(`[data-attack-bonus="${kind}"]`).forEach(box => {
      box.title = attackWorking(state.fields, kind, 'atk');
    });
  });
}

// Fill every ability dropdown. Like the class list, this runs before any
// state is applied, so the option a saved sheet names already exists.
function populateAbilityOptions() {
  document.querySelectorAll('select[data-field$="_ability"]').forEach(sel => {
    ABILITIES.forEach(a => sel.appendChild(el('option', { value: a.key }, a.label)));
  });
}

function populateArmorOptions() {
  const sel = document.querySelector('select[data-field="armor_type"]');
  if (!sel) return;
  ARMOR_ROWS.forEach(r => sel.appendChild(el('option', { value: r.key }, r.label)));
}

// The gear row's two class-dependent details: the switch only exists for a
// class that can be penalised, and the Shield box hints at what the table
// says a plain shield is worth.
function updateArmorUi() {
  const sel = document.querySelector('select[data-field="armor_type"]');
  if (sel) sel.title = armorTableTooltip(state.fields);
  const sw = document.getElementById('armor-no-penalty');
  if (sw) {
    const show = armorHasPenalties(state.fields);
    sw.hidden = !show;
    sw.classList.toggle('on', show && armorPenaltyWaived());
    sw.setAttribute('aria-checked', show && armorPenaltyWaived() ? 'true' : 'false');
  }
  const shield = document.querySelector('[data-field="shield"]');
  if (shield) {
    const t = armorTable(state.fields);
    const hint = t && t.shield && t.shield.ac != null ? t.shield.ac : null;
    shield.placeholder = hint === null ? '' : signed(hint);
  }
}

function toggleArmorPenalty() {
  if (armorPenaltyWaived()) delete state.checkboxes[ARMOR_NO_PENALTY];
  else state.checkboxes[ARMOR_NO_PENALTY] = true;
  logAction('Armor attack penalty', armorPenaltyWaived() ? 'ignored' : 'applied');
  recomputeDerived();
  saveNow();
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
  // ── Armor ──
  // Before the attack entries below: the penalty for what you're wearing is
  // part of every attack bonus on the sheet.
  armor_type: { sources: ['class'], calc: armorDefaultRow },
  base_ac:    { sources: ['class', 'armor_type'], calc: baseAcCalc },

  // ── Basic attacks ──
  // The ability dropdowns come first: everything below reads them, and the
  // damage half mirrors the attack half until the player says otherwise —
  // which is the thrown weapon that hits with Dex and hurts with Str.
  melee_atk_ability:  { sources: ['class'], calc: f => attackInfo(f, 'melee').ability },
  melee_dmg_ability:  { sources: ['class', 'melee_atk_ability'],
                        calc: f => attackInfo(f, 'melee').dmgAbility || f.melee_atk_ability || '' },
  ranged_atk_ability: { sources: ['class'], calc: f => attackInfo(f, 'ranged').ability },
  ranged_dmg_ability: { sources: ['class', 'ranged_atk_ability'],
                        calc: f => attackInfo(f, 'ranged').dmgAbility || f.ranged_atk_ability || '' },
  // Attack bonuses. Near and far are the same sum — the rules add no
  // distance penalty — but stay separate fields, so a weapon that can't
  // reach far away is locked to a "—" without touching the other.
  melee_vs_ac: { sources: ['level', 'melee_atk_ability', 'melee_atk_misc', ...ABILITY_MOD_FIELDS],
                 calc: f => attackBonusCalc(f, 'melee') },
  ranged_vs_ac_near: { sources: ['level', 'ranged_atk_ability', 'ranged_atk_misc', ...ABILITY_MOD_FIELDS],
                       calc: f => attackBonusCalc(f, 'ranged') },
  ranged_vs_ac_far:  { sources: ['level', 'ranged_atk_ability', 'ranged_atk_misc', ...ABILITY_MOD_FIELDS],
                       calc: f => attackBonusCalc(f, 'ranged') },
  // Hit damage, before the averages below so they see the fresh expression.
  melee_damage:  { sources: ['level', 'melee_weapon_die', 'melee_dmg_ability', 'melee_dmg_misc', ...ABILITY_MOD_FIELDS],
                   calc: f => attackDamageCalc(f, 'melee') },
  ranged_damage: { sources: ['level', 'ranged_weapon_die', 'ranged_dmg_ability', 'ranged_dmg_misc', ...ABILITY_MOD_FIELDS],
                   calc: f => attackDamageCalc(f, 'ranged') },
  // Average weapon damage from the hit-damage formula (e.g. "1d8+4" → 8).
  melee_avg:    { sources: ['melee_damage'],  calc: f => diceAvg(f.melee_damage) },
  ranged_avg:   { sources: ['ranged_damage'], calc: f => diceAvg(f.ranged_damage) },
  // 13A 2e: a basic *melee* attack misses for damage equal to your level.
  // A missed *ranged* attack usually does nothing at all — the classes
  // where it does say so with `attacks.ranged.missDamage`.
  melee_miss:   { sources: ['level'], calc: levelValue },
  ranged_miss:  { sources: ['class', 'level'],
                  calc: f => attackInfo(f, 'ranged').missDamage ? levelValue(f) : '' },
  // AC is the one defense that comes off the gear row rather than a flat
  // class number — see acCalc. PD and MD take their base from the class
  // module. The *_mod sources are themselves derived, but are defined above
  // and so already fresh here.
  ac: { sources: ['base_ac', 'shield', 'ac_misc', 'level', 'con_mod', 'dex_mod', 'wis_mod'],
        calc: acCalc },
  pd: { sources: ['class', 'level', 'str_mod', 'con_mod', 'dex_mod'],
        calc: f => defenseCalc(f, 'pd') },
  md: { sources: ['class', 'level', 'int_mod', 'wis_mod', 'cha_mod'],
        calc: f => defenseCalc(f, 'md') },
  // 13A 2e: attunement limit equals character level.
  max_magic: { sources: ['level'], calc: levelValue },
  // Healing potions, one entry per tier so that overriding the tier you
  // bought a potion of leaves the other two tracking your level.
  potions_adventurer: { sources: ['level'], calc: f => potionsAtLevel(f, 'adventurer') },
  potions_champion:   { sources: ['level'], calc: f => potionsAtLevel(f, 'champion') },
  potions_epic:       { sources: ['level'], calc: f => potionsAtLevel(f, 'epic') },
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
  renderPotions();
  updateAttackHints();
  updateDefenseHints();
  updateHpHints();
  updateArmorUi();
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
    tray: normalizeTrayGeom(p.tray),
    // Closed unless it has been opened, which is how the markup ships — an
    // older save has no say in it either way.
    trayOpen: p.trayOpen === true,
  };
}

// Tray geometry is four finite numbers or nothing. Anything else — an older
// save, a hand-edited file — reads as "never moved", which puts the tray back
// in its corner rather than somewhere unreachable.
function normalizeTrayGeom(t) {
  if (!t || typeof t !== 'object') return null;
  const g = {};
  for (const k of ['x', 'y', 'w', 'h']) {
    if (typeof t[k] !== 'number' || !isFinite(t[k])) return null;
    g[k] = Math.round(t[k]);
  }
  return g;
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
  applyTrayOpen();
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
    (state[key] || []).forEach((item, i) => {
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
      // `list` + `index` is the handle click-to-reveal points back with —
      // see bhTargetEls() for the invariant that makes an index enough.
      const row = { name, trigger: triggerMode(item), source: abilityTag(key), track,
                    list: key, index: i };
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
                 target: r.target,
                 trigger: TRIGGERS[r.trigger] ? r.trigger : TRIGGER_DEFAULT,
                 track: r.track, left: r.left === undefined ? 1 : r.left }));
}

// Potions are neither an ability nor a class's, but drinking one is a
// standard action off a per-arc stock — the exact shape of what this panel
// is for. The row points back at the Healing Potions section, where the
// ticks and the drink buttons are.
function potionAbilities() {
  return POTION_TIERS.map(t => {
    const left = potionsLeft(t.key);
    if (!left) return null;
    // No `note`: the panel is 290px wide and the dice, the cap and the
    // price are all one click away on the sheet this row points at.
    return {
      name: t.label + ' potion',
      trigger: 'standard', track: 'arc', left,
      title: potionTitle(t),
      target: '[data-section="potions"]',
    };
  }).filter(Boolean);
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
  { name: 'Basic attack', trigger: 'standard', track: 'atwill',
    target: '[data-section="attacks"]' },
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

// ── CLICK TO REVEAL ─────────────────────────────────────────────────
// A row that has somewhere to point at scrolls the sheet to it and outlines
// it for a moment. Targets are resolved when the row is clicked, never when
// it is drawn: the ability lists and a class module's panels are both torn
// down and rebuilt whenever anything changes, so an element captured at
// render time would be a node that has since left the document.
const ABILITY_LIST_IDS = {
  kinPowers: 'kin-powers-list', features: 'features-list',
  talents: 'talents-list', powers: 'powers-list', spells: 'spells-list',
};
// Matches the breakpoint in sheet.css, by hand — a stylesheet's media
// queries can't be read back out. Below it the panel covers most of the
// sheet, so a jump would land on something still hidden behind it.
const BH_NARROW = '(max-width: 600px)';
// Matches the .bh-target fade in sheet.css, which holds the final,
// transparent frame until this fires. The two have to agree.
const BH_TARGET_MS = 1500;
let _bhTargetEls = [];
let _bhTargetTimer = 0;

// Whether to draw the row as clickable. Deliberately doesn't resolve the
// target: that would put a DOM query in every row of every redraw, and a
// declared target that fails to resolve is already handled — the click
// simply does nothing.
function bhHasTarget(r) { return r.list !== undefined || !!r.target; }

// Every element the row is about, in document order — a selector target
// matches all of them, not just the first, because one row can legitimately
// be about a pair: the barbarian's raging strike and raging throw are two
// cards and one choice. The sheet scrolls to the first; all of them light.
//
// renderPowerLike draws `.power-block`s straight from the state array in
// order, so an ability row's index in that array is its block's index in
// the list. That is the invariant the ability half of this rests on.
function bhTargetEls(r) {
  if (r.list !== undefined) {
    const list = document.getElementById(ABILITY_LIST_IDS[r.list]);
    const block = list && list.querySelectorAll('.power-block')[r.index];
    return block ? [block] : [];
  }
  return r.target ? [...document.querySelectorAll(r.target)] : [];
}

// One row's worth of targets at a time, cleared on a timer rather than on
// animationend — see .bh-target in the stylesheet for why the animation
// can't be trusted to fire at all.
//
// Clicking a row that is already lit has to start the fade over, and that
// is the whole reason for the reflow below. Removing a class and re-adding
// it in one task is invisible to the animation: the browser compares
// computed style only at the end of the task, sees `.bh-target` before and
// after, and lets the running fade carry on to transparent — where
// `forwards` then holds it. The row looked dead, and every further click
// did the same nothing. Reading a layout property between the two commits
// the removal, so the re-add is a genuine restart.
//
// Everything else here is already idempotent: the pending timer is
// cancelled rather than stacked, and a browser's smooth scroll replaces an
// in-flight one instead of queueing behind it. So a click is always the
// same click, however fast they come.
function bhFlash(nodes) {
  clearTimeout(_bhTargetTimer);
  _bhTargetEls.forEach(n => n.classList.remove('bh-target'));
  _bhTargetEls = nodes;
  nodes.forEach(n => { void n.offsetWidth; n.classList.add('bh-target'); });
  _bhTargetTimer = setTimeout(() => {
    nodes.forEach(n => n.classList.remove('bh-target'));
    if (_bhTargetEls === nodes) _bhTargetEls = [];
  }, BH_TARGET_MS);
}

function bhReveal(r) {
  const nodes = bhTargetEls(r);
  // The row was drawn against a state that has since moved on — the ability
  // deleted, the list reordered, the class switched. Nothing to point at.
  if (!nodes.length) return;
  const node = nodes[0];
  // A folded section hides its children outright, and scrollIntoView does
  // nothing for a display:none element. Open it, and leave it open — you
  // asked to see what is in there.
  const section = node.closest('.section[data-section]');
  if (section && section.classList.contains('collapsed')) {
    setSectionCollapsed(section, false);
    saveNow();
  }
  // Collapsing the panel doesn't reflow the sheet: the rail's strip is
  // reserved whether it is open or not.
  if (state.prefs.battleHelperOpen && window.matchMedia(BH_NARROW).matches) {
    state.prefs.battleHelperOpen = false;
    renderBattleHelper();
    saveNow();
  }
  const still = state.prefs.animations === false
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  bhFlash(nodes);
}

function bhItem(r) {
  const trigger = TRIGGERS[rowTrigger(r)];
  // role=button is what makes this keyboard-operable: the global keydown
  // handler already routes Space/Enter on a focused role=button to click().
  const linked = bhHasTarget(r);
  return el('div', { class: 'bh-item' + (r.note ? ' has-note' : '')
                            + (linked ? ' linked' : ''),
                     title: r.title || r.source || null,
                     role: linked ? 'button' : null,
                     tabindex: linked ? '0' : null,
                     onclick: linked ? () => bhReveal(r) : null },
    el('span', { class: 'bh-item-name' }, r.name,
      // Spells earn a mark of their own: mid-fight the thing worth seeing at
      // a glance is which of these costs a spell rather than a talent. Same
      // glyph the Spells section head wears, so the two read as one thing.
      // Decorative — the row's own title already says "Spell".
      r.list === 'spells'
        ? el('span', { class: 'bh-item-mark', 'aria-hidden': 'true' }, '✦') : null),
    r.note ? el('span', { class: 'bh-item-note' }, r.note) : null,
    el('span', { class: 'bh-item-tag' }, trigger.short),
    r.desperate ? el('span', { class: 'bh-item-mark', title: 'Desperate use' }, '☠') : null,
    r.left > 1 ? el('span', { class: 'bh-item-count' }, '×' + r.left) : null
  );
}

function buildBhUses() {
  const rows = availableAbilities().concat(classAbilities(), potionAbilities());
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

// Post-battle healing, in the order you have to think about it: how many
// recoveries you have to spend, then the healing the rules make you do,
// then the healing you'd like to do. The last two are separate rows because
// they answer different questions — one is a floor you cannot refuse, the
// other is a ceiling you're working towards — and when you're staggered
// both are true at once.
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
  const toMax = bhToMaxNode();
  if (toMax) sec.appendChild(toMax);
  return sec;
}

// "about 2 recoveries at 13 avg" — the same estimate both healing rows
// want. An average is what it is worth: a rough count of what you are about
// to burn, not a promise. Empty when the average isn't known, so the
// sentence it sits in simply ends earlier rather than guessing.
function bhRecoveryEstimate(hp) {
  const avg = intOrNull(state.fields.recovery_avg);
  if (avg === null || avg <= 0) return '';
  return 'about ' + plural(Math.ceil(hp / avg), 'recovery', 'recoveries')
       + ' at ' + avg + ' avg';
}

// The floor: 13th Age makes you keep healing until you are out of the
// staggered range, so this row is about what you have no choice over.
function bhStaggerNode() {
  const cur = intOrNull(state.fields.current_hp);
  const stag = intOrNull(state.fields.staggered);
  if (cur === null || stag === null) {
    return el('div', { class: 'note' },
      'Fill in current HP and the staggered value to track this.');
  }
  const need = stag + 1 - cur;
  if (need <= 0) {
    return el('div', { class: 'bh-status ok' }, '✔ Not staggered — no mandatory healing');
  }
  const est = bhRecoveryEstimate(need);
  return el('div', { class: 'bh-status warn' },
    el('div', { class: 'bh-status-line' },
      (cur > 0 ? '⚠ Staggered' : '☠ Down') + ' — you MUST heal ' + need + ' HP'),
    el('div', { class: 'note' },
      'Spells or recoveries, until you are above ' + stag + ' HP'
      + (est ? ' · ' + est : ''))
  );
}

// The ceiling: optional, so the row is simply absent at full HP rather than
// saying so — there is nothing to decide then.
function bhToMaxNode() {
  const cur = intOrNull(state.fields.current_hp);
  const maxHp = intOrNull(state.fields.max_hp);
  if (cur === null || maxHp === null) return null;
  const gap = maxHp - cur;
  if (gap <= 0) return null;
  const est = bhRecoveryEstimate(gap);
  return el('div', { class: 'bh-status' },
    el('div', { class: 'bh-status-line' }, gap + ' HP from maximum'),
    est ? el('div', { class: 'note' }, est) : null
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

// Folding is the class and nothing else — see the COLLAPSED SECTIONS block
// at the end of the stylesheet, which hides the body outright rather than
// animating it away.
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

// Draws each tier row's tick track from its stock field, and dims a tier
// the character has none of. The number box stays on a dimmed row on
// purpose: it is where a potion bought mid-arc gets typed in.
//
// Reached from recomputeDerived (the level moved) and from the `change`
// handler (a stock typed over) — the two paths that keep the recovery
// boxes in step, for the same reason.
function renderPotions() {
  const arc = document.getElementById('potions-arc');
  if (!arc) return;
  arc.innerHTML = trackAnnotationHtml('arc');
  POTION_TIERS.forEach(t => {
    const row = document.querySelector('.potion-row[data-potion-tier="' + t.key + '"]');
    if (!row) return;
    const stock = potionStock(t.key);
    row.classList.toggle('empty', stock === 0);
    const effect = row.querySelector('.potion-effect');
    if (effect) effect.textContent = potionEffect(t);
    const track = row.querySelector('.potion-ticks');
    if (!track) return;
    track.innerHTML = '';
    const prefix = 'potion_' + t.key + '_';
    const boxes = [];
    for (let i = 0; i < stock; i++) {
      const key = potionKey(t.key, i);
      const box = el('div', {
        class: 'check-box' + (state.checkboxes[key] ? ' checked' : ''),
        role: 'checkbox',
        'aria-checked': state.checkboxes[key] ? 'true' : 'false',
        'aria-label': t.label + ' potion ' + (i + 1),
      }, '✕');
      box.addEventListener('click', () => {
        // The disabled class is the authoritative gate — Space/Enter come
        // through el.click() too, so this one check covers both.
        if (box.classList.contains('disabled')) return;
        const next = !state.checkboxes[key];
        state.checkboxes[key] = next;
        box.classList.toggle('checked', next);
        box.setAttribute('aria-checked', next ? 'true' : 'false');
        applySequentialState(boxes, prefix);
        saveNow();
      });
      boxes.push(box);
      track.appendChild(box);
    }
    applySequentialState(boxes, prefix);
  });
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
// Declared in the order they happen in play, because that order is what the
// battle helper reads down: what you choose to spend on your own turn, then
// what fires off your own roll, then what fires on somebody else's.
const TRIGGERS = {
  standard:    { label: 'Standard action', short: 'Standard' },
  free:        { label: 'Free action',     short: 'Free' },
  missed:      { label: 'Missed attack',   short: 'Missed' },
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
//                 'recovery'     — beside the Recovery Dice field
//                 'armor'        — beside the armor fields in Gear
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
const CLASS_SLOTS = ['attacks', 'recovery', 'armor', 'hp-side', 'skulls-under', 'sections'];
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
  // Before the /attack/ fallback below, which would otherwise swallow
  // "Miss with attack" into a standard action.
  [/miss/i, 'missed'],
  // Anything that fires off being hit, interrupts included — that is very
  // nearly the only thing an interrupt action is ever spent on.
  [/hit|damaged|interrupt/i, 'hit'],
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

// Attack bonus and hit damage were hand-typed before they were derived, so
// a sheet saved back then would have its numbers recomputed out from under
// it on the next load. The weapon die is the tell: a card that has a value
// but no die predates the automation, so its fields are locked and the
// sheet opens exactly as it was left. Typing the die and clicking the
// padlock is how you opt in.
const LEGACY_ATTACK_FIELDS = {
  melee:  ['melee_damage', 'melee_vs_ac', 'melee_miss'],
  ranged: ['ranged_damage', 'ranged_vs_ac_near', 'ranged_vs_ac_far', 'ranged_miss'],
};
function migrateAttackAutoCalc(s) {
  if (!s || !s.fields) return;
  if (!s.locks) s.locks = {};
  Object.entries(LEGACY_ATTACK_FIELDS).forEach(([kind, keys]) => {
    if (String(s.fields[kind + '_weapon_die'] || '').trim()) return;
    keys.forEach(key => {
      if (String(s.fields[key] || '').trim()) s.locks[key] = true;
    });
  });
}

// Armor was a free-text box and Base AC a number you typed; both are now
// driven by the class's armor table. Two things to preserve, both keyed off
// the same tell — an `armor_type` that isn't one of the three rows means the
// sheet predates the dropdown:
//   • whatever was typed for armor moves to the name field beside it, and
//     becomes a locked category when the word is recognisable;
//   • a hand-typed Base AC is locked, so it isn't recomputed away.
const ARMOR_WORDS = [
  [/plate|chain|scale|banded|splint|brigandine|heavy/i, 'heavy'],
  [/leather|hide|padded|studded|light/i,                'light'],
  [/none|naked|unarmou?red|no armou?r/i,                'none'],
];
function migrateArmorType(s) {
  if (!s || !s.fields) return;
  if (!s.locks) s.locks = {};
  const typed = String(s.fields.armor_type || '').trim();
  if (ARMOR_KEYS.includes(typed)) return;   // already a category
  if (String(s.fields.base_ac || '').trim()) s.locks.base_ac = true;
  if (!typed) return;
  if (!String(s.fields.armor_name || '').trim()) s.fields.armor_name = typed;
  const hit = ARMOR_WORDS.find(([re]) => re.test(typed));
  if (hit) {
    s.fields.armor_type = hit[1];
    s.locks.armor_type = true;
  } else {
    // Unrecognisable: the name is kept, the category falls back to the
    // class default rather than guessing.
    delete s.fields.armor_type;
  }
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
      migrateAttackAutoCalc(state);
      migrateArmorType(state);
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
    [renderRecoveries, renderPotions, renderSkulls, renderBackgrounds, renderIcons, renderKinPowers, renderFeatures, renderTalents, renderPowers, renderSpells, renderFeats, renderAdvances, renderConditions, renderEscalation, renderClassContent, updateHpStatus].forEach(fn => {
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

// ── RESTS ──────────────────────────────────────────────────────
// A rest touches more of the sheet than any other button, and none of it is
// undoable, so each one says what it will do in three places that must agree:
// the button's tooltip, the confirm before it runs, and the log entry after.
// One list, read three ways — the log swaps in what actually changed.
const REST_PLANS = {
  quick: {
    label: 'Quick Rest',
    lead: 'Between battles:',
    ask: 'Take a quick rest?',
    effects: [
      'Clears every death-save skull except the first',
      'Refreshes every per-battle ability',
      'Clears all conditions',
      'Resets the escalation die',
      'Ends any class effect that stops with the battle (rage, bravado…)',
    ],
  },
  full: {
    label: 'Full Heal-Up',
    lead: 'Ends the arc:',
    ask: 'Take a full heal-up?',
    effects: [
      'Sets current HP to max and clears temp HP',
      'Restores every recovery',
      'Clears every death-save skull',
      'Refreshes every per-battle and per-arc ability',
      'Resets every icon relationship',
      'Restocks potions at your current level',
    ],
  },
};

function restBullets(plan) { return plan.effects.map(e => '• ' + e).join('\n'); }
function restTooltip(plan) { return plan.lead + '\n' + restBullets(plan); }
// Native, like the one on New Sheet: the sheet has no dialog of its own, and
// a rest is rare enough that a plain browser prompt is the honest cost.
function confirmRest(plan) {
  return confirm(plan.ask + '\n\n' + restBullets(plan) + '\n\nThis cannot be undone.');
}
// One entry, one line per thing that actually changed — a rest that found
// nothing to do says so rather than logging a list of zeroes.
function logRest(plan, done) {
  logAction(plan.label, done.length
    ? done.map(d => '• ' + d).join('\n')
    : 'Nothing needed refreshing');
}

// A checkbox key is only "set" when its value is truthy: unticking writes
// `false` rather than removing the key, so counting keys would over-report.
function clearCheckboxes(re) {
  let n = 0;
  Object.keys(state.checkboxes).forEach(key => {
    if (!re.test(key)) return;
    if (state.checkboxes[key]) n++;
    delete state.checkboxes[key];
  });
  return n;
}

function quickRest() {
  if (!confirmRest(REST_PLANS.quick)) return;
  const done = [];
  // skull_0 survives — a lasting wound that carries across rests.
  const skulls = clearCheckboxes(/^skull_(?!0$)\d+$/);
  if (skulls) done.push(plural(skulls, 'death-save skull', 'death-save skulls') + ' cleared (the first is kept)');
  const refreshed = clearUses(['battle']);
  if (refreshed) done.push(plural(refreshed, 'per-battle ability', 'per-battle abilities') + ' refreshed');
  // Conditions run out at the end of a battle, which is what a quick rest
  // marks — not at the end of an arc.
  const conds = Object.keys(state.activeConditions || {}).length;
  if (conds) done.push(plural(conds, 'condition', 'conditions') + ' cleared');
  state.activeConditions = {};
  // The die climbs within a battle and starts the next one at zero, so it
  // turns over with the battle rather than with the arc.
  const escalation = state.escalation || 0;
  state.escalation = 0;
  if (escalation) done.push('Escalation die → 0 (was ' + escalation + ')');
  renderSkulls();
  renderAbilityLists();
  renderConditions();
  renderEscalation();
  classHook('onQuickRest');
  logRest(REST_PLANS.quick, done);
  saveNow();
  showToast('Quick rest');
}

function fullHealUp() {
  if (!confirmRest(REST_PLANS.full)) return;
  const done = [];
  // Potions are restocked rather than refreshed — the allocation comes off
  // the level-derived stock fields, so clearing the ticks *is* the restock,
  // and a level gained between arcs restocks at the new level.
  const skulls = clearCheckboxes(/^skull_\d+$/);
  const recs = clearCheckboxes(/^rec_\d+$/);
  const potionTicks = clearCheckboxes(/^potion_[a-z]+_\d+$/);
  // Set current HP from max HP. If max is blank, leave current blank rather
  // than writing "undefined" or stale data into the field.
  const max = state.fields.max_hp || '';
  const hadTemp = intOrZero(state.fields.temp_hp);
  const prevHp = state.fields.current_hp || '';
  state.fields.current_hp = max;
  setFieldDom('current_hp');
  state.fields.temp_hp = '';
  setFieldDom('temp_hp');
  // A character already at full HP was not healed, and saying so buries the
  // lines that did happen. Same for every other line here: the log reports
  // changes, not intentions.
  if (max !== prevHp) {
    done.push(max
      ? 'Current HP → ' + max + (prevHp ? ' (was ' + prevHp + ')' : '')
      : 'Current HP cleared (no Max HP set)');
  }
  if (hadTemp) done.push(hadTemp + ' temp HP cleared');
  if (recs) done.push(plural(recs, 'recovery', 'recoveries') + ' restored');
  if (skulls) done.push(plural(skulls, 'death-save skull', 'death-save skulls') + ' cleared');
  // A full heal-up ends the arc, so per-battle *and* per-arc trackers go
  // with it, icon relationships included.
  const refreshed = clearUses(['battle', 'arc']);
  if (refreshed) done.push(plural(refreshed, 'ability', 'abilities') + ' refreshed');
  const iconsReset = clearIconTracks();
  if (iconsReset) done.push(plural(iconsReset, 'icon relationship', 'icon relationships') + ' reset');
  renderSkulls();
  renderRecoveries();
  renderPotions();
  renderAbilityLists();
  renderIcons();
  classHook('onFullHeal');
  updateHpStatus();
  // Only when something was actually drunk. The summary is read after the
  // ticks are gone, so it is the stock the player now has rather than the
  // one they had left.
  if (potionTicks) {
    const potions = potionSummary();
    done.push(potions ? 'Potions restocked (' + potions + ')'
                      : plural(potionTicks, 'potion tick', 'potion ticks') + ' cleared');
  }
  logRest(REST_PLANS.full, done);
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

// Open or closed is a preference like the tray's position, not a fact about
// the DOM: a roll that pops it open is the player opening it, and it should
// still be open after a reload.
function applyTrayOpen() {
  const tray = trayEl();
  if (!tray) return;
  const open = !!(state.prefs && state.prefs.trayOpen);
  tray.classList.toggle('collapsed', !open);
  document.getElementById('dice-tray-head').setAttribute('aria-expanded', open ? 'true' : 'false');
  document.getElementById('dice-tray-caret').textContent = open ? '▾' : '▸';
  applyTrayGeometry();
}

function setTrayOpen(open) {
  if (!state.prefs) normalizePrefs(state);
  const changed = state.prefs.trayOpen !== !!open;
  state.prefs.trayOpen = !!open;
  applyTrayOpen();
  // Every roll opens the tray; only the one that actually changes the
  // setting is worth a save.
  if (changed) saveNow();
}

function openDiceTray() { setTrayOpen(true); }
function toggleDiceTray() { setTrayOpen(!(state.prefs && state.prefs.trayOpen)); }

// ── DICE TRAY AS A WINDOW ───────────────────────────────────────
// Drag the header to move it, drag the corner grip to resize it. The four
// numbers live in `state.prefs.tray` beside the display switches, so a layout
// survives a reload and rides along in a saved file — clamped back into view
// on arrival, since a sheet can be opened on a smaller screen than it was
// saved on. No stored geometry means the corner the stylesheet gives it.
const TRAY_MIN_W = 240;   // narrower and the quick-roll buttons wrap
const TRAY_MIN_H = 170;   // header, escalation row, buttons, one log entry
const TRAY_EDGE  = 8;     // never let the whole of an edge leave the viewport
// The open height a tray takes the first time it is moved while collapsed:
// it has no open height to measure yet, and this is the CSS one.
const TRAY_OPEN_H = 340;

function trayEl() { return document.getElementById('dice-tray'); }
function trayGeom() { return (state.prefs && state.prefs.tray) || null; }

// Size is clamped to the viewport; position is clamped by what is actually on
// screen, so a collapsed tray — a header and nothing else — can sit lower
// than an open one could. Opening it clamps again at its full height.
function clampTray(g) {
  const tray = trayEl();
  const vw = window.innerWidth, vh = window.innerHeight;
  g.w = Math.max(TRAY_MIN_W, Math.min(g.w, vw - TRAY_EDGE * 2));
  g.h = Math.max(TRAY_MIN_H, Math.min(g.h, vh - TRAY_EDGE * 2));
  let w = g.w, h = g.h;
  if (tray && tray.classList.contains('collapsed')) {
    const r = tray.getBoundingClientRect();
    w = r.width; h = r.height;
  }
  g.x = Math.round(Math.max(TRAY_EDGE, Math.min(g.x, vw - w - TRAY_EDGE)));
  g.y = Math.round(Math.max(TRAY_EDGE, Math.min(g.y, vh - h - TRAY_EDGE)));
}

const TRAY_GEOM_PROPS = ['left', 'top', 'right', 'bottom', 'width', 'height'];

function applyTrayGeometry() {
  const tray = trayEl();
  if (!tray) return;
  const g = trayGeom();
  if (!g) {
    TRAY_GEOM_PROPS.forEach(prop => tray.style.removeProperty(prop));
    tray.classList.remove('sized');
    return;
  }
  clampTray(g);
  // Anchored top-left once moved: the stylesheet's bottom-left corner can't
  // express a dragged position, and mixing the two makes a resize grow in
  // the wrong direction.
  tray.style.left = g.x + 'px';
  tray.style.top = g.y + 'px';
  tray.style.right = 'auto';
  tray.style.bottom = 'auto';
  // A collapsed tray is exactly its header; the stored size waits for it to
  // be opened again.
  const open = !tray.classList.contains('collapsed');
  if (open) { tray.style.width = g.w + 'px'; tray.style.height = g.h + 'px'; }
  else { tray.style.removeProperty('width'); tray.style.removeProperty('height'); }
  tray.classList.toggle('sized', open);
}

// The first drag or resize turns the corner-anchored tray into a positioned
// one. Measuring it first is what makes that conversion move nothing.
function trayGeomForEdit() {
  if (!state.prefs) normalizePrefs(state);
  if (state.prefs.tray) return state.prefs.tray;
  const tray = trayEl();
  const r = tray.getBoundingClientRect();
  const open = !tray.classList.contains('collapsed');
  state.prefs.tray = {
    x: Math.round(r.left), y: Math.round(r.top),
    w: Math.round(r.width), h: open ? Math.round(r.height) : TRAY_OPEN_H,
  };
  return state.prefs.tray;
}

function resetTrayGeometry() {
  if (!state.prefs) normalizePrefs(state);
  if (!state.prefs.tray) return;
  state.prefs.tray = null;
  applyTrayGeometry();
  showToast('Dice tray back in its corner');
  saveNow();
}

// One drag state for both gestures: they differ only in what the pointer's
// travel is added to. `moved` is what keeps a click on the header the toggle
// it already was — until the pointer has actually gone somewhere.
let _trayDrag = null;
const TRAY_DRAG_SLOP = 4;

function trayPointerDown(mode, e) {
  if (e.button) return;
  if (!trayEl()) return;
  _trayDrag = { mode, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false,
                g: null, ox: 0, oy: 0 };
  e.currentTarget.setPointerCapture(e.pointerId);
  // A resize means nothing else, so it doesn't wait for the slop.
  if (mode === 'size') trayDragBegin();
}

function trayDragBegin() {
  const d = _trayDrag;
  d.moved = true;
  d.g = trayGeomForEdit();
  d.ox = d.mode === 'move' ? d.g.x : d.g.w;
  d.oy = d.mode === 'move' ? d.g.y : d.g.h;
  trayEl().classList.add(d.mode === 'move' ? 'dragging' : 'resizing');
  applyTrayGeometry();
}

function trayPointerMove(e) {
  const d = _trayDrag;
  if (!d || e.pointerId !== d.id) return;
  const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
  if (!d.moved) {
    if (Math.abs(dx) < TRAY_DRAG_SLOP && Math.abs(dy) < TRAY_DRAG_SLOP) return;
    trayDragBegin();
  }
  if (d.mode === 'move') { d.g.x = d.ox + dx; d.g.y = d.oy + dy; }
  else { d.g.w = d.ox + dx; d.g.h = d.oy + dy; }
  applyTrayGeometry();
}

// Set while a drag ends, so the click the browser sends afterwards doesn't
// also collapse the tray. Cleared by that click, and by the next press.
let _traySuppressClick = false;

function trayPointerUp(e) {
  const d = _trayDrag;
  if (!d || e.pointerId !== d.id) return;
  _trayDrag = null;
  trayEl().classList.remove('dragging', 'resizing');
  if (!d.moved) return;
  _traySuppressClick = d.mode === 'move';
  applyTrayGeometry();
  saveNow();
}

function trayHeadClick() {
  if (_traySuppressClick) { _traySuppressClick = false; return; }
  toggleDiceTray();
}

function wireDiceTrayWindow() {
  const head = document.getElementById('dice-tray-head');
  const grip = document.getElementById('dice-tray-grip');
  if (!head) return;
  head.addEventListener('click', trayHeadClick);
  // Both clicks of a double-click still reach the toggle, which lands back
  // where it started: the reset is about where the tray is, not whether it
  // is open.
  head.addEventListener('dblclick', resetTrayGeometry);
  head.addEventListener('pointerdown', e => { _traySuppressClick = false; trayPointerDown('move', e); });
  head.addEventListener('pointermove', trayPointerMove);
  head.addEventListener('pointerup', trayPointerUp);
  head.addEventListener('pointercancel', trayPointerUp);
  if (grip) {
    grip.addEventListener('pointerdown', e => trayPointerDown('size', e));
    grip.addEventListener('pointermove', trayPointerMove);
    grip.addEventListener('pointerup', trayPointerUp);
    grip.addEventListener('pointercancel', trayPointerUp);
  }
  // A viewport that shrinks under a tray parked at its edge would put it out
  // of reach; the clamp inside applyTrayGeometry walks it back.
  window.addEventListener('resize', () => { if (trayGeom()) applyTrayGeometry(); });
  // The header is set in a webfont, so its collapsed width — what a parked
  // tray is clamped against — is not final until that font arrives.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (trayGeom()) applyTrayGeometry(); });
  }
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

// Drinking a potion is a standard action that spends a potion *and* a
// recovery: you heal the recovery's worth plus the potion's dice, and the
// tier's cap limits what that one drink can restore. With no recoveries
// left it declines rather than half-working, the same call rollRecovery
// makes — the potion is still on the sheet to spend by hand.
function drinkPotion(tier) {
  const t = POTION_TIERS.find(x => x.key === tier);
  if (!t) return;
  collectState();
  const expr = (state.fields.recovery_dice || '').trim();
  const rec = rollExpr(expr);
  if (!rec) { showToast('Set Recovery Dice (e.g. "3d8+2") first'); return; }
  const stock = potionStock(tier);
  let slot = -1;
  for (let i = 0; i < stock; i++) {
    if (!state.checkboxes[potionKey(tier, i)]) { slot = i; break; }
  }
  if (slot === -1) { showToast('No ' + t.label.toLowerCase() + ' potions left!'); return; }
  const maxRec = maxRecoveries();
  let recSlot = -1;
  for (let i = 0; i < maxRec; i++) {
    if (!state.checkboxes['rec_' + i]) { recSlot = i; break; }
  }
  if (recSlot === -1) { showToast('No recoveries left — a potion spends one'); return; }
  const potion = rollExpr(t.bonus);
  const rolled = rec.total + potion.total;
  const healed = t.cap === null ? rolled : Math.min(rolled, t.cap);
  state.checkboxes[potionKey(tier, slot)] = true;
  state.checkboxes['rec_' + recSlot] = true;
  const maxHp = intOrNull(state.fields.max_hp);
  let cur = intOrZero(state.fields.current_hp) + healed;
  if (maxHp !== null && cur > maxHp) cur = maxHp;
  state.fields.current_hp = String(cur);
  setFieldDom('current_hp');
  renderPotions();
  renderRecoveries();
  updateHpStatus();
  logRoll(`${t.label} potion (${stock - slot - 1} left)`,
          `${exprDetail(expr, rec)} · ${exprDetail(t.bonus, potion)}`
          + (healed < rolled ? ` · capped at ${t.cap}` : '')
          + ` · HP → ${hpFraction(cur)}`
          + ` · ${plural(maxRec - recSlot - 1, 'recovery', 'recoveries')} left`,
          '+' + healed);
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
  if (/^potions_/.test(e.target.dataset.field || '')) renderPotions();
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
    migrateAttackAutoCalc(state);
    migrateArmorType(state);
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
  // One drink action per tier, generated so that adding a tier stays a
  // single edit in POTION_TIERS rather than three scattered ones.
  POTION_TIERS.forEach(t => { ACTIONS['drink-' + t.key] = () => drinkPotion(t.key); });
  document.querySelectorAll('[data-action]').forEach(btn => {
    const fn = ACTIONS[btn.dataset.action];
    if (fn) btn.addEventListener('click', fn);
  });
  // Static roll buttons (attacks, damage, initiative, dice-tray quick rolls).
  document.querySelectorAll('[data-roll]').forEach(btn => {
    const fn = ROLL_HANDLERS[btn.dataset.roll];
    if (fn) btn.addEventListener('click', fn);
  });
  wireDiceTrayWindow();
  document.querySelectorAll('[data-action="quick-rest"]').forEach(b => { b.title = restTooltip(REST_PLANS.quick); });
  document.querySelectorAll('[data-action="full-heal"]').forEach(b => { b.title = restTooltip(REST_PLANS.full); });
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
  const armorSwitch = document.getElementById('armor-no-penalty');
  if (armorSwitch) armorSwitch.addEventListener('click', toggleArmorPenalty);
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
  'potions_adventurer','potions_champion','potions_epic',
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
populateAbilityOptions();
populateArmorOptions();
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
