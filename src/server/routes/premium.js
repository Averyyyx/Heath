'use strict';

function register(context) {
  const {
    PREMIUM_BALANCE_TOKEN, PREMIUM_BRAND, app, ensureAuthenticated, insertPremiumSubscription,
    insertPremiumTransaction, normalizeBadges, randomBytes, randomUUID, selectActiveSubscription,
    selectPremiumBalance, selectPremiumPlanById, selectPremiumPlans, selectPremiumTransactionById, updatePremiumTransactionStatus
  } = context;

app.get('/api/premium/plans', ensureAuthenticated, (_req, res) => {
  const plans = selectPremiumPlans.all().map((plan) => ({
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    price_cents: plan.price_cents,
    currency: plan.currency,
    perks: normalizeBadges(plan.perks)
  }));
  res.json({ brand: PREMIUM_BRAND, plans });
});

app.get('/api/premium/status', ensureAuthenticated, (req, res) => {
  const active = selectActiveSubscription.get(req.user.id);
  res.json({
    active: Boolean(active),
    plan: active ? { id: active.plan_id, name: active.plan_name } : null,
    renews_at: active ? active.renews_at : null
  });
});

app.post('/api/premium/checkout', ensureAuthenticated, (req, res) => {
  const planId = Number(req.body?.planId);
  if (!Number.isFinite(planId)) {
    return res.status(400).json({ message: 'Invalid plan id.' });
  }
  const plan = selectPremiumPlanById.get(planId);
  if (!plan) {
    return res.status(404).json({ message: 'Plan not found.' });
  }
  const clientSecret = randomBytes(24).toString('hex');
  const paymentIntent = randomUUID();
  const result = insertPremiumTransaction.run(
    req.user.id,
    plan.id,
    plan.price_cents,
    plan.currency,
    'pending',
    paymentIntent,
    clientSecret
  );
  return res.status(201).json({
    transaction: {
      id: result.lastInsertRowid,
      plan_id: plan.id,
      payment_intent: paymentIntent,
      client_secret: clientSecret,
      amount_cents: plan.price_cents,
      currency: plan.currency
    }
  });
});

app.post('/api/premium/confirm', ensureAuthenticated, (req, res) => {
  const transactionId = Number(req.body?.transactionId);
  if (!Number.isFinite(transactionId)) {
    return res.status(400).json({ message: 'Invalid transaction id.' });
  }
  const record = selectPremiumTransactionById.get(transactionId);
  if (!record || record.user_id !== req.user.id) {
    return res.status(404).json({ message: 'Transaction not found.' });
  }
  if (record.status !== 'pending') {
    return res.status(409).json({ message: 'Transaction already processed.' });
  }
  updatePremiumTransactionStatus.run('succeeded', record.payment_intent, record.id);
  insertPremiumSubscription.run(
    req.user.id,
    record.plan_id,
    JSON.stringify({ transactionId: record.id, payment_intent: record.payment_intent })
  );
  const plan = selectPremiumPlanById.get(record.plan_id);
  return res.json({
    subscription: {
      plan: plan ? { id: plan.id, name: plan.name } : null,
      status: 'active'
    }
  });
});

app.get('/api/admin/premium/balance', (req, res) => {
  if (!PREMIUM_BALANCE_TOKEN || req.headers['x-admin-token'] !== PREMIUM_BALANCE_TOKEN) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const totals = selectPremiumBalance.get();
  res.json({
    brand: PREMIUM_BRAND,
    balance: {
      available_cents: totals?.available_cents || 0,
      pending_cents: totals?.pending_cents || 0,
      currency: 'USD'
    }
  });
});
}

module.exports = { register };
