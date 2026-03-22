require('dotenv').config();

const pg = require('pg');
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => console.log('PostgreSQL connected'));
pool.on('error', (err) => console.error('PostgreSQL error:', err.message));

// Export a function to run queries
const query = (text, params) => pool.query(text, params);

module.exports = { query };
