// ═══════════════════════════════════════════════════════════════════════
//  BARD — 13th Age 2e
//  Base numbers, and the Strength-or-Dexterity choice that sets both the
//  melee attack ability and the recovery die.
//  See _template.js for the module API.
// ═══════════════════════════════════════════════════════════════════════
(function () {

  // ── Recovery die ────────────────────────────────────────────────────
  // A bard alone among the classes doesn't have one: it's d8 for a bard
  // who fights with Strength, d6 for one who fights with Dexterity.
  //
  // That reads off the same decision as the melee attack dropdown, but it
  // is deliberately *not* wired to it. Silently changing how much a bard
  // heals because they retyped an attack field would be a surprise, and
  // the choice is a build decision made once — so it gets a control of its
  // own, sitting beside the dice it decides.
  const BARD_DIE = { str: 8, dex: 6 };

  // A plain field, not a derived one: there is no calculated value to hand
  // back, only which of the two the player picked. Seeding the default
  // here — the builder runs before renderClassContent syncs values out of
  // state.fields — is what puts Strength in the box the first time.
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

    // Base AC assumes the class's standard armor. In different armor, lock
    // the AC field on the sheet and type your own; the lock is preserved.
    defenses: { ac: 12, pd: 10, md: 11 },

    // max HP = (baseHp + Con mod) × level multiplier.
    baseHp: 7,

    // No `recoveryDie`: the derived entry below replaces the calculation
    // that would have read it.

    // A bard picks Strength or Dexterity for melee attacks. The dropdown on
    // the sheet starts on the first and remembers whichever you choose.
    attacks: { melee: { choice: ['str', 'dex'] } },

    slots: {
      recovery: buildRecoveryChoice,
    },

    derived: {
      // Same formula every class uses — one die per level plus the scaled
      // Con mod — with the die coming from the dropdown instead of from a
      // constant. The extra source is what makes changing it recompute.
      recovery_dice: {
        sources: ['class', 'level', 'con_mod', 'bard_recovery_ability'],
        calc: f => recoveryDiceFor(f, BARD_DIE[f.bard_recovery_ability] || BARD_DIE.str),
      },
    },

    css: `
      /* Sized like the other dropdowns on the sheet: room for the native
         arrow, and wide enough for "Dexterity — d6" rather than stretched
         across the row. */
      select.field-inline.bard-die-select {
        width: auto; padding-right: 16px; cursor: pointer;
        font-size: var(--fs-sm);
      }
    `,

  });

})();
