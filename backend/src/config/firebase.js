const admin = require('firebase-admin');

function loadCredentials() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_BASE64 en el .env');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

admin.initializeApp({
  credential: admin.credential.cert(loadCredentials()),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();
const root = process.env.RTDB_ROOT || 'subastas';

module.exports = {
  db,
  auctionRef: (id) => db.ref(`${root}/auctions/${id}`),
  auctionsRef: () => db.ref(`${root}/auctions`),
  bidsRef: (id) => db.ref(`${root}/auctionBids/${id}`),
};
