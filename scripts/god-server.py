"""
AI Gods 직접 서빙 서버

- 베이스 모델 1개를 메모리에 올린 뒤 역할별 LoRA adapter 를 hot-swap 한다.
- OpenAI 호환 /v1/chat/completions 와 기존 Ollama 호환 /api/chat 을 함께 제공한다.
- outputs/serving-adapters.json manifest 와 models/lora/<agent_id> 디렉터리를 함께 사용한다.
"""

from __future__ import annotations

import gc
import json
import os
import threading
import time
import uuid
from collections import OrderedDict
from contextlib import nullcontext
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
import torch
import uvicorn
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

load_dotenv(Path(__file__).parent.parent / ".env")


def truthy(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def to_int(value: Any, default: int, minimum: Optional[int] = None) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    if minimum is not None:
        parsed = max(parsed, minimum)
    return parsed


def to_float(value: Any, default: float, minimum: Optional[float] = None, maximum: Optional[float] = None) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    if minimum is not None:
        parsed = max(parsed, minimum)
    if maximum is not None:
        parsed = min(parsed, maximum)
    return parsed


def resolve_torch_dtype(name: str):
    lookup = {
        "float16": torch.float16,
        "fp16": torch.float16,
        "bfloat16": torch.bfloat16,
        "bf16": torch.bfloat16,
        "float32": torch.float32,
        "fp32": torch.float32,
    }
    return lookup.get(str(name or "").strip().lower(), torch.float16 if torch.cuda.is_available() else torch.float32)


BASE_MODEL = os.environ.get("SERVING_BASE_MODEL") or os.environ.get("MODEL_SERVING_BASE_MODEL") or "Qwen/Qwen2.5-3B-Instruct"
ADAPTER_ROOT = Path(os.environ.get("SERVING_ADAPTER_ROOT") or "models/lora")
ADAPTER_MANIFEST = Path(os.environ.get("SERVING_ADAPTER_MANIFEST") or "outputs/serving-adapters.json")
HOST = os.environ.get("SERVING_HOST") or "0.0.0.0"
PORT = to_int(os.environ.get("SERVING_PORT"), 8000, minimum=1)
DEVICE_MAP = os.environ.get("SERVING_DEVICE_MAP") or "auto"
TORCH_DTYPE = resolve_torch_dtype(os.environ.get("SERVING_TORCH_DTYPE") or "float16")
DEFAULT_MODEL_NAME = os.environ.get("SERVING_MODEL_NAME") or os.environ.get("CUSTOM_MODEL_NAME") or BASE_MODEL.split("/")[-1]
MAX_LOADED_ADAPTERS = to_int(os.environ.get("SERVING_MAX_LOADED_ADAPTERS"), 8, minimum=1)
ALLOW_BASE_FALLBACK = truthy(os.environ.get("SERVING_ALLOW_BASE_FALLBACK"), default=True)
DEFAULT_MAX_TOKENS = to_int(os.environ.get("SERVING_DEFAULT_MAX_TOKENS"), 600, minimum=32)
MAX_NEW_TOKENS_LIMIT = to_int(os.environ.get("SERVING_MAX_NEW_TOKENS_LIMIT"), 2048, minimum=64)
API_KEY = os.environ.get("SERVING_API_KEY") or ""
TRUST_REMOTE_CODE = truthy(os.environ.get("SERVING_TRUST_REMOTE_CODE"), default=False)

AGENT_NAMES = {
    "cco": "Muse",
    "cso": "Atlas",
    "cpo": "Forge",
    "cmo": "Mercury",
    "cxo": "Empathy",
    "cfo": "Prudence",
    "cdo": "Oracle",
    "cto": "Nexus",
}

OLLAMA_TO_GOD = {
    "ai-muse": "cco",
    "ai-atlas": "cso",
    "ai-forge": "cpo",
    "ai-mercury": "cmo",
    "ai-empathy": "cxo",
    "ai-prudence": "cfo",
    "ai-oracle": "cdo",
    "ai-nexus": "cto",
}

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


class ChatMessage(BaseModel):
    role: str
    content: str


class ModelVersionPayload(BaseModel):
    runId: Optional[str] = None
    modelName: Optional[str] = None
    rolloutState: Optional[str] = None
    artifactPath: Optional[str] = None
    ggufPath: Optional[str] = None


class OpenAIChatRequest(BaseModel):
    model: str = DEFAULT_MODEL_NAME
    messages: list[ChatMessage]
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    max_tokens: Optional[int] = Field(default=DEFAULT_MAX_TOKENS)
    stream: Optional[bool] = False
    agentId: Optional[str] = None
    phase: Optional[str] = None
    adapter: Optional[str] = None
    modelVersion: Optional[ModelVersionPayload] = None


class OllamaChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    stream: Optional[bool] = False
    options: Optional[dict[str, Any]] = None


class AdapterRecord(BaseModel):
    adapterId: str
    agentId: Optional[str] = None
    runId: Optional[str] = None
    localPath: str
    artifactUri: Optional[str] = None
    servingProvider: Optional[str] = None
    baseModel: Optional[str] = None
    modelName: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    aliases: list[str] = Field(default_factory=list)


def normalize_messages(messages: list[ChatMessage], agent_id: str = "") -> list[dict[str, str]]:
    normalized = [
        {"role": message.role, "content": str(message.content or "")}
        for message in messages
        if message.role in {"system", "user", "assistant"} and str(message.content or "").strip()
    ]
    if normalized and normalized[0]["role"] == "system":
        return normalized
    if agent_id and agent_id in GOD_SYSTEM_PROMPTS:
        return [{"role": "system", "content": GOD_SYSTEM_PROMPTS[agent_id]}] + normalized
    return normalized


def build_prompt_text(tokenizer, messages: list[dict[str, str]]) -> str:
    try:
        if getattr(tokenizer, "chat_template", None):
            return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    except ValueError:
        pass

    role_labels = {
        "system": "System",
        "user": "User",
        "assistant": "Assistant",
    }
    lines = []
    for message in messages:
        role = role_labels.get(message.get("role", ""), str(message.get("role", "")).title() or "User")
        content = str(message.get("content", "")).strip()
        if content:
            lines.append(f"{role}: {content}")
    lines.append("Assistant:")
    return "\n\n".join(lines)


def count_tokens(token_ids) -> int:
    if token_ids is None:
        return 0
    if hasattr(token_ids, "shape"):
        return int(token_ids.shape[-1])
    return len(token_ids)


class AdapterRegistry:
    def __init__(self, adapter_root: Path, manifest_path: Path):
        self.adapter_root = adapter_root
        self.manifest_path = manifest_path
        self.records: dict[str, AdapterRecord] = {}
        self.reload()

    def _register(self, record: AdapterRecord):
        self.records[record.adapterId] = record
        if record.agentId:
            self.records.setdefault(record.agentId, record)
        for alias in record.aliases:
            self.records.setdefault(alias, record)

    def reload(self):
        self.records = {}

        if self.manifest_path.exists():
            payload = json.loads(self.manifest_path.read_text(encoding="utf-8"))
            manifest_adapters = payload.get("adapters") or []
            if isinstance(manifest_adapters, dict):
                manifest_adapters = list(manifest_adapters.values())

            for raw in manifest_adapters:
                if not isinstance(raw, dict):
                    continue
                local_path = str(raw.get("localPath") or "").strip()
                adapter_id = str(raw.get("adapterId") or raw.get("agentId") or "").strip()
                if not adapter_id or not local_path:
                    continue
                self._register(
                    AdapterRecord(
                        adapterId=adapter_id,
                        agentId=str(raw.get("agentId") or "").strip() or None,
                        runId=str(raw.get("runId") or "").strip() or None,
                        localPath=local_path,
                        artifactUri=str(raw.get("artifactUri") or "").strip() or None,
                        servingProvider=str(raw.get("servingProvider") or "").strip() or None,
                        baseModel=str(raw.get("baseModel") or "").strip() or None,
                        modelName=str(raw.get("modelName") or "").strip() or None,
                        createdAt=str(raw.get("createdAt") or "").strip() or None,
                        updatedAt=str(raw.get("updatedAt") or "").strip() or None,
                        aliases=[str(alias).strip() for alias in raw.get("aliases") or [] if str(alias).strip()],
                    )
                )

        if self.adapter_root.exists():
            for path in sorted(candidate for candidate in self.adapter_root.iterdir() if candidate.is_dir()):
                if not (path / "adapter_config.json").exists() or not (path / "adapter_model.safetensors").exists():
                    continue
                if path.name in self.records:
                    continue
                self._register(
                    AdapterRecord(
                        adapterId=path.name,
                        agentId=path.name if path.name in AGENT_NAMES else None,
                        localPath=str(path),
                        baseModel=BASE_MODEL,
                        modelName=AGENT_NAMES.get(path.name),
                        aliases=[path.name],
                    )
                )

    def resolve(self, adapter_id: str = "", agent_id: str = "") -> Optional[AdapterRecord]:
        if adapter_id:
            exact = self.records.get(adapter_id)
            if exact:
                return exact
            fallback_path = self.adapter_root / adapter_id
            if fallback_path.exists():
                return AdapterRecord(adapterId=adapter_id, agentId=agent_id or None, localPath=str(fallback_path), aliases=[adapter_id])

        if agent_id:
            exact = self.records.get(agent_id)
            if exact:
                return exact
            fallback_path = self.adapter_root / agent_id
            if fallback_path.exists():
                return AdapterRecord(adapterId=agent_id, agentId=agent_id, localPath=str(fallback_path), aliases=[agent_id])

        return None

    def as_dict(self):
        unique = {}
        for record in self.records.values():
            unique[record.adapterId] = record
        return {record_id: record.model_dump() for record_id, record in sorted(unique.items())}


class HotSwapModelServer:
    def __init__(self):
        self.registry = AdapterRegistry(ADAPTER_ROOT, ADAPTER_MANIFEST)
        self._lock = threading.Lock()
        self._loaded_adapters: OrderedDict[str, AdapterRecord] = OrderedDict()
        self._active_adapter: Optional[str] = None
        self._tokenizer = None
        self._base_model = None
        self._peft_model = None

    def _load_base(self):
        if self._base_model is not None and self._tokenizer is not None:
            return
        print(f"[god-server] 베이스 모델 로딩: {BASE_MODEL}")
        self._tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=TRUST_REMOTE_CODE)
        self._base_model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL,
            torch_dtype=TORCH_DTYPE,
            device_map=DEVICE_MAP,
            trust_remote_code=TRUST_REMOTE_CODE,
        )
        self._base_model.eval()
        print("[god-server] 베이스 모델 로딩 완료")

    def warmup(self):
        with self._lock:
            self._load_base()
            self.registry.reload()

    def reload_registry(self):
        with self._lock:
            self.registry.reload()
        return self.registry.as_dict()

    def _evict_if_needed(self):
        if self._peft_model is None or not hasattr(self._peft_model, "delete_adapter"):
            return
        while len(self._loaded_adapters) > MAX_LOADED_ADAPTERS:
            adapter_id, _ = self._loaded_adapters.popitem(last=False)
            if adapter_id == self._active_adapter:
                self._loaded_adapters[adapter_id] = self.registry.resolve(adapter_id=adapter_id) or AdapterRecord(adapterId=adapter_id, localPath="")
                break
            self._peft_model.delete_adapter(adapter_id)
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    def _ensure_adapter_loaded(self, record: AdapterRecord):
        local_path = Path(record.localPath)
        if not local_path.exists():
            raise HTTPException(status_code=404, detail=f"Adapter path not found: {local_path}")

        if self._peft_model is None:
            self._peft_model = PeftModel.from_pretrained(
                self._base_model,
                str(local_path),
                adapter_name=record.adapterId,
                is_trainable=False,
            )
            self._peft_model.eval()
            self._loaded_adapters[record.adapterId] = record
            return

        if record.adapterId not in self._loaded_adapters:
            self._peft_model.load_adapter(str(local_path), adapter_name=record.adapterId, is_trainable=False)
            self._loaded_adapters[record.adapterId] = record
        else:
            self._loaded_adapters.move_to_end(record.adapterId)

        self._evict_if_needed()

    def _activate_adapter(self, record: Optional[AdapterRecord]):
        if record is None:
            self._active_adapter = None
            return None
        self._ensure_adapter_loaded(record)
        self._peft_model.set_adapter(record.adapterId)
        self._active_adapter = record.adapterId
        self._loaded_adapters.move_to_end(record.adapterId)
        return self._peft_model

    def _generate(self, request: OpenAIChatRequest) -> dict[str, Any]:
        self._load_base()

        agent_id = str(request.agentId or "").strip().lower()
        adapter_id = str(request.adapter or "").strip()
        messages = normalize_messages(request.messages, agent_id=agent_id)
        if not messages:
            raise HTTPException(status_code=400, detail="최소 한 개 이상의 메시지가 필요합니다.")

        record = self.registry.resolve(adapter_id=adapter_id, agent_id=agent_id)
        if record is None and not ALLOW_BASE_FALLBACK:
            raise HTTPException(status_code=404, detail=f"Adapter not found for agent={agent_id or '-'} adapter={adapter_id or '-'}")

        model = self._activate_adapter(record)
        runtime_model = model or self._peft_model or self._base_model
        tokenizer = self._tokenizer

        prompt_text = build_prompt_text(tokenizer, messages)
        inputs = tokenizer(prompt_text, return_tensors="pt")
        inputs = {key: value.to(runtime_model.device) for key, value in inputs.items()}

        max_tokens = min(to_int(request.max_tokens, DEFAULT_MAX_TOKENS, minimum=32), MAX_NEW_TOKENS_LIMIT)
        temperature = to_float(request.temperature, 0.7, minimum=0.0, maximum=1.5)
        top_p = to_float(request.top_p, 0.9, minimum=0.1, maximum=1.0)
        do_sample = temperature > 0

        adapter_context = self._peft_model.disable_adapter() if record is None and self._peft_model is not None else nullcontext()
        with adapter_context:
            with torch.no_grad():
                outputs = runtime_model.generate(
                    **inputs,
                    max_new_tokens=max_tokens,
                    temperature=max(temperature, 1e-5),
                    do_sample=do_sample,
                    top_p=top_p,
                    repetition_penalty=1.08,
                    pad_token_id=tokenizer.eos_token_id,
                )

        completion_tokens = outputs[0][inputs["input_ids"].shape[1]:]
        content = tokenizer.decode(completion_tokens, skip_special_tokens=True).strip()
        return {
            "content": content,
            "adapter": record,
            "promptTokens": count_tokens(inputs["input_ids"]),
            "completionTokens": count_tokens(completion_tokens),
        }

    def create_completion(self, request: OpenAIChatRequest) -> dict[str, Any]:
        with self._lock:
            generated = self._generate(request)

        adapter_record = generated["adapter"]
        model_version = request.modelVersion.model_dump() if request.modelVersion else None
        return {
            "id": f"chatcmpl-{uuid.uuid4().hex[:18]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": request.model or DEFAULT_MODEL_NAME,
            "provider": "custom",
            "adapter": adapter_record.adapterId if adapter_record else None,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": generated["content"]},
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": generated["promptTokens"],
                "completion_tokens": generated["completionTokens"],
                "total_tokens": generated["promptTokens"] + generated["completionTokens"],
            },
            "modelVersion": model_version,
            "adapterInfo": adapter_record.model_dump() if adapter_record else None,
        }

    def status(self):
        return {
            "status": "ok",
            "baseModel": BASE_MODEL,
            "defaultModelName": DEFAULT_MODEL_NAME,
            "adapterManifest": str(ADAPTER_MANIFEST),
            "adapterRoot": str(ADAPTER_ROOT),
            "loadedAdapters": list(self._loaded_adapters.keys()),
            "activeAdapter": self._active_adapter,
            "knownAdapters": list(self.registry.as_dict().keys()),
        }


server = HotSwapModelServer()
app = FastAPI(title="AI Gods Direct Serving", version="0.2.0")


def require_api_key(authorization: Optional[str]):
    if not API_KEY:
        return
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if authorization.strip() != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Invalid bearer token")


@app.on_event("startup")
async def startup_event():
    server.warmup()


@app.get("/")
async def root():
    return server.status()


@app.get("/health")
async def health():
    return server.status()


@app.get("/v1/models")
async def list_models(authorization: Optional[str] = Header(default=None)):
    require_api_key(authorization)
    adapter_items = []
    for adapter_id, adapter in server.registry.as_dict().items():
        adapter_items.append(
            {
                "id": adapter_id,
                "object": "model",
                "owned_by": adapter.get("servingProvider") or "local",
                "metadata": adapter,
            }
        )
    return {
        "object": "list",
        "data": [
            {
                "id": DEFAULT_MODEL_NAME,
                "object": "model",
                "owned_by": "ai-gods-direct-serving",
                "metadata": {"baseModel": BASE_MODEL},
            },
            *adapter_items,
        ],
    }


@app.get("/admin/adapters")
async def admin_list_adapters(authorization: Optional[str] = Header(default=None)):
    require_api_key(authorization)
    return {"baseModel": BASE_MODEL, "adapters": server.registry.as_dict()}


@app.post("/admin/adapters/reload")
async def admin_reload_adapters(authorization: Optional[str] = Header(default=None)):
    require_api_key(authorization)
    return {"ok": True, "adapters": server.reload_registry()}


@app.post("/v1/chat/completions")
async def openai_chat(req: OpenAIChatRequest, authorization: Optional[str] = Header(default=None)):
    require_api_key(authorization)
    if req.stream:
        raise HTTPException(status_code=400, detail="stream=true 는 아직 지원하지 않습니다.")
    return server.create_completion(req)


@app.post("/api/chat")
async def ollama_chat(req: OllamaChatRequest, authorization: Optional[str] = Header(default=None)):
    require_api_key(authorization)
    god_id = OLLAMA_TO_GOD.get(req.model, req.model)
    options = req.options or {}
    completion = server.create_completion(
        OpenAIChatRequest(
            model=req.model,
            messages=req.messages,
            temperature=options.get("temperature", 0.85),
            top_p=options.get("top_p", 0.92),
            max_tokens=options.get("num_predict", DEFAULT_MAX_TOKENS),
            stream=False,
            agentId=god_id,
            adapter=god_id,
        )
    )
    return {
        "model": req.model,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "message": completion["choices"][0]["message"],
        "done": True,
        "provider": "custom",
        "adapter": completion.get("adapter"),
        "usage": completion.get("usage"),
    }


@app.get("/api/tags")
async def ollama_tags(authorization: Optional[str] = Header(default=None)):
    require_api_key(authorization)
    return {
        "models": [
            {"name": model_name, "model": model_name}
            for model_name in sorted(OLLAMA_TO_GOD.keys())
        ]
    }


if __name__ == "__main__":
    server.warmup()
    print(f"[god-server] http://{HOST}:{PORT} 에서 실행 중")
    uvicorn.run(app, host=HOST, port=PORT)
