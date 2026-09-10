// ── FIGHTER — 13th Age 2e ──  See _template.js for the module API.
registerClass('fighter', {

  defenses: { pd: 10, md: 10 },

  armor: {
    none:   { ac: 10 },
    light:  { ac: 13 },
    heavy:  { ac: 15 },
    shield: { ac: 1 },
    default: 'heavy',
  },

  baseHp: 7,
  recoveryDie: 10,

  attacks: { ranged: { note: 'Thrown weapons add Strength damage instead of Dexterity.' } },

});
