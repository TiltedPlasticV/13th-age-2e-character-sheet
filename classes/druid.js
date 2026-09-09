// ── DRUID — 13th Age 2e ──
// Base numbers, armor table and basic attacks. Anything else about the
// class — an inline panel, whole new sections, auto-calculated fields, rest
// hooks — can be added right here. See _template.js for the module API.
registerClass('druid', {

  // AC comes from the armor table below; these two are flat.
  defenses: { pd: 11, md: 11 },

  // BASE AC by armor type, and the attack penalty each carries. The
  // shield `ac` is only the placeholder on the hand-typed Shield box.
  // The printed table asterisks light armor and both shield entries:
    // what a druid gets from either depends on their talents. The numbers
    // below are the unmodified ones, and the No Armor Penalty switch
    // covers the talents that lift the penalties.
  armor: {
    none:   { ac: 10 },
    light:  { ac: 10 },
    heavy:  { ac: 14, atk: -2 },
    shield: { ac: 0, atk: -2 },
    default: 'light',
  },

  // max HP = (baseHp + Con mod) × level multiplier.
  baseHp: 7,

  // Recovery dice = one per level, + Con mod, scaled by tier.
  recoveryDie: 6,

  // A druid picks Strength or Dexterity for melee attacks. The dropdown on
  // the sheet starts on the first and remembers whichever you choose.
  attacks: { melee: { choice: ['str', 'dex'] } },

});
