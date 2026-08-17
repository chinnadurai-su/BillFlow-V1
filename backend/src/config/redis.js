// redis.js — Shared Redis connection (ioredis) used as the broker/storage layer for BullMQ.
//
// Purpose (see Spec Section 7.6): creates one shared ioredis connection from REDIS_URL so both
// job producers (jobs/) and consumers (workers/) reuse the same connection. Redis is used ONLY
// as the BullMQ broker, not as the primary database.

const Redis = require('ioredis');

// BullMQ requires maxRetriesPerRequest: null on the connection it uses for blocking commands.
const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

connection.on('connect', () => console.log('[redis] connected'));
connection.on('error', (err) => console.error('[redis] connection error:', err.message));

// Export the single shared connection so jobs/ and workers/ don't each open their own.
module.exports = connection;
