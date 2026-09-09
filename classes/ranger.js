// ── RANGER — 13th Age 2e ──
// Base numbers, armor table and basic attacks. Anything else about the
// class — an inline panel, whole new sections, auto-calculated fields, rest
// hooks — can be added right here. See _template.js for the module API.
registerClass('ranger', {

  // AC comes from the armor table below; these two are flat.
  defenses: { pd: 11, md: 10 },

  // BASE AC by armor type, and the attack penalty each carries. The
  // shield `ac` is only the placeholder on the hand-typed Shield box.
  armor: {
    none:   { ac: 10 },
    light:  { ac: 13 },
    heavy:  { ac: 14, atk: -2 },
    // A ranger who fights with Strength carries a shield without penalty.
    shield: { ac: 1, atk: f => f.melee_atk_ability === 'str' ? 0 : -2 },
    default: 'light',
  },

  // max HP = (baseHp + Con mod) × level multiplier.
  baseHp: 7,

  // Recovery dice = one per level, + Con mod, scaled by tier.
  recoveryDie: 6,

  // A ranger picks Strength or Dexterity for melee attacks — the dropdown
  // on the sheet starts on the first and remembers whichever you choose —
  // and a missed ranged attack still deals damage equal to your level,
  // which most classes don't get.
  attacks: {
    melee:  { choice: ['str', 'dex'] },
    ranged: { missDamage: true },
  },

});
