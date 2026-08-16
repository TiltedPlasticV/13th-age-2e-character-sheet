// ═══════════════════════════════════════════════════════════════════════
//  ROGUE — 13th Age 2e
//  Base numbers plus the Bravado point tracker.
//  See _template.js for the module API.
// ═══════════════════════════════════════════════════════════════════════
(function () {

  // ── Bravado points ──────────────────────────────────────────────────
  // A plain counter, so it lives in classData('rogue') and survives a
  // class switch. Never negative.

  function bravado() {
    return intOrZero(classData('rogue').bravado);
  }

  function setBravado(n, how) {
    const d = classData('rogue');
    const next = Math.max(0, n);
    if (next) d.bravado = next; else delete d.bravado;
    const box = document.getElementById('rogue-bravado-value');
    if (box) box.textContent = String(next);
    logAction('Bravado ' + how, next + ' point' + (next === 1 ? '' : 's'));
    saveNow();
  }

  function buildBravadoPanel() {
    return el('div', { class: 'class-panel bravado-panel' },
      el('div', { class: 'class-panel-head' }, '🃏 Bravado'),
      el('div', { class: 'bravado-row' },
        el('button', {
          class: 'bravado-btn', title: 'Spend a bravado point',
          'aria-label': 'Decrease bravado points',
          onclick: () => setBravado(bravado() - 1, 'spent')
        }, '−'),
        el('div', {
          class: 'bravado-value', id: 'rogue-bravado-value',
          role: 'status', 'aria-label': 'Bravado points'
        // el() only text-node-ifies strings — a raw number would throw.
        }, String(bravado())),
        el('button', {
          class: 'bravado-btn', title: 'Gain a bravado point',
          'aria-label': 'Increase bravado points',
          onclick: () => setBravado(bravado() + 1, 'gained')
        }, '+')
      ),
      el('div', { class: 'bravado-reset-row' },
        el('button', {
          class: 'action-btn', title: 'Set bravado points back to 0',
          onclick: () => setBravado(0, 'reset')
        }, '↺ Reset')
      )
    );
  }

  // ── Registration ────────────────────────────────────────────────────

  registerClass('rogue', {

    // Base AC assumes the class's standard armor. In different armor, lock
    // the AC field on the sheet and type your own; the lock is preserved.
    defenses: { ac: 12, pd: 12, md: 10 },

    // max HP = (baseHp + Con mod) × level multiplier.
    baseHp: 6,

    // Recovery dice = one per level, + Con mod (×2 from 5th, ×4 from 8th).
    recoveryDie: 8,

    slots: {
      'hp-side': buildBravadoPanel,
    },

    // The counter needs no more room than its buttons — let the recoveries
    // column have the rest.
    slotFit: ['hp-side'],

    css: `
      /* flex:1 takes the space the panel has left over next to the taller
         recoveries column, so the counter sits centred in it. */
      .bravado-row {
        flex: 1;
        display: flex; align-items: center; justify-content: center; gap: 10px;
      }
      .bravado-btn {
        width: 28px; height: 28px; border: 1px solid var(--field-border);
        border-radius: 50%; background: var(--field-bg); color: var(--ink-dim);
        font-size: 16px; line-height: 1; cursor: pointer; transition: all 0.15s;
        display: flex; align-items: center; justify-content: center; padding: 0;
      }
      .bravado-btn:hover { color: var(--highlight); border-color: var(--highlight); }
      .bravado-btn:focus-visible { outline: 2px solid var(--highlight); outline-offset: 2px; }
      .bravado-value {
        min-width: 46px; height: 46px; padding: 0 6px;
        border: 2px solid var(--highlight); border-radius: 9px;
        display: flex; align-items: center; justify-content: center;
        font-family: var(--heading-font); font-size: 26px; font-weight: 700;
        color: var(--highlight); background: var(--accent-dim);
        box-shadow: 0 0 10px -3px var(--highlight-dim);
        transition: background 0.4s, border-color 0.4s, color 0.4s;
      }
      .bravado-reset-row { display: flex; justify-content: center; }
      @media print { .bravado-btn, .bravado-reset-row { display: none; } }
    `,

  });

})();
