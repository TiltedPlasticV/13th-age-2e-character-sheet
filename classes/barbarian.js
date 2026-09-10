// ═══════════════════════════════════════════════════════════════════════
//  BARBARIAN — 13th Age 2e
//  See _template.js for the module API.
// ═══════════════════════════════════════════════════════════════════════
(function () {

  // ── Raging attacks ──────────────────────────────────────────────────
  // Both are "as your basic attack except …", so everything on them derives
  // from the basic attack fields — see `derived` below.

  function twiceLevel(f) {
    const lvl = intOrNull(f.level);
    return lvl === null ? '' : lvl * 2;
  }

  // +4 on the usual 20+. Editable per attack in case something widens it more.
  function ragingCritFrom(prefix) {
    const n = intOrNull(state.fields[prefix + '_crit']);
    return (n === null || n < 2 || n > 20) ? 16 : n;
  }

  function rollRagingAttack(prefix, title, badge) {
    collectState();
    if (!classData('barbarian').raging) showToast('You are not raging');
    const weapon = (state.fields[prefix + '_weapon'] || '').trim();
    const label = title
      + (badge.label === 'vs AC' ? '' : ' · ' + badge.label)
      + (weapon ? ' — ' + weapon : '');
    rollD20(label, intOrZero(state.fields[badge.field]),
            { escalation: true, critFrom: ragingCritFrom(prefix) });
  }

  function buildRagingCard(cfg) {
    const p = cfg.prefix;
    return el('div', { class: 'attack-card rage-attack' },
      el('div', { class: 'attack-card-body' },
        el('div', { class: 'attack-title' }, cfg.title,
          el('span', { class: 'attack-tag' }, 'At-Will while raging')
        ),
        el('div', { class: 'attack-weapon' },
          el('input', {
            class: 'field-inline', 'data-field': p + '_weapon',
            placeholder: 'Weapon', 'aria-label': cfg.title + ' weapon'
          })
        ),
        el('div', { class: 'attack-stats' },
          el('span', { class: 'attack-label' }, 'Hit Dmg'),
          el('input', {
            // `field-grow` for the same reason the basic attack cards have
            // it: at epic tier the expression runs to "10d12+31".
            class: 'field-inline field-grow', 'data-field': p + '_damage',
            placeholder: '1d8+4', 'aria-label': cfg.title + ' hit damage'
          }),
          el('button', {
            class: 'roll-btn', title: 'Roll ' + cfg.title + ' damage',
            'aria-label': 'Roll ' + cfg.title + ' damage',
            onclick: () => rollDamage(p + '_damage', cfg.title + ' damage')
          }, '🎲'),
          el('span', { class: 'attack-sep' }, '/'),
          el('span', { class: 'attack-label' }, 'Avg'),
          el('input', {
            class: 'field-inline field-sm', 'data-field': p + '_avg',
            inputmode: 'numeric', placeholder: '—',
            'aria-label': cfg.title + ' average damage'
          }),
          el('span', { class: 'attack-sep' }, '/'),
          el('span', { class: 'attack-label', title: 'Miss: damage equal to twice your level' }, 'Miss'),
          el('input', {
            class: 'field-inline field-sm', 'data-field': p + '_miss',
            inputmode: 'numeric', placeholder: '—',
            'aria-label': cfg.title + ' miss damage'
          })
        ),
        el('div', { class: 'note note-row' },
          el('span', { title: 'Your crit range increases by 4, usually to 16+' }, 'Crit'),
          // The "+" sits inside the box with the number so the control reads
          // as "16+" rather than trailing off into the note text.
          el('span', { class: 'crit-box' },
            el('input', {
              class: 'field-inline field-xs', 'data-field': p + '_crit',
              inputmode: 'numeric', placeholder: '16',
              title: 'Your crit range increases by 4, usually to 16+',
              'aria-label': cfg.title + ' crit range'
            }),
            el('span', { class: 'crit-plus', 'aria-hidden': 'true' }, '+')
          ),
          el('span', {}, '· ' + cfg.note)
        )
      ),
      el('div', { class: 'attack-ac-group' }, cfg.badges.map(b =>
        el('div', { class: 'attack-ac-badge' },
          el('span', { class: 'attack-ac-label' }, b.label),
          el('input', {
            class: 'field-inline', 'data-field': b.field, placeholder: '±',
            'aria-label': `${cfg.title} attack bonus (${b.label})`
          }),
          el('button', {
            class: 'roll-btn',
            title: `Roll ${cfg.title}: d20 + bonus + escalation die, critting on your raging crit range`,
            'aria-label': `Roll ${cfg.title} (${b.label})`,
            onclick: () => rollRagingAttack(p, cfg.title, b)
          }, '🎲')
        )
      ))
    );
  }

  function buildAttacks() {
    return el('div', { class: 'attack-cards' },
      buildRagingCard({
        title: 'Raging Strike', prefix: 'barb_rs',
        note: 'otherwise as your basic melee attack',
        badges: [{ label: 'vs AC', field: 'barb_rs_vs_ac' }]
      }),
      buildRagingCard({
        title: 'Raging Throw', prefix: 'barb_rt',
        note: 'thrown weapon only; otherwise as your basic ranged attack',
        badges: [
          { label: 'Near', field: 'barb_rt_vs_ac_near' },
          { label: 'Far',  field: 'barb_rt_vs_ac_far' }
        ]
      })
    );
  }

  // ── Skull defense bonus ─────────────────────────────────────────────
  // 1+ skulls gives +1 to all defenses, 2+ raises it to +2. A reminder only —
  // the player judges when it actually applies better than the sheet can.
  //
  // The brackets sit under skull boxes the sheet owns and rebuilds, so they
  // have to be measured rather than laid out — hence the MutationObserver.

  let _skullWatch = null;
  const _reposition = () => positionSkullBonus();

  // Smallest breathing space allowed between the two labels. They are centred
  // on their brackets and overhang them freely, so with a wide enough font
  // "+1 to defenses" runs into "+2 to defenses" unless the track makes room.
  const LABEL_GAP = 10;

  function buildSkullBonus() {
    return el('div', { class: 'skull-bonus', id: 'barb-skull-bonus' });
  }

  function skullBonusSeg(host, fromEl, toEl, bonus, tip) {
    const base = host.getBoundingClientRect();
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    return el('div', {
      class: 'skull-bonus-seg', title: tip,
      style: `left:${a.left - base.left}px; width:${b.right - a.left}px`
    }, el('span', { class: 'note skull-bonus-label' },
      el('b', {}, bonus), ' to defenses'));
  }

  // Extra space in front of the middle group, pushing the +2 bracket and its
  // label clear of the +1 one. It goes on the `[`, not on the first skull:
  // `.skull-box` transitions `all`, so a margin set there animates and the
  // re-measure below would read the layout it was moving away from.
  function setSkullLeadGap(px) {
    const open = document.querySelector('#skulls-row .skull-bracket');
    if (open) open.style.marginLeft = px ? px + 'px' : '';
  }

  // False when there is nothing to draw: too few skulls, or a track that has
  // wrapped, where the brackets would point at the wrong skulls.
  function drawSkullBonus(host, row) {
    host.innerHTML = '';
    const skulls = [...row.querySelectorAll('.skull-box')];
    // The final skull is death, so nothing is drawn under it.
    if (skulls.length < 3) return false;
    const first    = skulls[0];
    const midStart = skulls[1];
    const midEnd   = skulls[skulls.length - 2];
    if (Math.abs(midEnd.offsetTop - first.offsetTop) > 2) return false;
    host.append(
      skullBonusSeg(host, first, first, '+1',
        'With one or more skulls you gain a +1 bonus to all your defenses'),
      skullBonusSeg(host, midStart, midEnd, '+2',
        'With two or more skulls the bonus increases to +2 to all your defenses')
    );
    return true;
  }

  // How much the labels overlap, once the required gap is counted.
  function labelOverlap(host) {
    const [a, b] = host.querySelectorAll('.skull-bonus-label');
    if (!a || !b) return 0;
    return Math.ceil(a.getBoundingClientRect().right + LABEL_GAP
                     - b.getBoundingClientRect().left);
  }

  function positionSkullBonus() {
    const host = document.getElementById('barb-skull-bonus');
    const row = document.getElementById('skulls-row');
    if (!host || !row) return;
    // Unspaced first, so the gap shrinks back as readily as it grows.
    setSkullLeadGap(0);
    if (!drawSkullBonus(host, row)) return;
    // Widening the gap moves the labels apart, but the row is centred and
    // wraps, so not always by the full amount — hence measure, widen, measure
    // again. It converges in one or two passes; the cap is a stop, not a plan.
    let gap = 0;
    for (let pass = 0; pass < 4; pass++) {
      const short = labelOverlap(host);
      if (short <= 0) break;
      gap += short;
      setSkullLeadGap(gap);
      if (!drawSkullBonus(host, row)) {
        // The wider track wrapped. Cramped labels beat none at all.
        setSkullLeadGap(0);
        drawSkullBonus(host, row);
        break;
      }
    }
  }

  // Until the fonts arrive the labels are still sized in the fallback face.
  function repositionWhenFontsReady() {
    _reposition();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(_reposition);
  }

  // Idempotent: onMount runs on every re-render, not just on class change.
  function watchSkulls() {
    repositionWhenFontsReady();
    if (_skullWatch) return;
    const row = document.getElementById('skulls-row');
    if (!row) return;
    _skullWatch = new MutationObserver(repositionWhenFontsReady);
    _skullWatch.observe(row, { childList: true });
    // Themes carry their own body font, and a wider one is exactly what makes
    // the labels collide — so a theme switch has to re-measure too.
    _skullWatch.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', _reposition);
  }

  function unwatchSkulls() {
    if (_skullWatch) { _skullWatch.disconnect(); _skullWatch = null; }
    window.removeEventListener('resize', _reposition);
    setSkullLeadGap(0);
  }

  // ── Rage panel ───────────────────────────────────────────────────────

  function setRaging(on, opts = {}) {
    const d = classData('barbarian');
    if (on) d.raging = true; else delete d.raging;
    updateRageUi();
    if (!opts.silent) {
      logAction(on ? 'Rage started' : 'Rage ended',
        on ? 'Raging strike / raging throw replace your basic attacks'
           : 'Basic attacks only');
    }
    saveNow();
  }

  // `body.raging` drives the panel glow and un-dims the raging attack cards.
  function updateRageUi() {
    const on = state.fields.class === 'barbarian' && !!classData('barbarian').raging;
    document.body.classList.toggle('raging', on);
    const sw = document.getElementById('rage-switch');
    if (!sw) return;
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    const label = document.getElementById('rage-switch-label');
    if (label) label.textContent = on ? 'Raging' : 'Not raging';
  }

  // d12 + escalation die, 9+ starts the rage. Serves both the start-of-turn
  // check and the first-time-damaged-each-battle one.
  function rollRageDie() {
    const nat = rollDie(12);
    const esc = state.escalation || 0;
    const total = nat + esc;
    const started = total >= 9;
    logRoll('Rage die — ' + (started ? 'RAGING!' : 'no rage'),
            `d12: ${nat}` + (esc ? `  esc +${esc}` : '') + '  (need 9+)',
            total, started ? 'crit' : '');
    if (started && !classData('barbarian').raging) setRaging(true, { silent: true });
  }

  // One-box tracker backed by classData('barbarian')[prop].
  function rageTracker(prop, label, track, tip) {
    const box = el('div', {
      class: 'check-box' + (classData('barbarian')[prop] ? ' checked' : ''),
      role: 'checkbox', tabindex: '0',
      'aria-checked': classData('barbarian')[prop] ? 'true' : 'false',
      'aria-label': label
    }, '✕');
    box.addEventListener('click', () => {
      const d = classData('barbarian');
      const next = !d[prop];
      if (next) d[prop] = true; else delete d[prop];
      box.classList.toggle('checked', next);
      box.setAttribute('aria-checked', next ? 'true' : 'false');
      saveNow();
    });
    return el('div', { class: 'class-track', title: tip },
      box,
      el('span', { class: 'class-track-label' }, label),
      trackAnnotation(track)
    );
  }

  function buildRagePanel() {
    const raging = !!classData('barbarian').raging;
    return el('div', { class: 'class-panel rage-panel' },
      el('div', { class: 'class-panel-head' },
        el('span', {}, '🔥 Rage'),
        el('div', {
          class: 'class-switch' + (raging ? ' on' : ''), id: 'rage-switch',
          role: 'switch', tabindex: '0',
          'aria-checked': raging ? 'true' : 'false', 'aria-label': 'Raging',
          title: 'Are you raging right now?',
          onclick: () => setRaging(!classData('barbarian').raging)
        },
          el('span', { class: 'class-switch-label', id: 'rage-switch-label' },
             raging ? 'Raging' : 'Not raging'),
          el('span', { class: 'class-switch-track' },
             el('span', { class: 'class-switch-knob' }))
        )
      ),
      el('div', { class: 'class-track-row' },
        el('button', {
          // .dice-action goes with the dice roller when it is switched off.
          class: 'action-btn dice-action',
          title: 'Free action: roll d12 + escalation die — 9+ and you start raging',
          onclick: rollRageDie
        }, '🎲 Rage die'),
        rageTracker('freeUsed', 'Free start', 'arc',
          'Once per arc you can start raging as a free action on your turn'),
        rageTracker('hitCheck', 'When hit', 'battle',
          'The first time an enemy attack damages you each battle you can roll the rage die')
      ),
      el('div', { class: 'note' },
        'While raging, use raging strike or raging throw instead of basic attacks.'),
      el('div', { class: 'note' },
        el('b', {}, 'To start: '), 'spend your ¹/arc use, or roll 9+ on d12 + ESC — ',
        'at the start of your turn, and the first time each battle an enemy attack damages you.'),
      el('div', { class: 'note' },
        el('b', {}, 'Ends: '), 'on a failed death save (you can restart) or when the battle ends.')
    );
  }

  // ── Registration ────────────────────────────────────────────────────

  registerClass('barbarian', {

    defenses: { pd: 11, md: 10 },

    armor: {
      none:   { ac: 11 },
      light:  { ac: 12 },
      heavy:  { ac: 13, atk: -2 },
      shield: { ac: 1 },
      default: 'light',
    },

    baseHp: 7,
    recoveryDie: 12,

    attacks: { ranged: { note: 'Thrown weapons add Strength damage instead of Dexterity.' } },

    slots: {
      attacks:        buildAttacks,
      'hp-side':      buildRagePanel,
      'skulls-under': buildSkullBonus,
    },

    derived: {
      barb_rs_weapon: { sources: ['melee_weapon'],   calc: f => f.melee_weapon || '' },
      barb_rs_damage: { sources: ['melee_damage'],   calc: f => f.melee_damage || '' },
      barb_rs_avg:    { sources: ['barb_rs_damage'], calc: f => diceAvg(f.barb_rs_damage) },
      barb_rs_miss:   { sources: ['level'],          calc: twiceLevel },
      barb_rs_vs_ac:  { sources: ['melee_vs_ac'],    calc: f => f.melee_vs_ac || '' },
      barb_rt_weapon: { sources: ['ranged_weapon'],  calc: f => f.ranged_weapon || '' },
      barb_rt_damage: { sources: ['ranged_damage'],  calc: f => f.ranged_damage || '' },
      barb_rt_avg:    { sources: ['barb_rt_damage'], calc: f => diceAvg(f.barb_rt_damage) },
      barb_rt_miss:   { sources: ['level'],          calc: twiceLevel },
      barb_rt_vs_ac_near: { sources: ['ranged_vs_ac_near'], calc: f => f.ranged_vs_ac_near || '' },
      barb_rt_vs_ac_far:  { sources: ['ranged_vs_ac_far'],  calc: f => f.ranged_vs_ac_far || '' },
    },

    css: `
      /* The number and its "+" share one bordered box, so "16+" reads as a
         single value and focuses as a unit. */
      .crit-box {
        display: inline-flex; align-items: center;
        background: var(--field-bg);
        border: 1px solid var(--field-border);
        border-radius: 3px;
        padding-right: 4px;
        transition: border-color 0.2s, box-shadow 0.2s, background 0.3s;
      }
      .crit-box:focus-within {
        border-color: var(--highlight-dim);
        box-shadow: 0 0 0 2px var(--field-focus);
      }
      .crit-box input.field-inline,
      .crit-box input.field-inline:focus {
        width: 16px; min-width: 0;
        padding: 1px 1px 1px 3px;
        text-align: right;
        border: none; background: none; box-shadow: none;
      }
      .crit-plus { color: var(--ink-dim); line-height: 1; }

      /* Brackets under the skull track. Segments are positioned from measured
         skull positions; labels may overhang their bracket. */
      .skull-bonus { position: relative; height: 22px; }
      .skull-bonus-seg {
        position: absolute; top: 0; height: 5px;
        border: 1px solid var(--field-border);
        border-top: none;
        border-radius: 0 0 3px 3px;
        opacity: 0.7;
      }
      /* Layout only — the text is a plain .note. The bonus takes the highlight
         rather than the lead-in colour a note's bold normally gets. */
      .skull-bonus-label {
        position: absolute; top: 6px; left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
      }
      .skull-bonus-label b { color: var(--highlight); }

      body.raging .rage-panel {
        border-color: var(--highlight);
        box-shadow: 0 0 12px -4px var(--highlight);
      }
      /* Raging strike / throw only work while raging — dim them until then. */
      .rage-attack { transition: opacity 0.25s; }
      body:not(.raging) .rage-attack { opacity: 0.45; }
      @media print { .rage-attack { opacity: 1 !important; } }
    `,

    onMount() {
      updateRageUi();
      watchSkulls();
    },

    onUnmount() {
      document.body.classList.remove('raging');
      unwatchSkulls();
    },

    battleHelper() {
      const d = classData('barbarian');
      const raging = !!d.raging;
      // All three are ways to *start* raging, so none is worth listing once
      // you already are — they come back, unspent, the moment it ends.
      const start = spent => (raging || spent) ? 0 : 1;
      return [
        // Free and repeatable every turn, so it sits with the at-will actions
        // rather than the two one-shot ways in.
        { name: 'Rage die', note: 'start of turn · 9+', track: 'atwill',
          trigger: 'free', target: '.rage-panel',
          title: 'Free action at the start of your turn: roll d12 + the '
               + 'escalation die, and on 9+ you start raging.',
          left: start(false) },
        // No note: the name and the two attack cards say it, and a reminder
        // here pushed the row onto a second line.
        { name: 'Raging strike / throw', track: 'atwill', trigger: 'standard',
          target: '.rage-attack',
          title: 'While raging, these replace your basic attacks.',
          left: raging ? 1 : 0 },
        { name: 'Rage: free start', track: 'arc',    trigger: 'free',
          target: '.rage-panel', left: start(d.freeUsed) },
        { name: 'Rage: when hit',   track: 'battle', trigger: 'hit',
          target: '.rage-panel', left: start(d.hitCheck) },
      ];
    },

    // Post-battle: the rage ends and the when-hit check comes back.
    onQuickRest() {
      const d = classData('barbarian');
      const wasRaging = !!d.raging;
      delete d.raging;
      delete d.hitCheck;
      mountClassSlot('hp-side');
      updateRageUi();
      if (wasRaging) logAction('Rage ended', 'The battle is over');
    },

    // The arc turns over too, so the free start comes back.
    onFullHeal() {
      const d = classData('barbarian');
      delete d.raging;
      delete d.hitCheck;
      delete d.freeUsed;
      mountClassSlot('hp-side');
      updateRageUi();
    },
  });

})();
