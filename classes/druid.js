// ── DRUID — 13th Age 2e ──  See _template.js for the module API.
registerClass('druid', {

  defenses: { pd: 11, md: 11 },

  // The printed table asterisks light armor and both shield rows: what a druid
  // gets from either depends on their talents. These are the unmodified
  // numbers, and the No Armor Penalty switch covers the talents that lift them.
  armor: {
    none:   { ac: 10 },
    light:  { ac: 10 },
    heavy:  { ac: 14, atk: -2 },
    shield: { ac: 0, atk: -2 },
    default: 'light',
  },

  baseHp: 7,
  recoveryDie: 6,

  attacks: { melee: { choice: ['str', 'dex'] } },

});
