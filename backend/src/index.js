require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { pool } = require('./config/db');
require('./config/firebase'); // inicializa firebase-admin
const { syncOpenAuctions } = require('./services/auction.service');
const { startScheduler } = require('./jobs/auction-scheduler');

const app = express();
const origins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, serverTime: Date.now() });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/catalogs', require('./routes/catalog.routes'));
app.use('/api/vehicles', require('./routes/vehicles.routes'));
app.use('/api/photos', require('./routes/photos.routes'));
app.use('/api/auctions', require('./routes/auctions.routes'));

app.use((_req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));

// Manejador central de errores
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Cada foto debe pesar menos de 6 MB.' : 'No se pudieron procesar las fotos.';
    return res.status(422).json({ message: msg });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 ? 'Error interno del servidor.' : err.message,
    ...(err.extra || {}),
  });
});

const port = process.env.PORT || 3000;
app.listen(port, async () => {
  console.log(`API escuchando en http://localhost:${port}`);
  try {
    await syncOpenAuctions();
  } catch (err) {
    console.error('[sync] no se pudo sincronizar con Firebase:', err.message);
  }
  startScheduler();
});
