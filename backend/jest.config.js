// jest.config.js — Jest configuration for the BillFlow backend test suite.
//
// - testEnvironment 'node' (no DOM needed for an Express/Mongo backend)
// - setupFiles runs BEFORE the test framework/modules load, so JWT secrets and
//   NODE_ENV=test are in place before any src/ module reads process.env
// - testTimeout is generous because mongodb-memory-server may download a MongoDB
//   binary on first run

module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.env.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 60000,
  // Surface open handles during local debugging without failing CI.
  clearMocks: true,
};
