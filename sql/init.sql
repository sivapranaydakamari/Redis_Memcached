CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL,
  category VARCHAR(100) NOT NULL
);

-- 100,000 separate INSERT statements, so seeding finishes in seconds.
INSERT INTO products (name, description, price, category)
SELECT
  'Product ' || i,
  'Sample description for product number ' || i || ', used for cache benchmarking.',
  round((random() * 500 + 1)::numeric, 2),
  (ARRAY['Electronics', 'Books', 'Clothing', 'Home', 'Toys', 'Sports', 'Grocery', 'Beauty'])[1 + floor(random() * 8)::int]
FROM generate_series(1, 100000) AS s(i);
