// db.js — MongoDB Atlas connection setup via Mongoose.
//
// Purpose (see Spec Section 2 / 9): establishes the Mongoose connection using MONGODB_URI
// from the environment. Mongoose is the ODM used for schema validation and transactions.
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Google DNS use pannu

const mongoose = require('mongoose');

// Fail fast on bad queries and keep buffering behaviour predictable in tests.
mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB using the MONGODB_URI env var.
 * Returns the active mongoose connection so callers can await readiness.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not set — see environment/.env.example (Spec Section 9).');
  }

  await mongoose.connect(uri);
  console.log(`[db] MongoDB connected: ${mongoose.connection.host}`);

  // Surface connection-level errors that happen after the initial connect.
  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });

  return mongoose.connection;
}

module.exports = connectDB;
