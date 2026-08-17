// tests/helpers/db.js — shared in-memory MongoDB lifecycle for integration tests.
//
// Uses mongodb-memory-server so tests never touch the real Atlas cluster
// (testing-agent rule). Two flavours:
//   - connect():        a standalone server — fine for modules that don't use transactions (auth, customer reads)
//   - connectReplSet(): a single-node REPLICA SET — required for MongoDB multi-document
//                       transactions (invoice/payment flows, Spec 7.2)
//
// clearDatabase() wipes all collections between tests so each test starts clean.

const mongoose = require('mongoose');
const { MongoMemoryServer, MongoMemoryReplSet } = require('mongodb-memory-server');

let mongoServer;

/** Start a standalone in-memory MongoDB and connect mongoose to it. */
async function connect() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

/** Start a single-node replica set (needed for transactions) and connect mongoose. */
async function connectReplSet() {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
}

/** Delete all documents from every collection (call in afterEach for isolation). */
async function clearDatabase() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

/** Disconnect mongoose and stop the in-memory server (call in afterAll). */
async function closeDatabase() {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}

module.exports = { connect, connectReplSet, clearDatabase, closeDatabase };
