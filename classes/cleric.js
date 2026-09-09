// ═══════════════════════════════════════════════════════════════════════
//  CLERIC — 13th Age 2e
//  Base numbers, the armor table, and Armor or Vestments — the one choice
//  that decides how the rest of the sheet reads.
//  See _template.js for the module API.
// ═══════════════════════════════════════════════════════════════════════
(function () {

  // ── Armor or Vestments ──────────────────────────────────────────────
  // A cleric advances as an armored warrior or a lightly armored caster,
  // and the choice reaches three separate places on the sheet:
  //   • which armor row they default to — heavy for Armor, light for
  //     Vestments;
  //   • their recovery die — d10 for Armor, d8 for Vestments;
  //   • whether heavy armor costs them –4 to attack. Armor lifts it, but
  //     only at Strength 15 or better, and the sheet has that score, so it
  //     checks rather than making the player remember.
  // The fourth effect — which ability certain melee spells use — is a note,
  // since spells are free text.
  const CLERIC_DIE = { armor: 10, vestments: 8 };
  const CLERIC_MIN_STR = 15;

  function focus(f) { return f.cleric_focus === 'vestments' ? 'vestments' : 'armor'; }

  // –4 in heavy armor, unless Armor *and* the Strength to wear it.
  function heavyPenalty(f) {
    const strong = intOrZero(f.str_score) >= CLERIC_MIN_STR;
    return (focus(f) === 'armor' && strong) ? 0 : -4;
  }

  // A plain field rather than a derived one: there is no calculated value
  // to hand back, only which of the two the player picked. Seeding the
  // default here — the builder runs before renderClassContent syncs values
  // out of state.fields — is what puts Armor in the box the first time.
  function buildFocusChoice() {
    if (!state.fields.cleric_focus) state.fields.cleric_focus = 'armor';
    return el('div', { class: 'hp-item cleric-focus' },
      el('span', { class: 'hp-label' }, 'Faith'),
      el('select', {
        class: 'field-inline cleric-focus-select',
        'data-field': 'cleric_focus',
        title: 'Armor: heavy armor, d10 recoveries, and Strength for certain '
             + 'melee spells — no attack penalty at Strength '
             + CLERIC_MIN_STR + '+. '
             + 'Vestments: light armor, d8 recoveries, an extra at-will '
             + 'spell, and Wisdom for those melee spells.',
        'aria-label': 'Armor or Vestments'
      },
        el('option', { value: 'armor' }, 'Armor'),
        el('option', { value: 'vestments' }, 'Vestments')
      ),
      el('span', { class: 'note cleric-focus-note', id: 'cleric-focus-note' })
    );
  }

  // The half of the choice the sheet can't compute — which ability those
  // melee spells use, and what Vestments hands you instead.
  function focusNote(f) {
    return focus(f) === 'armor'
      ? 'Str for melee spells'
      : 'Wis for melee spells · +1 at-will spell';
  }

  registerClass('cleric', {

    // AC comes from the armor table below; these two are flat.
    defenses: { pd: 11, md: 11 },

    // BASE AC by armor type, and the attack penalty each carries. The
    // shield `ac` is only the placeholder on the hand-typed Shield box.
    armor: {
      none:   { ac: 10 },
      light:  { ac: 11 },
      heavy:  { ac: 14, atk: heavyPenalty },
      shield: { ac: 1 },
      default: f => (focus(f) === 'armor' ? 'heavy' : 'light'),
    },

    // max HP = (baseHp + Con mod) × level multiplier.
    baseHp: 7,

    // No `recoveryDie`: the derived entry below replaces the calculation
    // that would have read it.

    slots: {
      armor: buildFocusChoice,
    },

    derived: {
      // Both of these follow the choice, so both list it as a source —
      // that is what makes changing the dropdown recompute them.
      armor_type: {
        sources: ['class', 'cleric_focus'],
        calc: armorDefaultRow,
      },
      recovery_dice: {
        sources: ['class', 'level', 'con_mod', 'cleric_focus'],
        calc: f => recoveryDiceFor(f, CLERIC_DIE[focus(f)]),
      },
    },

    onMount() { updateFocusNote(); },

    css: `
      /* Sized like the sheet's other dropdowns: room for the native arrow,
         and wide enough for its longest label. */
      select.field-inline.cleric-focus-select {
        width: auto; padding-right: 16px; cursor: pointer;
        font-size: var(--fs-sm);
      }
      .cleric-focus-note { white-space: nowrap; }
    `,

  });

  // The note is the only part that isn't a field, so it is refreshed by
  // hand — on mount, and whenever the dropdown changes.
  function updateFocusNote() {
    const node = document.getElementById('cleric-focus-note');
    if (node) node.textContent = focusNote(state.fields);
  }
  document.addEventListener('input', e => {
    if (e.target && e.target.dataset && e.target.dataset.field === 'cleric_focus') {
      updateFocusNote();
    }
  });

})();
