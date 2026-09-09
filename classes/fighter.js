// ── FIGHTER — 13th Age 2e ──
// Base numbers, armor table and basic attacks. Anything else about the
// class — an inline panel, whole new sections, auto-calculated fields, rest
// hooks — can be added right here. See _template.js for the module API.
registerClass('fighter', {

  // AC comes from the armor table below; these two are flat.
  defenses: { pd: 10, md: 10 },

  // BASE AC by armor type, and the attack penalty each carries. The
  // shield `ac` is only the placeholder on the hand-typed Shield box.
  armor: {
    none:   { ac: 10 },
    light:  { ac: 13 },
    heavy:  { ac: 15 },
    shield: { ac: 1 },
    default: 'heavy',
  },

  // max HP = (baseHp + Con mod) × level multiplier.
  baseHp: 7,

  // Recovery dice = one per level, + Con mod, scaled by tier.
  recoveryDie: 10,

  // A thrown weapon is still a Dexterity attack — only the damage changes,
  // so the note points at the Dmg dropdown rather than doing anything.
  attacks: { ranged: { note: 'Thrown weapons add Strength damage instead of Dexterity.' } },

});
