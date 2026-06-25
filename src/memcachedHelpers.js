// memcachedHelpers.js - the "memcached" library is callback-based, but
// the rest of our app uses async/await. These helpers just wrap each
// raw command in a Promise - they don't add any caching logic of
// their own.

function mcGet(client, key) {
  return new Promise((resolve, reject) => {
    client.get(key, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function mcSet(client, key, value, lifetimeSeconds) {
  return new Promise((resolve, reject) => {
    client.set(key, value, lifetimeSeconds, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function mcAdd(client, key, value, lifetimeSeconds) {
  // "add" only succeeds if the key does NOT already exist. The library
  // reports that "already exists" case as an error, but for us that's
  // an expected outcome (lock already held, counter already created) -
  // so we resolve to false instead of throwing.
  return new Promise((resolve) => {
    client.add(key, value, lifetimeSeconds, (err) => resolve(!err));
  });
}

function mcIncr(client, key, amount) {
  // The server replies NOT_FOUND if the key doesn't exist, which the
  // library reports as (err = null, result = false) - not an error.
  return new Promise((resolve, reject) => {
    client.incr(key, amount, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

function mcDel(client, key) {
  return new Promise((resolve) => {
    client.del(key, () => resolve());
  });
}

module.exports = { mcGet, mcSet, mcAdd, mcIncr, mcDel };
