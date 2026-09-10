// ── OCCULTIST — 13th Age 2e ──  See _template.js for the module API.
registerClass('occultist', {

  defenses: { pd: 10, md: 11 },

  armor: {
    none:   { ac: 11 },
    light:  { ac: 11 },
    heavy:  { ac: 13, atk: -2 },
    shield: { ac: 1, atk: -2 },
    default: 'light',
  },

  baseHp: 6,
  recoveryDie: 6,

});
