"""원격 학습 결과를 Hugging Face Hub 또는 Supabase Storage에 업로드한다."""

import argparse
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

SAFE_ADAPTER_FILES = {
    "adapter_config.json",
    "adapter_model.safetensors",
}
SAFE_TOKENIZER_FILES = {
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "added_tokens.json",
}
SAFE_MERGED_FILES = {
    "config.json",
    "generation_config.json",
    "model.safetensors.index.json",
}
SAFE_MERGED_SUFFIXES = (
    ".safetensors",
)


def truthy(value):
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def build_path(prefix, *parts):
    normalized = [segment.strip("/") for segment in (prefix, *parts) if segment]
    return "/".join(normalized)


def read_bytes(file_path):
    return Path(file_path).read_bytes()


def guess_content_type(file_name):
    lower_name = file_name.lower()
    if lower_name.endswith(".json"):
        return "application/json"
    if lower_name.endswith(".safetensors"):
        return "application/octet-stream"
    if lower_name.endswith(".md"):
        return "text/markdown"
    return "application/octet-stream"


def should_include_file(kind, file_name, include_tokenizer):
    if kind in {"lora", "dpo"}:
        return file_name in SAFE_ADAPTER_FILES or (include_tokenizer and file_name in SAFE_TOKENIZER_FILES)

    if kind == "merged":
        return file_name in SAFE_MERGED_FILES or file_name.endswith(SAFE_MERGED_SUFFIXES) or (include_tokenizer and file_name in SAFE_TOKENIZER_FILES)

    return False


def has_adapter_files(path):
    return (path / "adapter_config.json").exists() and (path / "adapter_model.safetensors").exists()


def resolve_active_serving_dir(model_id, include_dpo):
    dpo_dir = Path("models/dpo") / model_id
    lora_dir = Path("models/lora") / model_id

    if include_dpo and has_adapter_files(dpo_dir):
        return dpo_dir, "dpo"
    if has_adapter_files(lora_dir):
        return lora_dir, "lora"
    return None, None


def collect_entries(root_dir, kind, publish_root, include_tokenizer):
    entries = []
    if not root_dir.exists():
        return entries

    for model_dir in sorted(path for path in root_dir.iterdir() if path.is_dir()):
        for file_path in sorted(path for path in model_dir.iterdir() if path.is_file()):
            if not should_include_file(kind, file_path.name, include_tokenizer):
                continue

            entries.append({
                "kind": kind,
                "modelId": model_dir.name,
                "localPath": str(file_path),
                "remotePath": build_path(publish_root, kind, model_dir.name, file_path.name),
                "contentType": guess_content_type(file_path.name),
            })

    return entries


def collect_serving_alias_entries(include_dpo, include_tokenizer):
    entries = []
    model_ids = set()

    for root_dir in [Path("models/lora"), Path("models/dpo") if include_dpo else None]:
        if not root_dir or not root_dir.exists():
            continue
        for model_dir in sorted(path for path in root_dir.iterdir() if path.is_dir()):
            model_ids.add(model_dir.name)

    for model_id in sorted(model_ids):
        source_dir, source_kind = resolve_active_serving_dir(model_id, include_dpo)
        if not source_dir:
            continue

        for file_path in sorted(path for path in source_dir.iterdir() if path.is_file()):
            if not should_include_file("lora", file_path.name, include_tokenizer):
                continue

            entries.append({
                "kind": "serving-alias",
                "sourceKind": source_kind,
                "modelId": model_id,
                "localPath": str(file_path),
                "remotePath": build_path("", model_id, file_path.name),
                "contentType": guess_content_type(file_path.name),
            })

    return entries


def build_manifest(args, target, entries):
    return {
        "target": target,
        "repo": args.repo if target == "huggingface" else "",
        "bucket": args.bucket if target == "supabase" else "",
        "runId": args.run_id,
        "snapshotId": args.snapshot_id,
        "includeDpo": args.include_dpo,
        "includeMerged": args.include_merged,
        "includeTokenizer": args.include_tokenizer,
        "publishServingAliases": args.publish_serving_aliases,
        "published": [
            {
                "kind": entry["kind"],
                "modelId": entry["modelId"],
                "localPath": entry["localPath"],
                "remotePath": entry["remotePath"],
                "sourceKind": entry.get("sourceKind"),
            }
            for entry in entries
        ],
    }


def publish_to_huggingface(args, entries, manifest):
    token = os.environ.get("HF_TOKEN") or ""
    if not token:
        raise SystemExit("HF_TOKEN 필요")
    if not args.repo:
        raise SystemExit("HF_LORA_REPO 또는 --repo 필요")

    try:
        from huggingface_hub import HfApi
    except ImportError as error:
        raise SystemExit(f"huggingface_hub 필요: {error}")

    api = HfApi(token=token)
    api.create_repo(repo_id=args.repo, repo_type="model", exist_ok=True, private=args.repo_private)

    for entry in entries:
        api.upload_file(
            repo_id=args.repo,
            path_or_fileobj=entry["localPath"],
            path_in_repo=entry["remotePath"],
            repo_type="model",
        )

    api.upload_file(
        repo_id=args.repo,
        path_or_fileobj=json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
        path_in_repo=build_path("runs", args.run_id, "artifact-manifest.json"),
        repo_type="model",
    )


def upload_bytes_to_supabase(supabase_url, supabase_key, bucket, object_path, payload, content_type):
    encoded_path = urllib.parse.quote(object_path, safe="/")
    request = urllib.request.Request(
        url=f"{supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{encoded_path}",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {supabase_key}",
            "apikey": supabase_key,
            "Content-Type": content_type,
            "x-upsert": "true",
        },
    )
    with urllib.request.urlopen(request) as response:
        response.read()


def publish_to_supabase(args, entries, manifest):
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or ""
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY") or ""

    if not supabase_url or not supabase_key:
        raise SystemExit("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY 필요")

    for entry in entries:
        upload_bytes_to_supabase(
            supabase_url,
            supabase_key,
            args.bucket,
            entry["remotePath"],
            read_bytes(entry["localPath"]),
            entry["contentType"],
        )

    upload_bytes_to_supabase(
        supabase_url,
        supabase_key,
        args.bucket,
        build_path("runs", args.run_id, "artifact-manifest.json"),
        json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
        "application/json",
    )


def main():
    parser = argparse.ArgumentParser(description="학습 산출물을 안전하게 퍼블리시")
    parser.add_argument("--run-id", default=os.environ.get("MODEL_RUN_ID") or "manual-run")
    parser.add_argument("--repo", default=os.environ.get("HF_LORA_REPO") or "")
    parser.add_argument("--bucket", default=os.environ.get("SUPABASE_MODEL_BUCKET") or os.environ.get("SUPABASE_DATASET_BUCKET") or "training-datasets")
    parser.add_argument("--snapshot-id", default=os.environ.get("DATASET_SNAPSHOT_ID") or "")
    parser.add_argument("--target", choices=["huggingface", "supabase"], default=(os.environ.get("MODEL_ARTIFACT_TARGET") or "huggingface").strip().lower())
    parser.add_argument("--include-merged", action="store_true", default=truthy(os.environ.get("PUBLISH_INCLUDE_MERGED")))
    parser.add_argument("--include-tokenizer", action="store_true", default=truthy(os.environ.get("HF_INCLUDE_TOKENIZER")))
    parser.add_argument("--repo-private", dest="repo_private", action="store_true")
    parser.add_argument("--repo-public", dest="repo_private", action="store_false")
    parser.add_argument("--include-dpo", dest="include_dpo", action="store_true")
    parser.add_argument("--skip-dpo", dest="include_dpo", action="store_false")
    parser.add_argument("--publish-serving-aliases", dest="publish_serving_aliases", action="store_true")
    parser.add_argument("--skip-serving-aliases", dest="publish_serving_aliases", action="store_false")
    parser.set_defaults(
        include_dpo=truthy(os.environ.get("PUBLISH_INCLUDE_DPO", "1")),
        publish_serving_aliases=truthy(os.environ.get("PUBLISH_SERVING_ALIASES", "1")),
        repo_private=truthy(os.environ.get("HF_PRIVATE_REPO", "1")),
    )
    parser.add_argument("--out", default="outputs/cloud-training-publish.json")
    args = parser.parse_args()

    publish_root = build_path("runs", args.run_id)
    entries = []
    entries.extend(collect_entries(Path("models/lora"), "lora", publish_root, args.include_tokenizer))

    if args.include_dpo:
        entries.extend(collect_entries(Path("models/dpo"), "dpo", publish_root, args.include_tokenizer))

    if args.include_merged:
        entries.extend(collect_entries(Path("models/merged"), "merged", publish_root, args.include_tokenizer))

    if args.target == "huggingface" and args.publish_serving_aliases:
        entries.extend(collect_serving_alias_entries(args.include_dpo, args.include_tokenizer))

    if not entries:
        raise SystemExit("퍼블리시할 모델 산출물이 없습니다.")

    manifest = build_manifest(args, args.target, entries)

    if args.target == "huggingface":
        publish_to_huggingface(args, entries, manifest)
    else:
        publish_to_supabase(args, entries, manifest)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()