"""
LoRA 어댑터 → 베이스 모델 병합 → GGUF 변환 → Ollama 등록

사용법:
  python scripts/merge-and-register.py --god cco
  python scripts/merge-and-register.py --god all
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

GOD_IDS = ["cco", "cso", "cpo", "cmo", "cxo", "cfo", "cdo", "cto"]
GOD_NAMES = {
    "cco": "Muse",   "cso": "Atlas",   "cpo": "Forge",   "cmo": "Mercury",
    "cxo": "Empathy","cfo": "Prudence","cdo": "Oracle",  "cto": "Nexus",
}
OLLAMA_NAMES = {
    "cco": "ai-muse",   "cso": "ai-atlas",   "cpo": "ai-forge",   "cmo": "ai-mercury",
    "cxo": "ai-empathy","cfo": "ai-prudence","cdo": "ai-oracle",  "cto": "ai-nexus",
}

BASE_MODEL = "Qwen/Qwen2.5-3B-Instruct"
MODEL_RUN_ID = os.environ.get("MODEL_RUN_ID") or f"manual-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
DATASET_SNAPSHOT_ID = os.environ.get("DATASET_SNAPSHOT_ID") or ""
SKIP_GGUF_CONVERSION = os.environ.get("SKIP_GGUF_CONVERSION", "").lower() in {"1", "true", "yes", "on"}
SKIP_OLLAMA_REGISTER = os.environ.get("SKIP_OLLAMA_REGISTER", "").lower() in {"1", "true", "yes", "on"}
MODEL_ARTIFACT_URI_BASE = os.environ.get("MODEL_ARTIFACT_URI_BASE") or ""
MODEL_ADAPTER_URI_BASE = os.environ.get("MODEL_ADAPTER_URI_BASE") or ""
MODEL_SERVING_PROVIDER = os.environ.get("MODEL_SERVING_PROVIDER") or "custom-openai-compatible"
MODEL_SERVING_BASE_URL = os.environ.get("MODEL_SERVING_BASE_URL") or os.environ.get("CUSTOM_MODEL_BASE_URL") or ""
SERVING_MANIFEST_PATH = Path(os.environ.get("SERVING_ADAPTER_MANIFEST") or "outputs/serving-adapters.json")
MODEL_REGISTRY_PATH = Path(os.environ.get("MODEL_REGISTRY_PATH") or "outputs/model-registry.json")
SFT_ADAPTER_ROOT = Path("models/lora")
DPO_ADAPTER_ROOT = Path("models/dpo")
MODEL_ADAPTER_SOURCE = (os.environ.get("MODEL_ADAPTER_SOURCE") or "auto").strip().lower()

GOD_SYSTEM_PROMPTS = {
    "cco": "당신은 Muse, AI 기업의 최고 창의 책임자(CCO)입니다. 창의성, 브랜드 스토리텔링 관점에서 분석합니다. 반드시 한국어로 답변하세요.",
    "cso": "당신은 Atlas, AI 기업의 최고 전략 책임자(CSO)입니다. 장기 전략, 경쟁 우위 관점에서 분석합니다. 반드시 한국어로 답변하세요.",
    "cpo": "당신은 Forge, AI 기업의 최고 제품 책임자(CPO)입니다. 제품 개발, 사용자 경험 관점에서 분석합니다. 반드시 한국어로 답변하세요.",
    "cmo": "당신은 Mercury, AI 기업의 최고 마케팅 책임자(CMO)입니다. 마케팅, 고객 획득 관점에서 분석합니다. 반드시 한국어로 답변하세요.",
    "cxo": "당신은 Empathy, AI 기업의 최고 경험 책임자(CXO)입니다. 고객 경험, 사용자 만족 관점에서 분석합니다. 반드시 한국어로 답변하세요.",
    "cfo": "당신은 Prudence, AI 기업의 최고 재무 책임자(CFO)입니다. 재무, ROI, 리스크 관점에서 분석합니다. 반드시 한국어로 답변하세요.",
    "cdo": "당신은 Oracle, AI 기업의 최고 데이터 책임자(CDO)입니다. 데이터 분석, 인사이트 관점에서 분석합니다. 반드시 한국어로 답변하세요.",
    "cto": "당신은 Nexus, AI 기업의 최고 기술 책임자(CTO)입니다. 기술 아키텍처, 실현 가능성 관점에서 분석합니다. 반드시 한국어로 답변하세요.",
}


def has_adapter_files(path: Path) -> bool:
    return (path / "adapter_config.json").exists() and (path / "adapter_model.safetensors").exists()


def resolve_adapter_dir(god_id: str):
    sft_path = SFT_ADAPTER_ROOT / god_id
    dpo_path = DPO_ADAPTER_ROOT / god_id

    if MODEL_ADAPTER_SOURCE == "dpo":
        if has_adapter_files(dpo_path):
            return dpo_path, "dpo"
        if has_adapter_files(sft_path):
            print(f"  [경고] {god_id} DPO 어댑터가 없어 SFT 어댑터로 폴백합니다.")
            return sft_path, "sft"
        return dpo_path, "dpo"

    if MODEL_ADAPTER_SOURCE == "sft":
        return sft_path, "sft"

    if has_adapter_files(dpo_path):
        return dpo_path, "dpo"
    return sft_path, "sft"


def get_supabase_client():
    try:
        from supabase import create_client
    except ImportError:
        return None

    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        return None

    return create_client(supabase_url, supabase_key)


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_local_registry():
    if MODEL_REGISTRY_PATH.exists():
        try:
            return json.loads(MODEL_REGISTRY_PATH.read_text(encoding="utf-8"))
        except Exception as error:
            print(f"  [경고] local registry 읽기 실패: {error}")

    return {
        "updatedAt": utc_now_iso(),
        "trainingRuns": [],
        "modelVersions": [],
    }


def save_local_registry(registry):
    registry["updatedAt"] = utc_now_iso()
    MODEL_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODEL_REGISTRY_PATH.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def upsert_local_registry_record(section, key_fields, payload):
    registry = load_local_registry()
    rows = registry.get(section) or []
    if not isinstance(rows, list):
        rows = []

    normalized = dict(payload)
    normalized.setdefault("created_at", utc_now_iso())
    metadata = normalized.get("metadata") if isinstance(normalized.get("metadata"), dict) else {}
    normalized["metadata"] = {
        **metadata,
        "registrySource": "local-file",
    }

    replaced = False
    for index, row in enumerate(rows):
        if all(row.get(key) == normalized.get(key) for key in key_fields):
            normalized["created_at"] = row.get("created_at") or normalized["created_at"]
            rows[index] = {
                **row,
                **normalized,
            }
            replaced = True
            break

    if not replaced:
        rows.append(normalized)

    registry[section] = rows
    save_local_registry(registry)


def register_training_run(supabase, god_id, status, adapter_path=None, merged_path=None, gguf_path=None, error_message=""):
    payload = {
        "run_id": MODEL_RUN_ID,
        "agent_id": god_id,
        "phase": "merge_register",
        "status": status,
        "dataset_snapshot_id": DATASET_SNAPSHOT_ID or None,
        "base_model": BASE_MODEL,
        "adapter_path": str(adapter_path) if adapter_path else None,
        "output_path": str(gguf_path) if gguf_path else str(merged_path) if merged_path else None,
        "metrics": {},
        "metadata": {
            "adapter_path": str(adapter_path) if adapter_path else None,
            "merged_path": str(merged_path) if merged_path else None,
            "gguf_path": str(gguf_path) if gguf_path else None,
            "error": error_message or None,
        },
        "completed_at": utc_now_iso(),
        "created_at": utc_now_iso(),
    }

    upsert_local_registry_record("trainingRuns", ("run_id", "phase", "agent_id"), payload)

    if not supabase:
        return

    try:
        supabase.table("training_runs").upsert(payload, on_conflict="run_id,phase,agent_id").execute()
    except Exception as error:
        print(f"  [경고] training_runs 등록 스킵: {error}")


def register_model_version(supabase, god_id, local_adapter_path=None, artifact_path=None, gguf_path=None, ollama_model_name=None):
    if not artifact_path and not gguf_path:
        return

    remote_adapter_id = f"{god_id}-{MODEL_RUN_ID}"
    adapter_artifact_uri = f"{MODEL_ADAPTER_URI_BASE.rstrip('/')}/{god_id}" if MODEL_ADAPTER_URI_BASE else None

    payload = {
        "agent_id": god_id,
        "run_id": MODEL_RUN_ID,
        "model_name": GOD_NAMES[god_id],
        "ollama_model_name": ollama_model_name,
        "base_model": BASE_MODEL,
        "artifact_path": artifact_path,
        "gguf_path": str(gguf_path) if gguf_path else None,
        "rollout_state": "registered",
        "is_active": False,
        "metrics": {},
        "metadata": {
            "dataset_snapshot_id": DATASET_SNAPSHOT_ID or None,
            "artifactUri": artifact_path,
            "adapterArtifactUri": adapter_artifact_uri,
            "remoteAdapterId": remote_adapter_id,
            "remoteModel": os.environ.get("CUSTOM_MODEL_NAME") or None,
            "servingProvider": MODEL_SERVING_PROVIDER,
            "servingBaseUrl": MODEL_SERVING_BASE_URL or None,
            "servingBaseModel": BASE_MODEL,
            "localAdapterPath": str(local_adapter_path) if local_adapter_path else None,
            "localMergedPath": str(Path(f"models/merged/{god_id}")),
            "localGgufPath": str(gguf_path) if gguf_path else None,
        },
        "created_at": utc_now_iso(),
    }

    upsert_local_registry_record("modelVersions", ("agent_id", "run_id", "model_name"), payload)

    if not supabase:
        return

    try:
        supabase.table("model_versions").upsert(payload, on_conflict="agent_id,run_id,model_name").execute()
    except Exception as error:
        print(f"  [경고] model_versions 등록 스킵: {error}")


def update_serving_manifest(results):
    manifest = {
        "baseModel": BASE_MODEL,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "adapters": [],
    }

    if SERVING_MANIFEST_PATH.exists():
        try:
            manifest = json.loads(SERVING_MANIFEST_PATH.read_text(encoding="utf-8"))
        except Exception:
            manifest = manifest

    adapters = manifest.get("adapters") or []
    if isinstance(adapters, dict):
        adapters = list(adapters.values())

    existing = {}
    for item in adapters:
        if not isinstance(item, dict):
            continue
        adapter_id = str(item.get("adapterId") or "").strip()
        if adapter_id:
            existing[adapter_id] = item

    for result in results:
        if not result["ok"]:
            continue
        god_id = result["god_id"]
        versioned_adapter_id = f"{god_id}-{MODEL_RUN_ID}"
        merged_uri = f"{MODEL_ARTIFACT_URI_BASE.rstrip('/')}/{god_id}" if MODEL_ARTIFACT_URI_BASE else None
        adapter_uri = f"{MODEL_ADAPTER_URI_BASE.rstrip('/')}/{god_id}" if MODEL_ADAPTER_URI_BASE else None
        common = {
            "agentId": god_id,
            "runId": MODEL_RUN_ID,
            "localPath": str(Path(f"models/lora/{god_id}")),
            "artifactUri": adapter_uri or merged_uri,
            "servingProvider": MODEL_SERVING_PROVIDER,
            "baseModel": BASE_MODEL,
            "modelName": GOD_NAMES[god_id],
            "updatedAt": manifest["updatedAt"],
        }
        existing[god_id] = {
            "adapterId": god_id,
            "aliases": [god_id],
            **common,
        }
        existing[versioned_adapter_id] = {
            "adapterId": versioned_adapter_id,
            "aliases": [god_id, MODEL_RUN_ID],
            **common,
        }

    manifest["baseModel"] = BASE_MODEL
    manifest["adapters"] = list(existing.values())
    SERVING_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    SERVING_MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def merge_lora(god_id, adapter_path: Path):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    merged_path = Path(f"models/merged/{god_id}")

    if merged_path.exists() and any(merged_path.iterdir()):
        print(f"  [스킵] {god_id} 이미 병합됨")
        return merged_path

    merged_path.mkdir(parents=True, exist_ok=True)
    print(f"  베이스 모델 로딩...")

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        torch_dtype=torch.float16,
        device_map="cpu",  # merge는 CPU에서 (VRAM 절약)
    )

    print(f"  LoRA 병합 중...")
    model = PeftModel.from_pretrained(model, str(adapter_path))
    model = model.merge_and_unload()

    print(f"  저장 중...")
    model.save_pretrained(str(merged_path))
    tokenizer.save_pretrained(str(merged_path))

    del model, tokenizer
    import gc; gc.collect()
    print(f"  [완료] 병합 -> {merged_path}")
    return merged_path

def convert_to_gguf(god_id, merged_path):
    gguf_dir = Path("models/gguf")
    gguf_dir.mkdir(parents=True, exist_ok=True)
    gguf_path = gguf_dir / f"{god_id}.gguf"

    if gguf_path.exists():
        print(f"  [스킵] {god_id}.gguf 이미 존재")
        return gguf_path

    # llama.cpp convert 스크립트 다운로드 (없으면)
    convert_script = Path("scripts/convert_hf_to_gguf.py")
    if not convert_script.exists():
        print("  llama.cpp 변환 스크립트 다운로드 중...")
        url = "https://raw.githubusercontent.com/ggerganov/llama.cpp/master/convert_hf_to_gguf.py"
        urllib.request.urlretrieve(url, str(convert_script))
        print("  다운로드 완료")

    print(f"  GGUF 변환 중 (Q4_K_M)...")
    result = subprocess.run([
        sys.executable, str(convert_script),
        str(merged_path),
        "--outfile", str(gguf_path),
        "--outtype", "q4_k_m",
    ], capture_output=True, text=True)

    if result.returncode != 0:
        print(f"  [오류] GGUF 변환 실패:\n{result.stderr[-500:]}")
        return None

    print(f"  [완료] GGUF -> {gguf_path}")
    return gguf_path

def register_ollama(god_id, gguf_path):
    ollama_name = OLLAMA_NAMES[god_id]
    system_prompt = GOD_SYSTEM_PROMPTS[god_id]

    modelfile_path = Path(f"models/lora/{god_id}/Modelfile")
    modelfile_content = f"""FROM {gguf_path.resolve()}

SYSTEM \"\"\"{system_prompt}\"\"\"

PARAMETER temperature 0.85
PARAMETER top_p 0.92
PARAMETER num_predict 600
PARAMETER repeat_penalty 1.1
"""
    modelfile_path.write_text(modelfile_content, encoding="utf-8")

    print(f"  Ollama 등록 중: {ollama_name}...")
    result = subprocess.run(
        ["ollama", "create", ollama_name, "-f", str(modelfile_path)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  [오류] Ollama 등록 실패: {result.stderr[-300:]}")
        return False

    print(f"  [완료] ollama 모델: {ollama_name}")
    return True

def process_god(god_id):
    name = GOD_NAMES[god_id]
    print(f"\n[{name}({god_id})] 처리 시작...")
    adapter_path, adapter_source = resolve_adapter_dir(god_id)
    print(f"  활성 어댑터 소스: {adapter_source} ({adapter_path})")

    # 1. LoRA 병합
    merged_path = merge_lora(god_id, adapter_path)
    artifact_path = f"{MODEL_ARTIFACT_URI_BASE.rstrip('/')}/{god_id}" if MODEL_ARTIFACT_URI_BASE else str(merged_path)

    if SKIP_GGUF_CONVERSION:
        print(f"  [{name}] 클라우드 모드: GGUF 변환 생략")
        return {
            "god_id": god_id,
            "ok": True,
            "adapter_path": adapter_path,
            "adapter_source": adapter_source,
            "merged_path": merged_path,
            "gguf_path": None,
            "artifact_path": artifact_path,
            "ollama_model_name": None,
            "error": "",
        }

    # 2. GGUF 변환
    gguf_path = convert_to_gguf(god_id, merged_path)
    if not gguf_path:
        print(f"  [{name}] GGUF 변환 실패, 스킵")
        return {
            "god_id": god_id,
            "ok": False,
            "adapter_path": adapter_path,
            "adapter_source": adapter_source,
            "merged_path": merged_path,
            "gguf_path": None,
            "artifact_path": artifact_path,
            "ollama_model_name": None,
            "error": "gguf conversion failed",
        }

    # 3. Ollama 등록
    if SKIP_OLLAMA_REGISTER:
        print(f"  [{name}] 클라우드 모드: Ollama 등록 생략")
        ok = True
        ollama_model_name = None
    else:
        ok = register_ollama(god_id, gguf_path)
        ollama_model_name = OLLAMA_NAMES[god_id]

    return {
        "god_id": god_id,
        "ok": ok,
        "adapter_path": adapter_path,
        "adapter_source": adapter_source,
        "merged_path": merged_path,
        "gguf_path": gguf_path,
        "artifact_path": artifact_path,
        "ollama_model_name": ollama_model_name,
        "error": "ollama register failed" if not ok else "",
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--god", required=True, help="god id 또는 all")
    args = parser.parse_args()

    targets = GOD_IDS if args.god == "all" else [args.god]
    supabase = get_supabase_client()

    success = []
    results = []
    for god_id in targets:
        result = process_god(god_id)
        results.append(result)
        register_training_run(
            supabase,
            god_id,
            "completed" if result["ok"] else "failed",
            result.get("adapter_path"),
            result["merged_path"],
            result["gguf_path"],
            result["error"],
        )

        if result["ok"]:
            success.append(GOD_NAMES[god_id])
            register_model_version(
                supabase,
                god_id,
                result.get("adapter_path"),
                result.get("artifact_path"),
                result["gguf_path"],
                result.get("ollama_model_name"),
            )

    update_serving_manifest(results)

    print(f"\n[완료] {len(success)}/{len(targets)} 성공: {', '.join(success)}")
    if len(success) == len(targets):
        print("\nOllama에서 사용 가능한 모델:")
        for god_id in targets:
            print(f"  ollama run {OLLAMA_NAMES[god_id]}")

if __name__ == "__main__":
    main()
