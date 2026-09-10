// ── PALADIN — 13th Age 2e ──  See _template.js for the module API.
registerClass('paladin', {

  defenses: { pd: 10, md: 12 },

  armor: {
    none:   { ac: 10 },
    light:  { ac: 12 },
    heavy:  { ac: 16 },
    shield: { ac: 1 },
    default: 'heavy',
  },

  baseHp: 7,
  recoveryDie: 10,

  attacks: { ranged: { note: 'Thrown weapons add Strength damage instead of Dexterity.' } },

});
