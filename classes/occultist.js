// ── OCCULTIST — 13th Age 2e ──
// Base numbers, armor table and basic attacks. Anything else about the
// class — an inline panel, whole new sections, auto-calculated fields, rest
// hooks — can be added right here. See _template.js for the module API.
registerClass('occultist', {

  // AC comes from the armor table below; these two are flat.
  defenses: { pd: 10, md: 11 },

  // BASE AC by armor type, and the attack penalty each carries. The
  // shield `ac` is only the placeholder on the hand-typed Shield box.
  armor: {
    none:   { ac: 11 },
    light:  { ac: 11 },
    heavy:  { ac: 13, atk: -2 },
    shield: { ac: 1, atk: -2 },
    default: 'light',
  },

  // max HP = (baseHp + Con mod) × level multiplier.
  baseHp: 6,

  // Basic attacks are the standard Strength melee / Dexterity ranged, so
  // there is no `attacks` block — the sheet's defaults already fit.

  // Recovery dice = one per level, + Con mod, scaled by tier.
  recoveryDie: 6,

});
