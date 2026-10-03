const router = require('express').Router();
const { pool } = require('../config/db');
const { HttpError, asyncHandler } = require('../utils/http');

const UUID_RE = /^[0-9a-f-]{36}$/i;

router.get('/:id', asyncHandler(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw new HttpError(404, 'Foto no encontrada.');
  const { rows } = await pool.query('SELECT mime_type, data FROM vehicle_photos WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Foto no encontrada.');
  res.set('Content-Type', rows[0].mime_type);
  res.set('Cache-Control', 'public, max-age=604800, immutable'); // las fotos no cambian: un id = una imagen
  res.send(rows[0].data);
}));

module.exports = router;
