#!/usr/bin/env bash
# Initialise the single node replica set, idempotently, then wait for a PRIMARY.
#
# Run inside the container via `docker compose exec` so mongosh talks to mongod
# over loopback. The member host is 127.0.0.1:27017, which is also what the host
# reaches with directConnection=true, so no internal container hostname leaks out.
set -euo pipefail

# compose exec addresses the service, not the container_name
SERVICE=mongo

# rs.initiate on an already-initialised set throws AlreadyInitialized (code 23).
# Catching it makes a second run a no-op instead of a failure.
docker compose exec -T "${SERVICE}" mongosh --quiet --eval '
  try {
    rs.initiate({
      _id: "rs0",
      members: [{ _id: 0, host: "127.0.0.1:27017" }],
    });
    print("replica set initiated");
  } catch (e) {
    if (e.codeName === "AlreadyInitialized" || e.code === 23) {
      print("replica set already initialised");
    } else {
      throw e;
    }
  }
'

# Poll rather than trust rs.initiate returning: election is asynchronous, so the
# smoke test could connect before a PRIMARY exists. Block here to keep bootstrap
# race-free.
echo "waiting for a PRIMARY to be elected..."
for _ in $(seq 1 30); do
    state=$(docker compose exec -T "${SERVICE}" mongosh --quiet --eval 'db.hello().isWritablePrimary' 2>/dev/null || true)
    case "${state}" in
        true)
            echo "PRIMARY elected"
            exit 0
            ;;
        *)
            sleep 1
            ;;
    esac
done

echo "timed out waiting for PRIMARY" >&2
exit 1
