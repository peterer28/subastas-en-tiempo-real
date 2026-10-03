// Ejecuta database/01_schema.sql y 02_seed.sql contra DATABASE_URL.
// Uso: npm run db:init   (¡borra y recrea las tablas!)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

(async () => {
  const dir = path.join(__dirname, '..', '..', 'database');
  for (const file of ['01_schema.sql', '02_seed.sql']) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`→ Ejecutando ${file}…`);
    await pool.query(sql);
  }
  console.log('Base de datos lista.');
  await pool.end();
})().catch(async (err) => {
  console.error('Error inicializando la base de datos:', err.message);
  await pool.end();
  process.exit(1);
});
