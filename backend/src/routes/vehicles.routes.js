const router = require('express').Router();
const multer = require('multer');
const { pool, withTransaction } = require('../config/db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../utils/http');
const { syncAuctionToFirebase } = require('../services/auction.service');

const MIN_PHOTOS = 5;
const MAX_PHOTOS = 15;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: MAX_PHOTOS },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new HttpError(422, 'Las fotos deben ser JPG, PNG o WEBP.'));
  },
});

// ---------------------------------------------------------------------
// Serialización
// ---------------------------------------------------------------------
const toCard = (r) => ({
  id: r.id,
  lotNumber: r.lot_number,
  year: r.year,
  itemType: r.item_type,
  make: r.make,
  model: r.model,
  engine: r.engine,
  transmission: r.transmission,
  fuelType: r.fuel_type,
  drivetrain: r.drivetrain,
  cylinders: r.cylinders,
  mileage: r.mileage,
  location: r.location,
  damage: { code: r.damage_code, name: r.damage_name },
  coverPhotoId: r.cover_photo_id,
  photoCount: r.photo_count,
  auction: {
    id: r.auction_id,
    basePrice: r.base_price,
    currency: r.currency,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.auction_status,
    currentBid: r.current_bid,
    totalBids: r.total_bids,
    finalPrice: r.final_price,
  },
});

// ---------------------------------------------------------------------
// Filtros dinámicos sobre la vista v_catalog
// ---------------------------------------------------------------------
const ID_FILTERS = {
  itemTypeId: 'item_type_id',
  makeId: 'make_id',
  modelId: 'model_id',
  transmissionId: 'transmission_id',
  fuelTypeId: 'fuel_type_id',
  drivetrainId: 'drivetrain_id',
  cylinders: 'cylinders',
};

const SORTS = {
  ending: 'ends_at ASC',
  newest: 'created_at DESC',
  price_asc: 'COALESCE(current_bid, base_price) ASC',
  price_desc: 'COALESCE(current_bid, base_price) DESC',
  year_desc: 'year DESC, ends_at ASC',
};

/** Convierte "1,4,7" o ["1","4"] en [1,4,7]. */
function intList(value) {
  if (value === undefined || value === '') return [];
  return String(value).split(',').map(Number).filter(Number.isInteger);
}

function buildWhere(q, { includeTab = true } = {}) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };

  if (includeTab) {
    if (q.tab === 'closed') where.push("auction_status IN ('SOLD','DESERTED')");
    else where.push("auction_status IN ('SCHEDULED','LIVE')");
  }

  if (q.search) {
    const term = `%${String(q.search).trim()}%`;
    add(`(make ILIKE ? OR model ILIKE $${params.length + 1} OR item_type ILIKE $${params.length + 1}
          OR location ILIKE $${params.length + 1} OR lot_number::text ILIKE $${params.length + 1}
          OR (year::text || ' ' || make || ' ' || model) ILIKE $${params.length + 1})`, term);
  }

  for (const [param, column] of Object.entries(ID_FILTERS)) {
    const list = intList(q[param]);
    if (list.length) add(`${column} = ANY(?::int[])`, list);
  }

  if (q.damage) {
    const codes = String(q.damage).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (codes.length) add('damage_code = ANY(?::text[])', codes);
  }
  if (q.yearFrom) add('year >= ?', Number(q.yearFrom));
  if (q.yearTo) add('year <= ?', Number(q.yearTo));
  if (q.priceMax) add('COALESCE(current_bid, base_price) <= ?', Number(q.priceMax));

  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

// ---------------------------------------------------------------------
// GET /api/vehicles   (público, modo lectura)
// ---------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(48, Math.max(1, parseInt(req.query.pageSize, 10) || 12));
  const order = SORTS[req.query.sort] || SORTS.ending;
  const { sql, params } = buildWhere(req.query);

  const [items, total] = await Promise.all([
    pool.query(
      `SELECT * FROM v_catalog ${sql} ORDER BY ${order}
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params,
    ),
    pool.query(`SELECT count(*) AS n FROM v_catalog ${sql}`, params),
  ]);
  res.json({ items: items.rows.map(toCard), total: total.rows[0].n, page, pageSize });
}));

// ---------------------------------------------------------------------
// GET /api/vehicles/facets  → contadores por categoría para la barra lateral
// ---------------------------------------------------------------------
router.get('/facets', asyncHandler(async (req, res) => {
  const tabSql = req.query.tab === 'closed'
    ? "auction_status IN ('SOLD','DESERTED')"
    : "auction_status IN ('SCHEDULED','LIVE')";
  const facet = (idCol, nameCol) => pool.query(
    `SELECT ${idCol} AS id, ${nameCol} AS name, count(*) AS count
     FROM v_catalog WHERE ${tabSql} GROUP BY 1, 2 ORDER BY count DESC, name`,
  );
  const [itemTypes, makes, fuelTypes, transmissions, drivetrains, damage, tabs] = await Promise.all([
    facet('item_type_id', 'item_type'),
    facet('make_id', 'make'),
    facet('fuel_type_id', 'fuel_type'),
    facet('transmission_id', 'transmission'),
    facet('drivetrain_id', 'drivetrain'),
    facet('damage_code', 'damage_name'),
    pool.query(`SELECT
        count(*) FILTER (WHERE auction_status IN ('SCHEDULED','LIVE')) AS open,
        count(*) FILTER (WHERE auction_status IN ('SOLD','DESERTED'))  AS closed
      FROM v_catalog`),
  ]);
  res.json({
    itemTypes: itemTypes.rows, makes: makes.rows, fuelTypes: fuelTypes.rows,
    transmissions: transmissions.rows, drivetrains: drivetrains.rows, damage: damage.rows,
    tabs: tabs.rows[0],
  });
}));

// ---------------------------------------------------------------------
// GET /api/vehicles/mine  → publicaciones del usuario, con búsqueda
// ---------------------------------------------------------------------
router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  const params = [req.user.sub];
  let filter = '';
  if (req.query.search) {
    params.push(`%${String(req.query.search).trim()}%`);
    filter = `AND (make ILIKE $2 OR model ILIKE $2 OR year::text ILIKE $2 OR lot_number::text ILIKE $2)`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM v_catalog WHERE seller_id = $1 ${filter} ORDER BY created_at DESC`, params,
  );
  res.json(rows.map((r) => ({
    ...toCard(r),
    editable: r.total_bids === 0 && ['SCHEDULED', 'LIVE'].includes(r.auction_status),
  })));
}));

// ---------------------------------------------------------------------
// GET /api/vehicles/:id  → detalle completo (público)
// ---------------------------------------------------------------------
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new HttpError(404, 'Vehículo no encontrado.');
  const { rows } = await pool.query('SELECT * FROM v_catalog WHERE id = $1', [req.params.id]);
  const r = rows[0];
  if (!r) throw new HttpError(404, 'Vehículo no encontrado.');

  const [photos, dmg] = await Promise.all([
    pool.query('SELECT id FROM vehicle_photos WHERE vehicle_id = $1 ORDER BY position', [r.id]),
    pool.query('SELECT description, color_hex FROM damage_levels WHERE id = $1', [r.damage_level_id]),
  ]);

  res.json({
    ...toCard(r),
    description: r.description,
    damage: { code: r.damage_code, name: r.damage_name, description: dmg.rows[0].description },
    photoIds: photos.rows.map((p) => p.id),
    // Datos para el formulario de edición (ids de catálogos)
    ids: {
      itemTypeId: r.item_type_id, makeId: r.make_id, modelId: r.model_id,
      transmissionId: r.transmission_id, fuelTypeId: r.fuel_type_id,
      drivetrainId: r.drivetrain_id, damageLevelId: r.damage_level_id,
    },
    isOwner: req.user?.sub === r.seller_id, // nunca exponemos la identidad del vendedor
  });
}));

// ---------------------------------------------------------------------
// Validación del formulario de publicación
// ---------------------------------------------------------------------
async function validateVehicle(body, client) {
  const errors = {};
  const num = (k) => Number(body[k]);
  const required = ['year', 'itemTypeId', 'makeId', 'modelId', 'engine', 'transmissionId',
    'fuelTypeId', 'drivetrainId', 'cylinders', 'damageLevelId', 'basePrice', 'startsAt', 'endsAt'];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null || String(body[k]).trim() === '') errors[k] = 'Campo obligatorio.';
  }
  const year = num('year');
  if (!errors.year && (year < 1950 || year > new Date().getFullYear() + 1)) errors.year = 'Año fuera de rango.';
  const cyl = num('cylinders');
  if (!errors.cylinders && (!Number.isInteger(cyl) || cyl < 0 || cyl > 16)) errors.cylinders = 'Entre 0 y 16.';
  const base = num('basePrice');
  if (!errors.basePrice && (!Number.isFinite(base) || base < 1)) errors.basePrice = 'El monto base debe ser mayor a 0.';

  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (!errors.startsAt && Number.isNaN(startsAt.getTime())) errors.startsAt = 'Fecha inválida.';
  if (!errors.endsAt && Number.isNaN(endsAt.getTime())) errors.endsAt = 'Fecha inválida.';
  if (!errors.startsAt && !errors.endsAt) {
    if (endsAt <= startsAt) errors.endsAt = 'El cierre debe ser después del inicio.';
    else if (endsAt.getTime() < Date.now() + 5 * 60 * 1000) errors.endsAt = 'El cierre debe ser al menos 5 minutos en el futuro.';
  }

  if (!errors.makeId && !errors.modelId) {
    const ok = await client.query('SELECT 1 FROM models WHERE id = $1 AND make_id = $2', [num('modelId'), num('makeId')]);
    if (!ok.rowCount) errors.modelId = 'El modelo no corresponde a la marca.';
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Revisa los campos marcados.', { errors });

  return {
    year, cylinders: cyl, basePrice: Math.ceil(base), startsAt, endsAt,
    engine: String(body.engine).trim().slice(0, 80),
    mileage: body.mileage ? Math.max(0, parseInt(body.mileage, 10)) : null,
    vin: body.vin ? String(body.vin).trim().slice(0, 17) : null,
    location: String(body.location || 'Guatemala').trim().slice(0, 120),
    description: body.description ? String(body.description).trim().slice(0, 4000) : null,
    itemTypeId: num('itemTypeId'), makeId: num('makeId'), modelId: num('modelId'),
    transmissionId: num('transmissionId'), fuelTypeId: num('fuelTypeId'),
    drivetrainId: num('drivetrainId'), damageLevelId: num('damageLevelId'),
  };
}

async function insertPhotos(client, vehicleId, files, startPosition) {
  let pos = startPosition;
  for (const f of files) {
    await client.query(
      'INSERT INTO vehicle_photos (vehicle_id, position, mime_type, data) VALUES ($1, $2, $3, $4)',
      [vehicleId, pos++, f.mimetype, f.buffer],
    );
  }
}

// ---------------------------------------------------------------------
// POST /api/vehicles  → publicar vehículo + subasta (multipart/form-data)
// ---------------------------------------------------------------------
router.post('/', requireAuth, upload.array('photos', MAX_PHOTOS), asyncHandler(async (req, res) => {
  const files = req.files || [];
  const result = await withTransaction(async (client) => {
    const v = await validateVehicle(req.body, client);
    if (files.length < MIN_PHOTOS) {
      throw new HttpError(422, `Sube al menos ${MIN_PHOTOS} fotografías.`, { errors: { photos: `Mínimo ${MIN_PHOTOS} fotos.` } });
    }
    const { rows } = await client.query(
      `INSERT INTO vehicles (seller_id, year, item_type_id, make_id, model_id, engine, transmission_id,
          fuel_type_id, drivetrain_id, cylinders, damage_level_id, mileage, vin, location, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id, lot_number`,
      [req.user.sub, v.year, v.itemTypeId, v.makeId, v.modelId, v.engine, v.transmissionId,
        v.fuelTypeId, v.drivetrainId, v.cylinders, v.damageLevelId, v.mileage, v.vin, v.location, v.description],
    );
    const vehicle = rows[0];
    await insertPhotos(client, vehicle.id, files, 0);
    const status = v.startsAt.getTime() <= Date.now() ? 'LIVE' : 'SCHEDULED';
    const auction = await client.query(
      `INSERT INTO auctions (vehicle_id, base_price, starts_at, scheduled_end_at, ends_at, status)
       VALUES ($1, $2, $3, $4, $4, $5) RETURNING id`,
      [vehicle.id, v.basePrice, v.startsAt, v.endsAt, status],
    );
    return { id: vehicle.id, lotNumber: vehicle.lot_number, auctionId: auction.rows[0].id };
  });
  await syncAuctionToFirebase(result.auctionId);
  res.status(201).json(result);
}));

// ---------------------------------------------------------------------
// PUT /api/vehicles/:id  → editar publicación propia
// Solo se permite mientras la subasta no tenga pujas ni esté cerrada.
// Campo keepPhotoIds: JSON con los ids de fotos existentes que se conservan.
// ---------------------------------------------------------------------
router.put('/:id', requireAuth, upload.array('photos', MAX_PHOTOS), asyncHandler(async (req, res) => {
  const files = req.files || [];
  const auctionId = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT v.id, v.seller_id, a.id AS auction_id, a.status, a.total_bids
       FROM vehicles v JOIN auctions a ON a.vehicle_id = v.id WHERE v.id = $1 FOR UPDATE OF a`,
      [req.params.id],
    );
    const current = rows[0];
    if (!current) throw new HttpError(404, 'Vehículo no encontrado.');
    if (current.seller_id !== req.user.sub) throw new HttpError(403, 'Solo puedes editar tus propias publicaciones.');
    if (current.total_bids > 0 || !['SCHEDULED', 'LIVE'].includes(current.status)) {
      throw new HttpError(409, 'Esta publicación ya recibió ofertas o está cerrada; no se puede editar.');
    }

    const v = await validateVehicle(req.body, client);

    let keep = [];
    try { keep = JSON.parse(req.body.keepPhotoIds || '[]'); } catch { keep = []; }
    if (!Array.isArray(keep)) keep = [];
    await client.query(
      'DELETE FROM vehicle_photos WHERE vehicle_id = $1 AND NOT (id = ANY($2::uuid[]))',
      [current.id, keep],
    );
    const { rows: countRows } = await client.query(
      'SELECT count(*) AS n, COALESCE(max(position), -1) AS maxpos FROM vehicle_photos WHERE vehicle_id = $1',
      [current.id],
    );
    if (countRows[0].n + files.length < MIN_PHOTOS) {
      throw new HttpError(422, `La publicación debe tener al menos ${MIN_PHOTOS} fotografías.`, { errors: { photos: `Mínimo ${MIN_PHOTOS} fotos.` } });
    }
    if (countRows[0].n + files.length > MAX_PHOTOS) {
      throw new HttpError(422, `Máximo ${MAX_PHOTOS} fotografías.`, { errors: { photos: `Máximo ${MAX_PHOTOS} fotos.` } });
    }
    await insertPhotos(client, current.id, files, countRows[0].maxpos + 1);

    await client.query(
      `UPDATE vehicles SET year=$2, item_type_id=$3, make_id=$4, model_id=$5, engine=$6, transmission_id=$7,
          fuel_type_id=$8, drivetrain_id=$9, cylinders=$10, damage_level_id=$11, mileage=$12, vin=$13,
          location=$14, description=$15, updated_at=now()
       WHERE id = $1`,
      [current.id, v.year, v.itemTypeId, v.makeId, v.modelId, v.engine, v.transmissionId,
        v.fuelTypeId, v.drivetrainId, v.cylinders, v.damageLevelId, v.mileage, v.vin, v.location, v.description],
    );
    await client.query(
      `UPDATE auctions SET base_price=$2, starts_at=$3, scheduled_end_at=$4, ends_at=$4,
          status = CASE WHEN $3 <= now() THEN 'LIVE'::auction_status ELSE 'SCHEDULED'::auction_status END
       WHERE id = $1`,
      [current.auction_id, v.basePrice, v.startsAt, v.endsAt],
    );
    return current.auction_id;
  });

  await syncAuctionToFirebase(auctionId);
  // Reflejar el estado (programada/en vivo) recalculado
  const { rows } = await pool.query('SELECT status FROM auctions WHERE id = $1', [auctionId]);
  const { auctionRef } = require('../config/firebase');
  await auctionRef(auctionId).update({ status: rows[0].status.toLowerCase() });
  res.json({ id: req.params.id, auctionId });
}));

module.exports = router;
