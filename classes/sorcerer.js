// ── SORCERER — 13th Age 2e ──  See _template.js for the module API.
registerClass('sorcerer', {

  defenses: { pd: 11, md: 10 },

  armor: {
    none:   { ac: 10 },
    light:  { ac: 10 },
    heavy:  { ac: 11, atk: -2 },
    shield: { ac: 1, atk: -2 },
    default: 'light',
  },

  baseHp: 6,
  recoveryDie: 6,

});
