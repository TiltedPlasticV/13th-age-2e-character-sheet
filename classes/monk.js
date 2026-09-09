// ── MONK — 13th Age 2e ──
// Base numbers and basic attacks. Anything else about the class — an
// inline panel, whole new sections, auto-calculated fields, rest hooks —
// can be added right here. See _template.js for the full module API.
registerClass('monk', {

  // Base AC assumes the class's standard armor. In different armor, lock
  // the AC field on the sheet and type your own; the lock is preserved.
  defenses: { ac: 11, pd: 11, md: 11 },

  // max HP = (baseHp + Con mod) × level multiplier.
  baseHp: 7,

  // Recovery dice = one per level, + Con mod, scaled by tier.
  recoveryDie: 8,

  // The only class whose two halves differ by default: a monk's melee
  // attack is Dexterity to hit and Strength to damage. Their fist is the
  // weapon, and like any weapon its die is typed into the card.
  attacks: {
    melee: {
      ability: 'dex', dmgAbility: 'str',
      note: 'Your punch is a weapon: d8 per level.',
    },
  },

});
