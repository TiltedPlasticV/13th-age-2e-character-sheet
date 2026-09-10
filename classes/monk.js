// ── MONK — 13th Age 2e ──  See _template.js for the module API.
registerClass('monk', {

  defenses: { pd: 11, md: 11 },

  armor: {
    none:   { ac: 11 },
    light:  { ac: 11 },
    heavy:  { ac: 12, atk: -4 },
    shield: { ac: 1, atk: -2 },
    default: 'light',
  },

  baseHp: 7,
  recoveryDie: 8,

  // The only class whose two halves differ by default: Dex to hit, Str to damage.
  attacks: {
    melee: {
      ability: 'dex', dmgAbility: 'str',
      note: 'Your punch is a weapon: d8 per level.',
    },
  },

});
