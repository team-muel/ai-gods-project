"""학습 완료 후 상시 추론 서버와 Vercel production을 최신 모델로 갱신한다."""

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")


def truthy(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def resolve_env(*keys):
    for key in keys:
        value = os.environ.get(key)
        if value:
            return value
    return ""


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def append_github_outputs(outputs):
    output_path = os.environ.get("GITHUB_OUTPUT")
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as handle:
        for key, value in outputs.items():
            handle.write(f"{key}={value}\n")


def fetch_json(url, method="GET", token="", payload=None):
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Accept": "application/json",
            "User-Agent": "ai-gods-activation-script",
            **({"Authorization": f"Bearer {token}"} if token else {}),
            **({"Content-Type": "application/json"} if payload is not None else {}),
        },
    )

    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        try:
            parsed = json.loads(detail or "{}")
        except json.JSONDecodeError:
            parsed = {"message": detail or str(error)}
        message = parsed.get("error", {}).get("message") if isinstance(parsed.get("error"), dict) else parsed.get("error")
        raise RuntimeError(message or parsed.get("message") or f"{error.code} {error.reason}") from error


def upsert_vercel_env(project_key, team_id, token, key, value, comment):
    query = urllib.parse.urlencode({
        "upsert": "true",
        **({"teamId": team_id} if team_id else {}),
    })
    endpoint = f"https://api.vercel.com/v10/projects/{urllib.parse.quote(project_key, safe='')}/env?{query}"
    fetch_json(
        endpoint,
        method="POST",
        token=token,
        payload={
            "key": key,
            "value": value,
            "type": "plain",
            "target": ["production", "preview", "development"],
            "comment": comment,
        },
    )


def sync_vercel_runtime(run_id, activated_at):
    token = resolve_env("VERCEL_TOKEN")
    project_key = resolve_env("VERCEL_PROJECT_ID", "VERCEL_PROJECT_NAME")
    team_id = resolve_env("VERCEL_TEAM_ID")

    if not token or not project_key:
        return {"ok": False, "skipped": True, "reason": "missing_vercel_credentials"}

    runtime_vars = [
        ("MODEL_ACTIVE_RUN_ID", run_id),
        ("MODEL_ACTIVATED_AT", activated_at),
    ]

    for key in [
        "CHAT_PROVIDER_MODE",
        "CUSTOM_MODEL_BASE_URL",
        "CUSTOM_MODEL_CHAT_PATH",
        "CUSTOM_MODEL_TIMEOUT_MS",
        "CUSTOM_MODEL_NAME",
        "MODEL_ROUTER_ALLOW_FALLBACK",
    ]:
        value = resolve_env(key)
        if value:
            runtime_vars.append((key, value))

    for key, value in runtime_vars:
        upsert_vercel_env(project_key, team_id, token, key, value, "AI Gods post-training runtime sync")

    return {"ok": True, "skipped": False, "project": project_key, "keys": [key for key, _ in runtime_vars]}


def get_vercel_project(project_key, team_id, token):
    query = urllib.parse.urlencode({**({"teamId": team_id} if team_id else {})})
    suffix = f"?{query}" if query else ""
    return fetch_json(f"https://api.vercel.com/v9/projects/{urllib.parse.quote(project_key, safe='')}{suffix}", token=token)


def get_latest_ready_production_deployment(project_id, team_id, token):
    params = {
        "projectId": project_id,
        "limit": "100",
    }
    if team_id:
        params["teamId"] = team_id
    data = fetch_json(f"https://api.vercel.com/v6/deployments?{urllib.parse.urlencode(params)}", token=token)
    deployments = data.get("deployments") or []
    ready = []
    for deployment in deployments:
        state = str(deployment.get("readyState") or deployment.get("state") or "").upper()
        target = str(deployment.get("target") or "preview").lower()
        if state != "READY" or target != "production":
            continue
        created_at = int(deployment.get("created") or deployment.get("createdAt") or deployment.get("readyTimestamp") or 0)
        ready.append((created_at, deployment))

    if not ready:
        return None
    ready.sort(key=lambda item: item[0], reverse=True)
    return ready[0][1]


def redeploy_vercel_production(run_id):
    token = resolve_env("VERCEL_TOKEN")
    project_key = resolve_env("VERCEL_PROJECT_ID", "VERCEL_PROJECT_NAME")
    team_id = resolve_env("VERCEL_TEAM_ID")

    if not token or not project_key:
        return {"ok": False, "skipped": True, "reason": "missing_vercel_credentials"}

    project = get_vercel_project(project_key, team_id, token)
    latest = get_latest_ready_production_deployment(project.get("id") or project_key, team_id, token)
    if not latest:
        return {"ok": False, "skipped": True, "reason": "no_ready_production_deployment"}

    params = urllib.parse.urlencode({**({"teamId": team_id} if team_id else {})})
    endpoint = f"https://api.vercel.com/v13/deployments?{params}" if params else "https://api.vercel.com/v13/deployments"
    payload = {
        "deploymentId": latest.get("uid") or latest.get("id"),
        "project": project.get("id") or project_key,
        "name": project.get("name") or project_key,
        "target": resolve_env("VERCEL_DEPLOY_TARGET") or "production",
        "withLatestCommit": True,
        "meta": {
            "reason": "model-activation",
            "modelRunId": run_id,
        },
    }
    created = fetch_json(endpoint, method="POST", token=token, payload=payload)
    return {
        "ok": True,
        "skipped": False,
        "deploymentId": created.get("id") or created.get("uid"),
        "deploymentUrl": f"https://{created.get('url')}" if created.get("url") else "",
        "project": project.get("name") or project_key,
    }


def wait_for_space_ready(space_id, token, timeout_seconds):
    try:
        from huggingface_hub import HfApi
    except Exception as error:
        raise RuntimeError(f"huggingface_hub import 실패: {error}") from error

    api = HfApi(token=token)
    started = time.time()
    last_stage = ""
    while time.time() - started < timeout_seconds:
        runtime = api.get_space_runtime(space_id)
        stage = str(getattr(runtime, "stage", "") or "")
        last_stage = stage
        if stage == "RUNNING":
            return {"ok": True, "stage": stage}
        time.sleep(15)
    return {"ok": False, "stage": last_stage, "reason": "timeout"}


def restart_hf_space(run_id):
    space_id = resolve_env("HF_SPACE_ID")
    token = resolve_env("HF_TOKEN")
    artifact_target = (resolve_env("MODEL_ARTIFACT_TARGET") or "huggingface").strip().lower()

    if artifact_target != "huggingface":
        return {"ok": False, "skipped": True, "reason": "artifact_target_not_huggingface"}
    if not space_id or not token:
        return {"ok": False, "skipped": True, "reason": "missing_hf_space_credentials"}

    try:
        from huggingface_hub import HfApi
    except Exception as error:
        raise RuntimeError(f"huggingface_hub import 실패: {error}") from error

    api = HfApi(token=token)
    runtime = api.restart_space(space_id, factory_reboot=truthy(os.environ.get("HF_SPACE_FACTORY_REBOOT"), default=False))
    result = {
        "ok": True,
        "skipped": False,
        "spaceId": space_id,
        "stage": str(getattr(runtime, "stage", "") or ""),
        "runId": run_id,
    }

    if truthy(os.environ.get("HF_SPACE_WAIT_READY", "1"), default=True):
        wait_seconds = max(60, int(os.environ.get("HF_SPACE_WAIT_READY_SECONDS") or "900"))
        wait_result = wait_for_space_ready(space_id, token, wait_seconds)
        result["wait"] = wait_result
        if not wait_result.get("ok"):
            raise RuntimeError(f"HF Space 재기동 후 RUNNING 대기 실패: {wait_result.get('stage') or wait_result.get('reason')}")

    return result


def main():
    parser = argparse.ArgumentParser(description="학습 완료 후 serving/Vercel stack 자동 활성화")
    parser.add_argument("--run-id", default=resolve_env("MODEL_RUN_ID") or f"manual-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}")
    parser.add_argument("--skip-space-restart", action="store_true")
    parser.add_argument("--skip-vercel-sync", action="store_true")
    parser.add_argument("--skip-vercel-redeploy", action="store_true")
    args = parser.parse_args()

    activated_at = utc_now_iso()
    result = {
        "runId": args.run_id,
        "activatedAt": activated_at,
    }

    if not args.skip_space_restart:
        result["space"] = restart_hf_space(args.run_id)

    if not args.skip_vercel_sync:
        result["vercelEnv"] = sync_vercel_runtime(args.run_id, activated_at)

    if not args.skip_vercel_redeploy:
        result["vercelDeploy"] = redeploy_vercel_production(args.run_id)

    append_github_outputs({
        "model_active_run_id": args.run_id,
        "model_activated_at": activated_at,
        "vercel_env_synced": "true" if result.get("vercelEnv", {}).get("ok") else "false",
        "vercel_redeploy_triggered": "true" if result.get("vercelDeploy", {}).get("ok") else "false",
        "vercel_deployment_url": result.get("vercelDeploy", {}).get("deploymentUrl", ""),
        "hf_space_restarted": "true" if result.get("space", {}).get("ok") else "false",
    })

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()