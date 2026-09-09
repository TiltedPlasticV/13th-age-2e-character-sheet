// ═══════════════════════════════════════════════════════════════════════
//  CLASS MODULE TEMPLATE — copy to `classes/<yourclass>.js`
// ═══════════════════════════════════════════════════════════════════════
//
// The sheet loads `classes/<name>.js` the first time that class is picked
// in the dropdown, so you only need the files for the classes you play —
// hand a player just their own class file and the sheet works.
//
// Add the class name to CLASS_ROSTER in 13th_Age_Character_Sheet.html so it
// appears in the dropdown. Everything else lives here.
//
// The file runs as a plain script sharing the sheet's scope, so all its
// helpers are available: el(), state, classData(), intOrNull(), intOrZero(),
// diceAvg(), rollDie(), rollD20(), rollDamage(), collectState(), logRoll(),
// logAction(), showToast(), saveNow(), trackAnnotation(), mountClassSlot().
// Wrap everything in the IIFE below so your helpers don't collide with
// another class's.
//
// ── A CLASS ONLY EVER AFFECTS ITS OWN SHEET ──
// A player who isn't playing this class must see a sheet that is identical
// to one where this file doesn't exist — no shifted columns, no reserved
// gaps, no leftover styling. In practice:
//   • Put content in slots. An empty slot collapses to display:none, so it
//     costs nothing when your class isn't selected.
//   • Scope your `css` to your own elements. It stays in the page after
//     the class is unloaded, so a rule targeting a shared class name (say
//     .attack-card or .skulls-row) would follow the player to every other
//     class. Give your elements their own names.
//   • Anything onMount() does outside a slot — a body class, a hidden
//     section — must be undone in onUnmount().
//
// ── NOTHING IS EVER LOST WHEN THE PLAYER SWITCHES CLASS ──
// Class content is unmounted, never cleared. Put your data in one of two
// places and it survives automatically:
//   • Fields  — normal `data-field` inputs whose keys start with your class
//     (`barb_rs_damage`). They live in state.fields with everything else.
//   • Anything else (toggles, counters) — classData('<yourclass>').
//
(function () {

  registerClass('template', {

    // ── Base numbers (13th Age 2e) ──
    // Base AC assumes the class's standard armor; a player in different
    // armor just locks the AC field and types their own.
    defenses: { ac: 10, pd: 10, md: 10 },
    // max HP = (baseHp + Con mod) × level multiplier. Almost always 6 or 7.
    // Use null if you're unsure — max HP then stays blank and manual.
    baseHp: 7,
    // Recovery dice = one die per level, + the Con mod scaled by tier (×2
    // from 5th, ×4 +5/+10/+15 over the epic levels) — the same scaling for
    // every class, and the same table basic attack damage uses. Omit if you're unsure
    // and the Recovery Dice field stays blank and hand-typed. A class whose
    // die isn't a constant leaves this out and derives `recovery_dice`
    // itself with recoveryDiceFor() — see classes/bard.js.
    recoveryDie: 8,

    // ── Basic attacks ──
    // Only what this class does *differently*. Every basic attack in 13A 2e
    // is the same sum — ability mod + level to hit, level × the weapon die
    // + a scaling ability mod on a hit — and the sheet computes it for any
    // class, including one whose file is missing. All that varies is which
    // ability, and the defaults (Strength in melee, Dexterity at range) are
    // right for most of the roster. Omit this key entirely unless:
    //   ability: 'dex'          — this class uses another ability (rogue)
    //   dmgAbility: 'str'       — damage uses a *different* one from the
    //                             attack (the monk punches with Dex, hurts
    //                             with Str). Omit and damage follows the
    //                             attack dropdown.
    //   choice:  ['str','dex']  — the player picks; shown beside the
    //                             dropdown, which starts on the first
    //   note:    'Thrown …'     — a line under the card. For a rule the
    //                             player applies by changing the dropdown,
    //                             not something the sheet should do for them
    //   missDamage: true         — a missed *ranged* attack still deals
    //                             damage equal to your level (ranger, rogue)
    // The dropdown is a derived field like any other, so whatever you set
    // here is a starting point the player can override and the padlock
    // gives back.
    // attacks: {
    //   melee:  { ability: 'dex' },
    //   ranged: { note: 'Thrown weapons add Strength damage instead of Dexterity.' },
    // },

    // ── UI injected into the sheet ──
    // Each slot maps to a `[data-class-slot]` host in the HTML:
    //   'attacks'      — extra attack cards in the Basic Attacks section
    //   'recovery'     — beside the Recovery Dice field
    //   'hp-side'      — inline panel right of recoveries + skulls
    //   'skulls-under' — strip directly beneath the skull track
    //   'sections'     — whole extra sections, after Basic Attacks
    // Each builder returns one DOM node (use el()).
    slots: {
      // 'hp-side': () => el('div', { class: 'class-panel' },
      //   el('div', { class: 'class-panel-head' }, 'Focus'),
      //   el('div', { class: 'note' }, 'Rules reminder…')),
    },

    // Slots listed here shrink to their contents instead of taking their
    // default share of the row — for a panel that has nothing to do with
    // the extra width. Only 'hp-side' styles it today.
    // slotFit: ['hp-side'],

    // ── Auto-calculated fields ──
    // Same shape as the sheet's built-in DERIVED_FIELDS: `sources` lists the
    // fields the calc reads (keep them in sync — it's what triggers a
    // recompute), `calc` returns the value. The player can override any of
    // them by typing, which locks the field; the padlock unlocks it again.
    derived: {
      // myclass_thing: { sources: ['level'], calc: f => intOrZero(f.level) * 2 },
    },

    // ── Styling that travels with this class ──
    // Injected once on load. Use the theme CSS variables (var(--accent),
    // var(--ink-dim), …) so it works in every theme, light one included.
    css: `
      /* .my-panel { … } */
    `,

    // ── Battle helper entries (optional) ──
    // Anything your class can *do* that isn't in an ability list — a
    // once-per-arc trigger, a per-battle check, an at-will attack that
    // replaces the basic one — so the Battle Helper panel can list it
    // beside the player's spells and features. A resource that isn't an
    // action in itself (the rogue's bravado points) doesn't belong here.
    //
    // Return every entry you own and let the panel filter: `left` is how
    // many uses remain, and 0 drops the row. `track` is 'atwill', 'battle'
    // or 'arc' — an at-will has nothing to spend, so use `left` only to say
    // whether it currently applies. `trigger` is what the action costs
    // ('standard', 'free', 'missed', 'hit') and is what the panel's tag
    // column shows — set it, or the row reads as a standard action. `note`
    // is an optional short reminder shown on the row; `title` an optional
    // tooltip (otherwise the row hovers as your class name).
    //
    // `target` is a CSS selector for whatever on the sheet the row is
    // about. Give one and the row becomes clickable: the sheet scrolls to
    // it and outlines it. Every element the selector matches is outlined,
    // so one row can point at a pair (the barbarian's two raging attacks
    // are one choice); the scroll goes to the first. It is looked up when
    // the row is clicked, so a selector for something your slots rebuild is
    // fine — point it at your own elements, not at a node you are holding
    // on to. Omit it and the row is simply not clickable.
    // battleHelper() {
    //   const d = classData('template');
    //   return [
    //     { name: 'Focused strike', trigger: 'standard', track: 'atwill',
    //       note: 'instead of a basic attack', target: '.my-panel',
    //       left: d.focused ? 1 : 0 },
    //     { name: 'Second wind', trigger: 'free', track: 'battle',
    //       left: d.wind ? 0 : 1 },
    //   ];
    // },

    // ── Lifecycle hooks (all optional) ──
    // onMount:      class selected — arbitrary DOM work the slots can't do
    //               (hide a section, retitle a heading, …).
    // onUnmount:    switched away — undo anything onMount did outside a slot.
    // onQuickRest:  the Quick Rest button was pressed (end of battle).
    // onFullHeal:   the Full Heal-Up button was pressed (end of arc).
    // onMount() {},
    // onUnmount() {},
    // onQuickRest() {},
    // onFullHeal() {},

  });

})();
