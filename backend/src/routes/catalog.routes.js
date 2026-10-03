// Controlador de catálogos (ficha técnica)
const router = require('express').Router();
const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/http');

router.get('/', asyncHandler(async (_req, res) => {
  const [itemTypes, makes, models, transmissions, fuelTypes, drivetrains, damageLevels] = await Promise.all([
    pool.query('SELECT id, name FROM item_types ORDER BY name'),
    pool.query('SELECT id, name FROM makes ORDER BY name'),
    pool.query('SELECT id, make_id AS "makeId", name FROM models ORDER BY name'),
    pool.query('SELECT id, name FROM transmissions ORDER BY id'),
    pool.query('SELECT id, name FROM fuel_types ORDER BY id'),
    pool.query('SELECT id, code, name FROM drivetrains ORDER BY id'),
    pool.query('SELECT id, code, name, description, color_hex AS "colorHex" FROM damage_levels ORDER BY id'),
  ]);
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    itemTypes: itemTypes.rows,
    makes: makes.rows,
    models: models.rows,
    transmissions: transmissions.rows,
    fuelTypes: fuelTypes.rows,
    drivetrains: drivetrains.rows,
    damageLevels: damageLevels.rows,
  });
}));

module.exports = router;
