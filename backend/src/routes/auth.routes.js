const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../utils/http');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Mínimo 8 caracteres, mayúscula, minúscula, número y símbolo.
const STRONG_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const publicUser = (u) => ({
  id: u.id, firstName: u.first_name, lastName: u.last_name, email: u.email, phone: u.phone,
});

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.first_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
  );
}

router.post('/register', asyncHandler(async (req, res) => {
  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');

  const errors = {};
  if (firstName.length < 2) errors.firstName = 'Escribe tu nombre.';
  if (lastName.length < 2) errors.lastName = 'Escribe tu apellido.';
  if (!EMAIL_RE.test(email)) errors.email = 'Escribe un correo válido.';
  if (phone.replace(/\D/g, '').length < 8) errors.phone = 'El teléfono debe tener al menos 8 dígitos.';
  if (!STRONG_PASSWORD_RE.test(password)) {
    errors.password = 'Usa 8 caracteres o más con mayúscula, minúscula, número y símbolo.';
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Revisa los datos del formulario.', { errors });

  const exists = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) throw new HttpError(409, 'Ya existe una cuenta con ese correo.', { errors: { email: 'Correo ya registrado.' } });

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (first_name, last_name, email, phone, password_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [firstName, lastName, email, phone, hash],
  );
  res.status(201).json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Correo o contraseña incorrectos.');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.sub]);
  if (!rows[0]) throw new HttpError(404, 'Usuario no encontrado.');
  res.json(publicUser(rows[0]));
}));

module.exports = router;
