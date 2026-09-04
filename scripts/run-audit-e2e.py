"""Run audit E2E and runtime checks exclusively on a disposable local replica set."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
import urllib.error


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def http(url):
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


root = Path(__file__).resolve().parents[1]
node = os.environ.get("AUDIT_NODE") or shutil.which("node")
mongod = shutil.which("mongod")
mongosh = shutil.which("mongosh")
if not all([node, mongod, mongosh]):
    raise SystemExit("node, mongod and mongosh are required")
port = free_port()
api_port = free_port()
with tempfile.TemporaryDirectory(prefix="pos-audit-local-") as tmp:
    with open(Path(tmp) / "mongo.log", "w") as log, open(Path(tmp) / "api.log", "w") as api_log:
        mongo = subprocess.Popen([mongod, "--dbpath", tmp, "--port", str(port), "--bind_ip", "127.0.0.1", "--replSet", "rsAudit"], stdout=log, stderr=log)
        api = None
        try:
            uri = f"mongodb://127.0.0.1:{port}/admin?directConnection=true"
            for _ in range(40):
                if mongo.poll() is not None:
                    raise RuntimeError("Disposable Mongo failed to start; no existing database will be used")
                ready = subprocess.run([mongosh, uri, "--quiet", "--eval", "db.adminCommand({ping:1}).ok"], capture_output=True)
                if ready.returncode == 0:
                    break
                time.sleep(.25)
            else:
                raise RuntimeError("Temporary Mongo unavailable")
            subprocess.run([mongosh, uri, "--quiet", "--eval", f'rs.initiate({{_id:"rsAudit",members:[{{_id:0,host:"127.0.0.1:{port}"}}]}})'], check=True, capture_output=True)
            for _ in range(40):
                ready = subprocess.run([mongosh, uri, "--quiet", "--eval", "db.hello().isWritablePrimary"], capture_output=True, text=True)
                if "true" in ready.stdout:
                    break
                time.sleep(.25)
            else:
                raise RuntimeError("Temporary replica set unavailable")
            env = os.environ.copy()
            env.update(DB_CONECTION_DEV=f"mongodb://127.0.0.1:{port}/pos_audit?replicaSet=rsAudit&directConnection=true", JWT_SECRET="audit-runtime-only-secret-32-characters", CORS_ORIGINS="http://localhost:5173", PORT=str(api_port), APP_VERSION="audit-local", NODE_ENV="test")
            result = subprocess.run([node, "--test", "test-e2e/pos-checkout.test.js"], cwd=root, env=env)
            if result.returncode:
                raise SystemExit(result.returncode)
            api = subprocess.Popen([node, "index.js"], cwd=root, env=env, stdout=api_log, stderr=api_log)
            base = f"http://127.0.0.1:{api_port}"
            for _ in range(40):
                try:
                    if http(base + "/health/ready")[0] == 200:
                        break
                except (urllib.error.URLError, ConnectionError):
                    pass
                time.sleep(.25)
            else:
                raise RuntimeError("Entrypoint failed readiness")
            assert http(base + "/version")[1]["version"] == "audit-local"
            mongo.terminate()
            mongo.wait(timeout=15)
            assert http(base + "/health/ready")[0] == 503
            assert http(base + "/health/live")[0] == 200
            api.terminate()
            assert api.wait(timeout=15) == 0
            print("Runtime PASS: real startup, Mongo ping, version, DB loss 503, liveness and graceful shutdown", flush=True)
        finally:
            for process in [api, mongo]:
                if process and process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
