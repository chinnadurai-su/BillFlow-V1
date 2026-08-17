// customer.test.js — DB-backed integration tests for the customer module (FR-1.x, BR-2, BR-5).
//
// Requires a real Mongo (replica set, for transactions). Skipped where TCP/Mongo is unavailable
// via BILLFLOW_SKIP_DB_TESTS=1. Uses connectReplSet because the service writes customer + AuditLog
// inside a transaction.

const customerService = require('../src/modules/customer/customer.service');
const Customer = require('../src/models/Customer');
const AuditLog = require('../src/models/AuditLog');
const { connectReplSet, clearDatabase, closeDatabase } = require('./helpers/db');

const describeDb = process.env.BILLFLOW_SKIP_DB_TESTS ? describe.skip : describe;

describeDb('customer module (DB-backed)', () => {
  beforeAll(async () => {
    await connectReplSet();
  });
  afterEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await closeDatabase();
  });

  const validInput = { name: 'Acme', email: 'acme@test.com', phone: '123', billingAddress: { city: 'NYC' } };

  describe('create (FR-1.1)', () => {
    it('creates a customer and writes an AuditLog entry (atomic)', async () => {
      const customer = await customerService.create(validInput, 'user-1');
      expect(customer.name).toBe('Acme');
      expect(customer.status).toBe('active');
      expect(customer.balance).toBe(0);

      const logs = await AuditLog.find({ entityType: 'Customer', action: 'CUSTOMER_CREATED' });
      expect(logs).toHaveLength(1);
      expect(String(logs[0].entityId)).toBe(String(customer._id));
    });

    it('never accepts a client-supplied balance (BR-2)', async () => {
      const customer = await customerService.create({ ...validInput, balance: 9999 }, 'user-1');
      expect(customer.balance).toBe(0);
    });

    it('rejects missing name/email (400)', async () => {
      await expect(customerService.create({ name: 'x' })).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('update (FR-1.2, FR-6.1)', () => {
    it('updates fields and records before/after in the AuditLog', async () => {
      const customer = await customerService.create(validInput, 'user-1');
      const updated = await customerService.update(customer._id, { phone: '999' }, 'user-2');
      expect(updated.phone).toBe('999');

      const log = await AuditLog.findOne({ action: 'CUSTOMER_UPDATED' });
      expect(log.beforeState.phone).toBe('123');
      expect(log.afterState.phone).toBe('999');
    });

    it('ignores a client-supplied balance on update (BR-2)', async () => {
      const customer = await customerService.create(validInput, 'user-1');
      const updated = await customerService.update(customer._id, { balance: 5000, name: 'New' }, 'u');
      expect(updated.balance).toBe(0);
      expect(updated.name).toBe('New');
    });

    it('404s for a missing customer', async () => {
      const mongoose = require('mongoose');
      await expect(
        customerService.update(new mongoose.Types.ObjectId(), { name: 'x' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('archive (soft-delete, BR-5)', () => {
    it('sets status to archived (never hard-deletes) and writes an AuditLog', async () => {
      const customer = await customerService.create(validInput, 'user-1');
      const archived = await customerService.archive(customer._id, 'user-1');
      expect(archived.status).toBe('archived');

      // Row still exists in the DB (soft delete).
      const stillThere = await Customer.findById(customer._id);
      expect(stillThere).not.toBeNull();

      const log = await AuditLog.findOne({ action: 'CUSTOMER_ARCHIVED' });
      expect(log).not.toBeNull();
    });
  });

  describe('list (FR-1.4)', () => {
    beforeEach(async () => {
      await customerService.create({ name: 'Alpha', email: 'alpha@test.com' }, 'u');
      await customerService.create({ name: 'Beta', email: 'beta@test.com' }, 'u');
      const gamma = await customerService.create({ name: 'Gamma', email: 'gamma@test.com' }, 'u');
      await customerService.archive(gamma._id, 'u');
    });

    it('lists only active customers by default and paginates', async () => {
      const result = await customerService.list({});
      expect(result.items).toHaveLength(2); // Gamma is archived
      expect(result.pagination.total).toBe(2);
    });

    it('filters by search term (name/email)', async () => {
      const result = await customerService.list({ search: 'alpha' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Alpha');
    });

    it('can include archived with status=all', async () => {
      const result = await customerService.list({ status: 'all' });
      expect(result.pagination.total).toBe(3);
    });
  });
});
