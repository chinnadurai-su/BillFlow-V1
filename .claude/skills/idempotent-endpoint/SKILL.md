---
name: idempotent-endpoint
description: Use this skill when building or modifying any POST endpoint in BillFlow that creates or changes financial records (invoices, payments, refunds). Ensures the endpoint is protected against duplicate execution from network retries or double-clicks, using an Idempotency-Key header pattern. Trigger this whenever a new money-related create/update endpoint is being built, not for GET or non-financial routes.
---

# Skill: Idempotent Endpoint

## Purpose
Use this skill whenever building a new POST endpoint in BillFlow that creates or
modifies money-related records (invoices, payments, refunds). It ensures the
endpoint is protected against duplicate execution caused by network retries or
double-clicks.

## When to Use This Skill
- Building a new `POST /invoices` style endpoint
- Building a new `POST /payments` style endpoint
- Any future endpoint where running the same request twice would create a
  duplicate financial record

## When NOT to Use This Skill
- GET endpoints (already safe to repeat — they don't change data)
- DELETE/PUT endpoints on non-financial resources (e.g. updating a customer's
  phone number — a duplicate update just sets the same value again, no harm)

## Steps to Implement

### Step 1: Confirm the IdempotencyKey model exists
Check `backend/src/models/IdempotencyKey.js` exists. If not, create it:
```js
const mongoose = require('mongoose');

const idempotencyKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  statusCode: { type: Number, required: true },
  response: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
```

### Step 2: Confirm the middleware exists
Check `backend/src/middleware/idempotency.middleware.js` exists. If not, create it:
```js
const IdempotencyKey = require('../models/IdempotencyKey');

async function idempotencyMiddleware(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next();

  const existing = await IdempotencyKey.findOne({ key });
  if (existing) {
    return res.status(existing.statusCode).json(existing.response);
  }

  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    await IdempotencyKey.create({ key, statusCode: res.statusCode, response: body });
    return originalJson(body);
  };

  next();
}

module.exports = idempotencyMiddleware;
```

### Step 3: Wire the middleware into the route
```js
const idempotencyMiddleware = require('../../middleware/idempotency.middleware');

router.post('/invoices', idempotencyMiddleware, invoiceController.createInvoice);
```

### Step 4: Document the header requirement in the API spec
Headers:
Idempotency-Key: <client-generated UUID, required>

### Step 5: Verify with a test
```js
it('should not create duplicate records when called twice with the same idempotency key', async () => {
  const key = 'test-key-123';

  const first = await request(app)
    .post('/api/invoices')
    .set('Idempotency-Key', key)
    .send(validInvoicePayload);

  const second = await request(app)
    .post('/api/invoices')
    .set('Idempotency-Key', key)
    .send(validInvoicePayload);

  expect(second.body).toEqual(first.body);
  const count = await Invoice.countDocuments({ customerId: validInvoicePayload.customerId });
  expect(count).toBe(1);
});
```

## Checklist (use before marking the endpoint done)
- [ ] Middleware is wired in before the controller on the route
- [ ] Client-side code generates and sends a UUID as `Idempotency-Key` header
- [ ] Duplicate-key test exists and passes
- [ ] Endpoint documented as requiring the header
