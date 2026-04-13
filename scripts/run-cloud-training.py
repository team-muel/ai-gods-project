"""원격 GPU 러너에서 전체 재학습 파이프라인을 수행한다."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")


def truthy(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def run_step(command, extra_env=None):
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)

    result = subprocess.run(command, env=env)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main():
    parser = argparse.ArgumentParser(description="클라우드 러너용 자동 재학습 파이프라인")
    parser.add_argument("--god", default="all")
    parser.add_argument("--skip-dpo", action="store_true")
    parser.add_argument("--skip-publish", action="store_true")
    parser.add_argument("--skip-activation", action="store_true")
    parser.add_argument("--include-merged", action="store_true")
    args = parser.parse_args()

    run_step([sys.executable, "scripts/finetune-god.py", "--god", args.god])

    if not args.skip_dpo:
        run_step([sys.executable, "scripts/train_dpo.py", "--god", args.god])

    artifact_target = (os.environ.get("MODEL_ARTIFACT_TARGET") or "huggingface").strip().lower()
    model_artifact_uri_base = ""
    if artifact_target == "supabase":
        model_bucket = os.environ.get("SUPABASE_MODEL_BUCKET") or os.environ.get("SUPABASE_DATASET_BUCKET") or "training-datasets"
        model_artifact_uri_base = f"supabase://{model_bucket}/runs/{os.environ.get('MODEL_RUN_ID', 'manual-run')}/merged"
    elif os.environ.get("HF_LORA_REPO"):
        model_artifact_uri_base = f"hf://{os.environ['HF_LORA_REPO'].strip('/')}/runs/{os.environ.get('MODEL_RUN_ID', 'manual-run')}/merged"

    model_adapter_uri_base = ""
    if artifact_target == "supabase":
        model_bucket = os.environ.get("SUPABASE_MODEL_BUCKET") or os.environ.get("SUPABASE_DATASET_BUCKET") or "training-datasets"
        model_adapter_uri_base = f"supabase://{model_bucket}/runs/{os.environ.get('MODEL_RUN_ID', 'manual-run')}/lora"
    elif os.environ.get("HF_LORA_REPO"):
        model_adapter_uri_base = f"hf://{os.environ['HF_LORA_REPO'].strip('/')}/runs/{os.environ.get('MODEL_RUN_ID', 'manual-run')}/lora"

    run_step(
        [sys.executable, "scripts/merge-and-register.py", "--god", args.god],
        {
            "SKIP_GGUF_CONVERSION": "1",
            "SKIP_OLLAMA_REGISTER": "1",
            "MODEL_ARTIFACT_URI_BASE": model_artifact_uri_base,
            "MODEL_ADAPTER_URI_BASE": model_adapter_uri_base,
            "MODEL_SERVING_PROVIDER": os.environ.get("MODEL_SERVING_PROVIDER", "custom-openai-compatible"),
        },
    )

    if not args.skip_publish:
        command = [sys.executable, "scripts/publish-training-artifacts.py"]
        if args.include_merged:
            command.append("--include-merged")
        extra_env = {
            "PUBLISH_INCLUDE_DPO": "0" if args.skip_dpo else "1",
        }
        run_step(command, extra_env)

    should_activate = truthy(os.environ.get("POST_TRAIN_ACTIVATE_STACK", "1"), default=True)
    if not args.skip_activation and should_activate:
        run_step([
            sys.executable,
            "scripts/activate-serving-stack.py",
            "--run-id",
            os.environ.get("MODEL_RUN_ID", "manual-run"),
        ])


if __name__ == "__main__":
    main()