"""원격 GPU VM 에서 GitHub 학습 요청을 받아 run-cloud-training.py 를 실행한다."""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import traceback
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

GPU_STATUS_CACHE = {
    "checkedAt": 0.0,
    "payload": None,
}


def resolve_env(*keys):
    for key in keys:
        value = os.environ.get(key)
        if value:
            return value
    return ""


def truthy(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def repo_dir():
    return Path(resolve_env("REMOTE_TRAINING_REPO_DIR") or PROJECT_ROOT).resolve()


def job_root():
    return Path(resolve_env("REMOTE_TRAINING_JOB_ROOT") or (PROJECT_ROOT / "outputs" / "remote-jobs")).resolve()


def python_bin():
    return resolve_env("REMOTE_TRAINING_PYTHON") or sys.executable


def webhook_token():
    return resolve_env("REMOTE_WEBHOOK_TOKEN", "REMOTE_TRAINING_BEARER_TOKEN")


def require_gpu():
    value = resolve_env("REMOTE_TRAINING_REQUIRE_GPU")
    if value == "":
        return True
    return truthy(value)


def payload_path(job_id):
    return job_root() / job_id / "payload.json"


def status_path(job_id):
    return job_root() / job_id / "status.json"


def log_path(job_id):
    return job_root() / job_id / "job.log"


def gpu_status(force=False):
    if not require_gpu():
        return {
            "required": False,
            "available": True,
            "reason": "gpu_requirement_disabled",
        }

    ttl_seconds = int(resolve_env("REMOTE_TRAINING_GPU_STATUS_TTL") or "30")
    now = time.time()
    cached = GPU_STATUS_CACHE.get("payload")
    checked_at = float(GPU_STATUS_CACHE.get("checkedAt") or 0.0)
    if not force and cached and (now - checked_at) < ttl_seconds:
        return cached

    nvidia_devices = sorted(str(path) for path in Path("/dev").glob("nvidia*"))
    nvidia_smi = shutil.which("nvidia-smi") or ""

    torch_checked = False
    torch_cuda = False
    torch_devices = []
    torch_error = ""
    try:
        import torch

        torch_checked = True
        torch_cuda = bool(torch.cuda.is_available())
        if torch_cuda:
            torch_devices = [torch.cuda.get_device_name(index) for index in range(torch.cuda.device_count())]
    except Exception as error:
        torch_error = str(error)

    available = torch_cuda if torch_checked else bool(nvidia_devices and nvidia_smi)
    payload = {
        "required": True,
        "available": available,
        "checkedAt": utc_now_iso(),
        "nvidiaDevices": nvidia_devices,
        "nvidiaSmi": nvidia_smi,
    }
    if torch_checked:
        payload["torchCudaAvailable"] = torch_cuda
    if torch_devices:
        payload["torchDevices"] = torch_devices
    if torch_error:
        payload["torchError"] = torch_error
    if not available:
        payload["reason"] = "gpu_not_detected"
        payload["message"] = "이 VM 에서는 CUDA GPU를 찾지 못해 원격 학습을 수락할 수 없습니다."

    GPU_STATUS_CACHE["checkedAt"] = now
    GPU_STATUS_CACHE["payload"] = payload
    return payload


def read_json(file_path, fallback=None):
    path = Path(file_path)
    if not path.exists():
        return {} if fallback is None else fallback
    with open(path, "r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def write_json(file_path, payload):
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def pid_alive(pid):
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
    except OSError:
        return False
    return True


def update_status(job_id, **fields):
    current = read_json(status_path(job_id), fallback={})
    current.update(fields)
    write_json(status_path(job_id), current)
    return current


def summarize_payload(payload):
    training = payload.get("training") or {}
    trigger = payload.get("trigger") or {}
    datasets = payload.get("datasets") or []
    return {
        "snapshotId": training.get("snapshotId") or "",
        "datasetCount": len(datasets),
        "readyForDpo": bool(training.get("readyForDpo")),
        "recommendedForTraining": bool(training.get("recommendedForTraining")),
        "githubRunId": trigger.get("githubRunId") or "",
        "artifactTarget": ((training.get("artifactTarget") or {}).get("type") or ""),
    }


def list_jobs(limit=20):
    root = job_root()
    if not root.exists():
        return []

    jobs = []
    for file_path in root.glob("*/status.json"):
        payload = read_json(file_path, fallback={})
        if payload:
            jobs.append(payload)

    jobs.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
    return jobs[:limit]


def active_job():
    for job in list_jobs(limit=50):
        status = str(job.get("status") or "").lower()
        if status not in {"accepted", "running"}:
            continue

        pid = job.get("pid")
        if pid_alive(pid):
            return job

    return None


def tail_log(file_path, line_count):
    path = Path(file_path)
    if not path.exists():
        return []

    with open(path, "r", encoding="utf-8", errors="ignore") as handle:
        lines = handle.readlines()
    return [line.rstrip("\n") for line in lines[-line_count:]]


def request_json(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def parse_request_body(handler):
    raw_length = handler.headers.get("Content-Length") or "0"
    try:
        content_length = int(raw_length)
    except ValueError as error:
        raise ValueError("유효하지 않은 Content-Length 입니다.") from error

    raw_body = handler.rfile.read(content_length)
    if not raw_body:
        return {}

    try:
        return json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError("JSON 본문 해석에 실패했습니다.") from error


def ensure_authorized(handler):
    token = webhook_token()
    if not token:
        return True

    header = handler.headers.get("Authorization") or ""
    expected = f"Bearer {token}"
    return header == expected


def maybe_git_pull():
    if not truthy(resolve_env("REMOTE_TRAINING_AUTO_GIT_PULL"), False):
        return

    commands = [
        ["git", "fetch", "origin", "main"],
        ["git", "checkout", "main"],
        ["git", "pull", "--ff-only", "origin", "main"],
    ]
    for command in commands:
        subprocess.run(command, cwd=repo_dir(), check=True)


def download_file(url, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": "ai-gods-remote-training-webhook"})
    with urlopen(request) as response, open(destination, "wb") as handle:
        shutil.copyfileobj(response, handle)


def clean_training_directories():
    for relative_path in [
        "training-data",
        "dpo-data",
        "models/lora",
        "models/dpo",
        "models/merged",
        "models/gguf",
    ]:
        target = repo_dir() / relative_path
        if target.exists():
            shutil.rmtree(target)

    for relative_path in ["training-data", "dpo-data"]:
        (repo_dir() / relative_path).mkdir(parents=True, exist_ok=True)


def dataset_destination(entry):
    dataset_kind = str(entry.get("datasetKind") or "sft").strip().lower()
    god_id = str(entry.get("godId") or "").strip().lower()
    if not god_id:
        god_id = Path(str(entry.get("objectPath") or "dataset.jsonl")).stem.lower()

    directory = "dpo-data" if dataset_kind == "dpo" else "training-data"
    return repo_dir() / directory / f"{god_id}.jsonl"


def stage_payload_inputs(job_id, payload):
    clean_training_directories()

    staged = []
    for entry in payload.get("datasets") or []:
        signed_url = str(entry.get("signedUrl") or "").strip()
        if not signed_url:
            continue

        destination = dataset_destination(entry)
        download_file(signed_url, destination)
        staged.append({
            "datasetKind": entry.get("datasetKind") or "sft",
            "godId": entry.get("godId") or Path(destination).stem,
            "localPath": str(destination.relative_to(repo_dir())),
        })

    snapshot_url = str((payload.get("snapshot") or {}).get("signedUrl") or "").strip()
    snapshot_path = job_root() / job_id / "snapshot.json"
    if snapshot_url:
        download_file(snapshot_url, snapshot_path)

    return {
        "datasetCount": len(staged),
        "datasets": staged,
        "snapshotPath": str(snapshot_path) if snapshot_path.exists() else "",
    }


def build_training_command(payload):
    command = [python_bin(), "scripts/run-cloud-training.py", "--god", resolve_env("REMOTE_TRAINING_DEFAULT_GOD") or "all"]

    training = payload.get("training") or {}
    if not bool(training.get("readyForDpo")):
        command.append("--skip-dpo")

    if not truthy(resolve_env("REMOTE_TRAINING_ENABLE_PUBLISH"), True):
        command.append("--skip-publish")

    if not truthy(resolve_env("REMOTE_TRAINING_ENABLE_ACTIVATION"), True):
        command.append("--skip-activation")

    if truthy(resolve_env("REMOTE_TRAINING_INCLUDE_MERGED"), False):
        command.append("--include-merged")

    return command


def run_job(payload_file_path):
    payload_file_path = Path(payload_file_path).resolve()
    job_id = payload_file_path.parent.name
    payload = read_json(payload_file_path, fallback={})

    try:
        gpu = gpu_status(force=True)
        if require_gpu() and not gpu.get("available"):
            raise RuntimeError(gpu.get("message") or "CUDA GPU 를 찾지 못했습니다.")

        update_status(job_id, status="running", startedAt=utc_now_iso())
        maybe_git_pull()
        staged = stage_payload_inputs(job_id, payload)

        trigger = payload.get("trigger") or {}
        training = payload.get("training") or {}
        github_run_id = str(trigger.get("githubRunId") or "").strip()
        model_run_id = f"gh-{github_run_id}" if github_run_id else job_id

        env = os.environ.copy()
        env["MODEL_RUN_ID"] = model_run_id
        env.setdefault("PYTHONUTF8", "1")
        env.setdefault("PYTHONIOENCODING", "utf-8")

        snapshot_id = str(training.get("snapshotId") or "").strip()
        if snapshot_id:
            env["DATASET_SNAPSHOT_ID"] = snapshot_id

        command = build_training_command(payload)
        update_status(
            job_id,
            command=command,
            modelRunId=model_run_id,
            repoDir=str(repo_dir()),
            staged=staged,
        )

        subprocess.run(command, cwd=repo_dir(), env=env, check=True)

        update_status(job_id, status="completed", completedAt=utc_now_iso())
    except subprocess.CalledProcessError as error:
        update_status(
            job_id,
            status="failed",
            completedAt=utc_now_iso(),
            exitCode=error.returncode,
            error=f"학습 명령이 exit code {error.returncode} 로 종료됐습니다.",
            traceback=traceback.format_exc(),
        )
        raise
    except Exception as error:
        update_status(
            job_id,
            status="failed",
            completedAt=utc_now_iso(),
            error=str(error),
            traceback=traceback.format_exc(),
        )
        raise


def spawn_job(payload):
    current_active = active_job()
    if current_active and not truthy(resolve_env("REMOTE_TRAINING_ALLOW_CONCURRENT"), False):
        return None, current_active

    job_id = f"remote-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"
    job_dir = job_root() / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    write_json(payload_path(job_id), payload)

    summary = summarize_payload(payload)
    status = {
        "jobId": job_id,
        "status": "accepted",
        "createdAt": utc_now_iso(),
        "summary": summary,
        "pid": None,
        "logPath": str(log_path(job_id)),
    }
    write_json(status_path(job_id), status)

    command = [python_bin(), str(Path(__file__).resolve()), "--run-job", str(payload_path(job_id))]
    with open(log_path(job_id), "ab") as handle:
        process = subprocess.Popen(
            command,
            cwd=repo_dir(),
            stdout=handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            env=os.environ.copy(),
        )

    status = update_status(job_id, pid=process.pid, acceptedAt=utc_now_iso())
    return status, None


class RemoteTrainingHandler(BaseHTTPRequestHandler):
    server_version = "AIGodsRemoteTraining/1.0"

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/healthz":
            current_active = active_job()
            return request_json(self, HTTPStatus.OK, {
                "ok": True,
                "service": "ai-gods-remote-training-webhook",
                "activeJob": current_active,
                "gpu": gpu_status(),
                "repoDir": str(repo_dir()),
                "jobRoot": str(job_root()),
            })

        if parsed.path == "/jobs":
            return request_json(self, HTTPStatus.OK, {
                "jobs": list_jobs(),
            })

        if parsed.path.startswith("/jobs/"):
            job_id = parsed.path.split("/", 2)[-1]
            status = read_json(status_path(job_id), fallback={})
            if not status:
                return request_json(self, HTTPStatus.NOT_FOUND, {"error": "job_not_found", "jobId": job_id})

            query = parse_qs(parsed.query)
            tail_count = 0
            try:
                tail_count = max(0, int((query.get("tail") or ["0"])[0]))
            except ValueError:
                tail_count = 0

            if tail_count > 0:
                status["logTail"] = tail_log(log_path(job_id), min(tail_count, 200))

            return request_json(self, HTTPStatus.OK, status)

        return request_json(self, HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/train":
            return request_json(self, HTTPStatus.NOT_FOUND, {"error": "not_found"})

        if not ensure_authorized(self):
            return request_json(self, HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})

        gpu = gpu_status(force=True)
        if require_gpu() and not gpu.get("available"):
            return request_json(self, HTTPStatus.SERVICE_UNAVAILABLE, {
                "accepted": False,
                "reason": "gpu_unavailable",
                "gpu": gpu,
            })

        try:
            payload = parse_request_body(self)
        except ValueError as error:
            return request_json(self, HTTPStatus.BAD_REQUEST, {"error": str(error)})

        datasets = payload.get("datasets") or []
        if not datasets:
            return request_json(self, HTTPStatus.BAD_REQUEST, {"error": "datasets 가 비어 있습니다."})

        status, existing = spawn_job(payload)
        if existing:
            return request_json(self, HTTPStatus.CONFLICT, {
                "accepted": False,
                "reason": "job_already_running",
                "activeJob": existing,
            })

        return request_json(self, HTTPStatus.ACCEPTED, {
            "accepted": True,
            "jobId": status["jobId"],
            "id": status["jobId"],
            "statusUrl": f"/jobs/{status['jobId']}",
        })

    def log_message(self, format, *args):
        return


def serve(args):
    job_root().mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), RemoteTrainingHandler)
    print(json.dumps({
        "host": args.host,
        "port": args.port,
        "repoDir": str(repo_dir()),
        "jobRoot": str(job_root()),
        "tokenConfigured": bool(webhook_token()),
        "gpu": gpu_status(force=True),
    }, ensure_ascii=False))
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser(description="원격 GPU 학습 웹훅")
    parser.add_argument("--host", default=resolve_env("REMOTE_WEBHOOK_HOST") or "0.0.0.0")
    parser.add_argument("--port", type=int, default=int(resolve_env("REMOTE_WEBHOOK_PORT") or "8787"))
    parser.add_argument("--run-job", default="")
    args = parser.parse_args()

    if args.run_job:
        run_job(args.run_job)
        return

    serve(args)


if __name__ == "__main__":
    main()