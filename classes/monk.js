// ── MONK — 13th Age 2e ──
// Base numbers, armor table and basic attacks. Anything else about the
// class — an inline panel, whole new sections, auto-calculated fields, rest
// hooks — can be added right here. See _template.js for the module API.
registerClass('monk', {

  // AC comes from the armor table below; these two are flat.
  defenses: { pd: 11, md: 11 },

  // BASE AC by armor type, and the attack penalty each carries. The
  // shield `ac` is only the placeholder on the hand-typed Shield box.
  armor: {
    none:   { ac: 11 },
    light:  { ac: 11 },
    heavy:  { ac: 12, atk: -4 },
    shield: { ac: 1, atk: -2 },
    default: 'light',
  },

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
