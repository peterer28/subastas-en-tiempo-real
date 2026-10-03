const jwt = require('jsonwebtoken');
const { HttpError } = require('../utils/http');

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function requireAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next(new HttpError(401, 'Inicia sesión para continuar.'));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new HttpError(401, 'Tu sesión expiró. Vuelve a iniciar sesión.'));
  }
}

// Si hay token válido llena req.user; si no, continúa como visitante.
function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch { /* visitante */ }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
