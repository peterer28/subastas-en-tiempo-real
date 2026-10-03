const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../utils/http');
const { placeBid, getBidderIdentity } = require('../services/auction.service');

const UUID_RE = /^[0-9a-f-]{36}$/i;
const checkId = (req) => { if (!UUID_RE.test(req.params.id)) throw new HttpError(404, 'La subasta no existe.'); };

// Token anónimo del usuario en esta subasta (para saber si va ganando sin revelar identidades)
router.get('/:id/me', requireAuth, asyncHandler(async (req, res) => {
  checkId(req);
  res.json(getBidderIdentity(req.params.id, req.user.sub));
}));

// Ofertar
router.post('/:id/bids', requireAuth, asyncHandler(async (req, res) => {
  checkId(req);
  const result = await placeBid(req.params.id, req.user.sub, req.body.amount);
  res.status(201).json(result);
}));

module.exports = router;
