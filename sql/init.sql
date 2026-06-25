-- sql/init.sql
-- Runs automatically the FIRST time the Postgres container starts on an
-- empty data directory (Postgres convention for docker-entrypoint-initdb.d).
-- Creates the products table and seeds exactly 100,000 rows so the
-- docker-compose healthcheck can confirm the row count.

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL,
  category VARCHAR(100) NOT NULL
);

-- generate_series builds all 100,000 rows in one bulk insert instead of
-- 100,000 separate INSERT statements, so seeding finishes in seconds.
INSERT INTO products (name, description, price, category)
SELECT
  'Product ' || i,
  'Sample description for product number ' || i || ', used for cache benchmarking.',
  round((random() * 500 + 1)::numeric, 2),
  (ARRAY['Electronics', 'Books', 'Clothing', 'Home', 'Toys', 'Sports', 'Grocery', 'Beauty'])[1 + floor(random() * 8)::int]
FROM generate_series(1, 100000) AS s(i);
