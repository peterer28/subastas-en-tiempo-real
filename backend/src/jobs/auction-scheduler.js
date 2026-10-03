const { startDueAuctions, closeDueAuctions } = require('../services/auction.service');

// Revisa cada segundo: abre subastas programadas y cierra las que llegaron a cero.
const TICK_MS = 1000;
let running = false;

function startScheduler() {
  setInterval(async () => {
    if (running) return; // evita solapamiento si un ciclo tarda más de 1 s
    running = true;
    try {
      await startDueAuctions();
      await closeDueAuctions();
    } catch (err) {
      console.error('[scheduler]', err.message);
    } finally {
      running = false;
    }
  }, TICK_MS);
  console.log('[scheduler] activo');
}

module.exports = { startScheduler };
