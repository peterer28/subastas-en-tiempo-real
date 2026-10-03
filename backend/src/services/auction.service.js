/**
 * Motor de subastas.
 *
 * - Firebase RTDB es la fuente en tiempo real: los navegadores escuchan
 *   `subastas/auctions/{id}` y `subastas/auctionBids/{id}`. Nadie escribe desde
 *   el navegador (reglas .write = false); solo este backend con firebase-admin.
 * - Cada puja se valida dentro de una transacción de RTDB, así dos pujas
 *   simultáneas nunca se pisan.
 * - PostgreSQL guarda el historial completo de pujas (con el usuario real)
 *   y el resultado final de cada subasta cerrada.
 */
const { pool } = require('../config/db');
const { auctionRef, auctionsRef, bidsRef } = require('../config/firebase');
const { bidderToken, bidderAlias, nextMinBid } = require('../utils/bidder');
const { HttpError } = require('../utils/http');

const OPEN_STATUSES = ['scheduled', 'live'];

/** Nodo de Firebase a partir de una fila de auctions + vehículo. */
function toFirebaseNode(row) {
  const currentBid = row.current_bid ? Number(row.current_bid) : 0;
  const pct = Number(row.min_increment_pct);
  return {
    vehicleId: row.vehicle_id,
    lotNumber: row.lot_number,
    title: `${row.year} ${row.make} ${row.model}`,
    basePrice: Number(row.base_price),
    currency: row.currency,
    minIncrementPct: pct,
    softCloseMs: row.soft_close_seconds * 1000,
    startsAt: new Date(row.starts_at).getTime(),
    endsAt: new Date(row.ends_at).getTime(),
    status: row.status.toLowerCase(),
    currentBid,
    nextMinBid: nextMinBid(currentBid, Number(row.base_price), pct),
    bidCount: row.total_bids,
  };
}

const AUCTION_SQL = `
  SELECT a.*, v.lot_number, v.year, v.seller_id, mk.name AS make, md.name AS model
  FROM auctions a
  JOIN vehicles v ON v.id = a.vehicle_id
  JOIN makes mk ON mk.id = v.make_id
  JOIN models md ON md.id = v.model_id`;

async function getAuctionRow(auctionId, client = pool) {
  const { rows } = await client.query(`${AUCTION_SQL} WHERE a.id = $1`, [auctionId]);
  return rows[0];
}

/** Crea o actualiza (sin tocar pujas) el nodo de una subasta en Firebase. */
async function syncAuctionToFirebase(auctionId) {
  const row = await getAuctionRow(auctionId);
  if (!row) return;
  const node = toFirebaseNode(row);
  await auctionRef(auctionId).transaction((current) => {
    if (current === null) {
      return { ...node, leaderToken: '', leaderAlias: '', lastBidAt: 0, extensions: 0 };
    }
    // Ya existe: solo actualizamos datos de publicación, nunca el estado de pujas.
    return {
      ...current,
      title: node.title,
      basePrice: node.basePrice,
      startsAt: node.startsAt,
      endsAt: current.bidCount > 0 ? current.endsAt : node.endsAt,
      nextMinBid: current.bidCount > 0 ? current.nextMinBid : node.nextMinBid,
    };
  });
}

/** Al arrancar: asegura que toda subasta abierta en PostgreSQL exista en Firebase. */
async function syncOpenAuctions() {
  const { rows } = await pool.query("SELECT id FROM auctions WHERE status IN ('SCHEDULED','LIVE')");
  for (const { id } of rows) {
    const snap = await auctionRef(id).child('status').once('value');
    if (!snap.exists()) await syncAuctionToFirebase(id);
  }
  console.log(`[sync] ${rows.length} subastas abiertas verificadas en Firebase`);
}

/** Token anónimo del usuario para una subasta (para el badge "vas ganando"). */
function getBidderIdentity(auctionId, userId) {
  const token = bidderToken(auctionId, userId);
  return { bidderToken: token, alias: bidderAlias(token) };
}

/**
 * Registra una puja aplicando TODAS las reglas de negocio:
 *  1. Debe estar autenticado (lo garantiza la ruta).
 *  2. El vendedor no puede pujar en su propio vehículo.
 *  3. La subasta debe haber iniciado y no haber cerrado ("Oferta cerrada").
 *  4. Monto ≥ monto base y > puja actual por al menos 10 %.
 *  5. Si quedan ≤ 60 s, la puja reinicia el reloj a 60 s (cierre suave).
 */
async function placeBid(auctionId, userId, rawAmount) {
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw new HttpError(422, 'Escribe un monto válido en quetzales, sin decimales.');
  }

  const row = await getAuctionRow(auctionId);
  if (!row) throw new HttpError(404, 'La subasta no existe.');
  if (row.seller_id === userId) throw new HttpError(403, 'No puedes pujar por tu propia publicación.');

  const token = bidderToken(auctionId, userId);
  const alias = bidderAlias(token);
  let rejection = null;
  let acceptedAt = 0;

  const result = await auctionRef(auctionId).transaction((a) => {
    rejection = null;
    if (a === null) return a; // primera pasada sin caché: Firebase reintenta con el valor real

    const now = Date.now();
    acceptedAt = now;
    const min = nextMinBid(a.currentBid, a.basePrice, a.minIncrementPct);

    if (!OPEN_STATUSES.includes(a.status) || now >= a.endsAt) {
      rejection = { status: 409, message: 'Oferta cerrada: esta subasta ya terminó.' };
      return; // abortar
    }
    if (now < a.startsAt) {
      rejection = { status: 409, message: 'La subasta todavía no ha iniciado.' };
      return;
    }
    if (a.leaderToken === token) {
      rejection = { status: 409, message: 'Ya tienes la puja más alta.' };
      return;
    }
    if (amount < min) {
      rejection = {
        status: 422,
        message: a.currentBid > 0
          ? `Tu oferta debe ser de al menos Q ${min.toLocaleString('en-US')} (10 % sobre la oferta actual).`
          : `La oferta mínima es el monto base: Q ${min.toLocaleString('en-US')}.`,
        nextMinBid: min,
      };
      return;
    }

    const remaining = a.endsAt - now;
    const extend = remaining <= a.softCloseMs;
    return {
      ...a,
      status: 'live',
      currentBid: amount,
      nextMinBid: nextMinBid(amount, a.basePrice, a.minIncrementPct),
      bidCount: (a.bidCount || 0) + 1,
      leaderToken: token,
      leaderAlias: alias,
      lastBidAt: now,
      endsAt: extend ? now + a.softCloseMs : a.endsAt,
      extensions: (a.extensions || 0) + (extend ? 1 : 0),
    };
  });

  if (!result.committed || !result.snapshot.exists()) {
    if (rejection) throw new HttpError(rejection.status, rejection.message, { nextMinBid: rejection.nextMinBid });
    throw new HttpError(404, 'La subasta no está disponible en tiempo real.');
  }

  const state = result.snapshot.val();

  // Historial público (sin identidad) para todos los navegadores conectados
  const bidKey = bidsRef(auctionId).push().key;
  await bidsRef(auctionId).child(bidKey).set({
    amount, alias, bidderToken: token, createdAt: acceptedAt,
  });

  // Trazabilidad en PostgreSQL
  try {
    await pool.query(
      `INSERT INTO bids (auction_id, bidder_id, amount, bidder_alias, firebase_key, placed_at)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))`,
      [auctionId, userId, amount, alias, bidKey, acceptedAt],
    );
    await pool.query(
      `UPDATE auctions SET status = 'LIVE', current_bid = $2, total_bids = total_bids + 1,
              ends_at = to_timestamp($3 / 1000.0)
       WHERE id = $1`,
      [auctionId, amount, state.endsAt],
    );
  } catch (err) {
    console.error('[bid] puja aceptada en Firebase pero falló PostgreSQL:', err.message);
  }

  return {
    currentBid: state.currentBid,
    nextMinBid: state.nextMinBid,
    endsAt: state.endsAt,
    bidCount: state.bidCount,
    alias,
  };
}

/** Marca como LIVE las subastas programadas cuya hora de inicio ya llegó. */
async function startDueAuctions() {
  const { rows } = await pool.query(
    `UPDATE auctions SET status = 'LIVE'
     WHERE status = 'SCHEDULED' AND starts_at <= now() RETURNING id`,
  );
  for (const { id } of rows) {
    await auctionRef(id).transaction((a) => {
      if (a === null) return a;
      if (a.status !== 'scheduled') return;
      return { ...a, status: 'live' };
    });
  }
}

/**
 * Cierra una subasta cuyo tiempo terminó. Si alguien pujó durante el último
 * minuto, `endsAt` ya habrá sido extendido y la transacción se aborta.
 */
async function closeAuction(auctionId) {
  let outcome = null;
  const result = await auctionRef(auctionId).transaction((a) => {
    outcome = null;
    if (a === null) return a;
    if (!OPEN_STATUSES.includes(a.status) || Date.now() < a.endsAt) return; // nada que cerrar
    const sold = a.bidCount > 0 && a.currentBid >= a.basePrice;
    outcome = sold ? 'sold' : 'deserted';
    return {
      ...a,
      status: outcome,
      result: { outcome, finalPrice: sold ? a.currentBid : 0, closedAt: Date.now() },
    };
  });
  if (!result.committed || !outcome) return;

  const state = result.snapshot.val();
  const { rows } = await pool.query(
    `SELECT bidder_id, amount FROM bids WHERE auction_id = $1 ORDER BY amount DESC, placed_at ASC LIMIT 1`,
    [auctionId],
  );
  const winner = outcome === 'sold' ? rows[0] : null;
  const { rows: countRows } = await pool.query('SELECT count(*) AS n FROM bids WHERE auction_id = $1', [auctionId]);

  if (outcome === 'sold' && !winner) {
    // Inconsistencia (puja sin registro en PostgreSQL): no se puede adjudicar.
    console.error(`[close] subasta ${auctionId} sin pujas en PostgreSQL; se declara desierta`);
    outcome = 'deserted';
    await auctionRef(auctionId).update({ status: 'deserted', 'result/outcome': 'deserted', 'result/finalPrice': 0 });
  }

  await pool.query(
    `UPDATE auctions
        SET status = $2::auction_status, winner_id = $3, final_price = $4,
            ends_at = to_timestamp($5 / 1000.0), closed_at = now(), total_bids = $6
      WHERE id = $1`,
    [auctionId, outcome.toUpperCase(), winner?.bidder_id ?? null, winner?.amount ?? null,
      state.endsAt, countRows[0].n],
  );
  console.log(`[close] subasta ${auctionId} → ${outcome}${winner ? ` por Q ${winner.amount}` : ''}`);
}

/** Revisa en Firebase las subastas cuyo reloj llegó a cero. */
async function closeDueAuctions() {
  const snap = await auctionsRef().orderByChild('endsAt').endAt(Date.now()).once('value');
  const due = [];
  snap.forEach((child) => {
    if (OPEN_STATUSES.includes(child.child('status').val())) due.push(child.key);
  });
  for (const id of due) {
    try { await closeAuction(id); } catch (err) { console.error(`[close] ${id}:`, err.message); }
  }
}

module.exports = {
  syncAuctionToFirebase,
  syncOpenAuctions,
  getBidderIdentity,
  placeBid,
  startDueAuctions,
  closeDueAuctions,
};
