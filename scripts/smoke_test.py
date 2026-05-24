"""
Headless smoke test for the Cubicle Coup game Edge Function.

Verifies the guards that actually matter for correct multiplayer:
  - create + join issue distinct side tokens
  - version increments on every accepted write
  - an out-of-turn move is rejected (403)
  - a stale-version move is rejected (409)

Reads SUPABASE_URL / SUPABASE_ANON_KEY from the environment, falling back to
.env.local. Run from the repo root:

    python3 scripts/smoke_test.py
"""

import json
import os
import sys
import urllib.error
import urllib.request


def load_env():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY")
    if url and key:
        return url, key
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    vals = {}
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    vals[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return (
        url or vals.get("VITE_SUPABASE_URL"),
        key or vals.get("VITE_SUPABASE_ANON_KEY"),
    )


SUPABASE_URL, ANON_KEY = load_env()
if not SUPABASE_URL or not ANON_KEY:
    sys.exit("Set SUPABASE_URL/SUPABASE_ANON_KEY or populate .env.local")

FN = f"{SUPABASE_URL}/functions/v1/game"
HEADERS = {
    "Content-Type": "application/json",
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "User-Agent": "cubicle-coup-smoke/1.0",
}


def req(path, method="POST", body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{FN}{path}", data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def main():
    # create
    status, r = req("", body={"name": "Data Wizards"})
    assert status == 200, f"create failed: {status} {r}"
    code, green_token = r["code"], r["token"]
    assert r["side"] == "green"
    print(f"created game {code}")

    # join
    status, r2 = req(f"/{code}/join", body={"name": "Spreadsheet Goblins"})
    assert status == 200, f"join failed: {status} {r2}"
    orange_token = r2["token"]
    state = r2["state"]
    assert state["status"] == "playing"
    assert state["turn"] == "green"
    v = state["version"]
    print(f"joined; version={v}, turn={state['turn']}")

    # out-of-turn move should fail (orange tries to move on green's turn)
    status, _ = req(f"/{code}/move", body={"token": orange_token, "expectedVersion": v, "state": state})
    assert status == 403, f"expected 403 out-of-turn, got {status}"
    print("out-of-turn move correctly rejected (403)")

    # legit green move
    state["turn"] = "orange"
    state["turnCount"] += 1
    status, r3 = req(f"/{code}/move", body={"token": green_token, "expectedVersion": v, "state": state})
    assert status == 200, f"green move failed: {status} {r3}"
    state = r3["state"]
    assert state["version"] == v + 1, "version did not increment"
    print(f"green move accepted; version now {state['version']}")

    # stale move: reuse the old expectedVersion -> 409
    status, _ = req(f"/{code}/move", body={"token": orange_token, "expectedVersion": v, "state": state})
    assert status == 409, f"expected 409 stale, got {status}"
    print("stale-version move correctly rejected (409)")

    print("\nALL CHECKS PASSED ✔")


if __name__ == "__main__":
    main()
