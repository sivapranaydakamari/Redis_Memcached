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
  // "add" only succeeds if the key does NOT already exist.
  return new Promise((resolve) => {
    client.add(key, value, lifetimeSeconds, (err) => resolve(!err));
  });
}

function mcIncr(client, key, amount) {
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
