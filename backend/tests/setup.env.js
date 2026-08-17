// setup.env.js — Jest setupFiles hook: seeds environment variables BEFORE any
// application module loads. Runs once per test file, before requires in the test.
//
// These are throwaway values used only by the test process — no real secrets.

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-do-not-use-in-prod';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-prod';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
// Keep bcrypt fast in tests (cost 4) so the suite isn't dominated by hashing time.
process.env.BCRYPT_SALT_ROUNDS = '4';
// Disable BullMQ queueing in tests so job producers no-op instead of opening a Redis socket.
process.env.QUEUE_DISABLED = '1';
