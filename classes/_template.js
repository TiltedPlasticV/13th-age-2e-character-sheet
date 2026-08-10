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
    // Recovery dice = one die per level, + Con mod (×2 from 5th level, ×4
    // from 8th). Omit if you're unsure and the Recovery Dice field stays
    // blank and hand-typed.
    recoveryDie: 8,
    // Set false only for a class whose Con mod stays flat at every level
    // (the necromancer). Omit it and the ×2 / ×4 above apply.
    // recoveryConScales: false,

    // ── UI injected into the sheet ──
    // Each slot maps to a `[data-class-slot]` host in the HTML:
    //   'attacks'      — extra attack cards in the Basic Attacks section
    //   'hp-side'      — inline panel right of recoveries + skulls
    //   'skulls-under' — strip directly beneath the skull track
    //   'sections'     — whole extra sections, after Basic Attacks
    // Each builder returns one DOM node (use el()).
    slots: {
      // 'hp-side': () => el('div', { class: 'class-panel' },
      //   el('div', { class: 'class-panel-head' }, 'Focus'),
      //   el('div', { class: 'note' }, 'Rules reminder…')),
    },

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
    // var(--ink-dim), …) so it works in all 8 themes.
    css: `
      /* .my-panel { … } */
    `,

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
