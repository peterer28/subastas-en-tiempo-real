const crypto = require('crypto');

/**
 * Token anónimo y estable de un postor dentro de UNA subasta.
 * Es distinto en cada subasta, no se puede revertir al userId y
 * permite al frontend saber si "va ganando" sin conocer identidades.
 */
function bidderToken(auctionId, userId) {
  return crypto
    .createHmac('sha256', process.env.BIDDER_SECRET || 'dev-secret')
    .update(`${auctionId}:${userId}`)
    .digest('hex')
    .slice(0, 16);
}

/** Alias censurado que se muestra en el historial, ej. "**469". */
function bidderAlias(token) {
  const n = parseInt(token.slice(0, 6), 16) % 1000;
  return `**${String(n).padStart(3, '0')}`;
}

/**
 * Monto mínimo de la siguiente puja:
 *  - sin pujas: el monto base
 *  - con pujas: la oferta actual + incremento mínimo (10 %), redondeado hacia arriba
 */
function nextMinBid(currentBid, basePrice, incrementPct = 10) {
  if (!currentBid || currentBid <= 0) return Math.ceil(basePrice);
  return Math.ceil(currentBid * (1 + incrementPct / 100));
}

module.exports = { bidderToken, bidderAlias, nextMinBid };
