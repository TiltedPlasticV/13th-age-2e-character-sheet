// ── COMMANDER — 13th Age 2e ──  See _template.js for the module API.
registerClass('commander', {

  defenses: { pd: 10, md: 12 },

  // The Armor Skills talent removes the heavy-armor penalty — that is what the
  // No Armor Penalty switch on the sheet is for.
  armor: {
    none:   { ac: 10 },
    light:  { ac: 12 },
    heavy:  { ac: 14, atk: -2 },
    shield: { ac: 1 },
    default: 'light',
  },

  baseHp: 7,
  recoveryDie: 8,

});
