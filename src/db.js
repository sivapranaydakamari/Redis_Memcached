// db.js - PostgreSQL connection pool used by every route that needs
// to read or write the "products" table.

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/products_db',
});

module.exports = pool;
