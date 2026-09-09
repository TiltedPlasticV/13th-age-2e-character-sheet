// ── DRUID — 13th Age 2e ──
// Base numbers and basic attacks. Anything else about the class — an
// inline panel, whole new sections, auto-calculated fields, rest hooks —
// can be added right here. See _template.js for the full module API.
registerClass('druid', {

  // Base AC assumes the class's standard armor. In different armor, lock
  // the AC field on the sheet and type your own; the lock is preserved.
  defenses: { ac: 11, pd: 11, md: 11 },

  // max HP = (baseHp + Con mod) × level multiplier.
  baseHp: 7,

  // Recovery dice = one per level, + Con mod, scaled by tier.
  recoveryDie: 6,

  // A druid picks Strength or Dexterity for melee attacks. The dropdown on
  // the sheet starts on the first and remembers whichever you choose.
  attacks: { melee: { choice: ['str', 'dex'] } },

});
