// ── WIZARD — 13th Age 2e ──
// Base numbers, armor table and basic attacks. Anything else about the
// class — an inline panel, whole new sections, auto-calculated fields, rest
// hooks — can be added right here. See _template.js for the module API.
registerClass('wizard', {

  // AC comes from the armor table below; these two are flat.
  defenses: { pd: 10, md: 12 },

  // BASE AC by armor type, and the attack penalty each carries. The
  // shield `ac` is only the placeholder on the hand-typed Shield box.
  armor: {
    none:   { ac: 9 },
    light:  { ac: 10 },
    heavy:  { ac: 11, atk: -2 },
    shield: { ac: 1, atk: -2 },
    default: 'light',
  },

  // max HP = (baseHp + Con mod) × level multiplier.
  baseHp: 6,

  // Recovery dice = one per level, + Con mod, scaled by tier.
  recoveryDie: 6,

});
