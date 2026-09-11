// ═══════════════════════════════════════════════════════════════════════
//  BARD — 13th Age 2e
//  See _template.js for the module API.
// ═══════════════════════════════════════════════════════════════════════
(function () {

  // A bard alone has no fixed recovery die: d8 fighting with Strength, d6 with
  // Dexterity. That is the same decision the melee attack dropdown records, but
  // it deliberately gets a control of its own — quietly changing how much a
  // bard heals because they retyped an attack field would be a nasty surprise.
  const BARD_DIE = { str: 8, dex: 6 };

  // A plain field, not a derived one: there is no calculated value to hand
  // back, only which of the two the player picked. The default is seeded here
  // because the builder runs before renderClassContent syncs values out of
  // state.fields.
  function buildRecoveryChoice() {
    if (!state.fields.bard_recovery_ability) state.fields.bard_recovery_ability = 'str';
    return el('div', { class: 'hp-item bard-die' },
      el('span', { class: 'hp-label' }, 'Based On'),
      el('select', {
        class: 'field-inline bard-die-select',
        'data-field': 'bard_recovery_ability',
        title: 'A bard who fights with Strength recovers on d8s, one who '
             + 'fights with Dexterity on d6s',
        'aria-label': 'Ability your recovery die follows'
      },
        el('option', { value: 'str' }, 'Strength — d8'),
        el('option', { value: 'dex' }, 'Dexterity — d6')
      )
    );
  }

  registerClass('bard', {

    defenses: { pd: 10, md: 11 },

    armor: {
      none:   { ac: 10 },
      light:  { ac: 12 },
      heavy:  { ac: 13, atk: -2 },
      shield: { ac: 1, atk: -1 },
      default: 'light',
    },

    baseHp: 7,

    // No `recoveryDie`: the derived entry below replaces the calculation that
    // would have read it.

    attacks: { melee: { choice: ['str', 'dex'] } },

    slots: {
      recovery: buildRecoveryChoice,
    },

    derived: {
      // The formula every class uses, with the die coming from the dropdown
      // instead of a constant. Listing it as a source is what makes changing
      // the dropdown recompute.
      recovery_dice: {
        sources: ['class', 'level', 'con_mod', 'bard_recovery_ability'],
        calc: f => recoveryDiceFor(f, BARD_DIE[f.bard_recovery_ability] || BARD_DIE.str),
      },
    },

    css: `
      /* Sized like the sheet's other dropdowns: room for the native arrow, and
         wide enough for its longest label. */
      select.field-inline.bard-die-select {
        width: auto; padding-right: 16px;
        font-size: var(--fs-sm);
      }
    `,

  });

})();
