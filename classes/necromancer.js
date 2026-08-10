// ── NECROMANCER — 13th Age 2e ──
// Base numbers only. Anything else about the class — extra attacks, an
// inline panel, whole new sections, auto-calculated fields, rest hooks —
// can be added right here. See _template.js for the full module API.
registerClass('necromancer', {

  // Base AC assumes the class's standard armor. In different armor, lock
  // the AC field on the sheet and type your own; the lock is preserved.
  defenses: { ac: 10, pd: 10, md: 11 },

  // max HP = (baseHp + Con mod) × level multiplier.
  baseHp: 6,

  // Recovery dice = one per level, + Con mod. Deliberately frail: unlike
  // every other class the Con mod stays flat, with no ×2 at 5th or ×4 at 8th.
  recoveryDie: 6,
  recoveryConScales: false,

});
