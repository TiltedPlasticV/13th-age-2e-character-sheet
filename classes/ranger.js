// ── RANGER — 13th Age 2e ──  See _template.js for the module API.
registerClass('ranger', {

  defenses: { pd: 11, md: 10 },

  armor: {
    none:   { ac: 10 },
    light:  { ac: 13 },
    heavy:  { ac: 14, atk: -2 },
    // A ranger who fights with Strength carries a shield without penalty.
    shield: { ac: 1, atk: f => f.melee_atk_ability === 'str' ? 0 : -2 },
    default: 'light',
  },

  baseHp: 7,
  recoveryDie: 6,

  attacks: {
    melee:  { choice: ['str', 'dex'] },
    ranged: { missDamage: true },
  },

});
