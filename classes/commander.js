// ── COMMANDER — 13th Age 2e ──
// Base numbers, armor table and basic attacks. Anything else about the
// class — an inline panel, whole new sections, auto-calculated fields, rest
// hooks — can be added right here. See _template.js for the module API.
registerClass('commander', {

  // AC comes from the armor table below; these two are flat.
  defenses: { pd: 10, md: 12 },

  // BASE AC by armor type, and the attack penalty each carries. The
  // shield `ac` is only the placeholder on the hand-typed Shield box.
  // The Armor Skills talent removes the heavy-armor penalty — tick the
    // No Armor Penalty switch on the sheet for it.
  armor: {
    none:   { ac: 10 },
    light:  { ac: 12 },
    heavy:  { ac: 14, atk: -2 },
    shield: { ac: 1 },
    default: 'light',
  },

  // max HP = (baseHp + Con mod) × level multiplier.
  baseHp: 7,

  // Basic attacks are the standard Strength melee / Dexterity ranged, so
  // there is no `attacks` block — the sheet's defaults already fit.

  // Recovery dice = one per level, + Con mod, scaled by tier.
  recoveryDie: 8,

});
