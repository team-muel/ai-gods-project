"""
AI Gods 로컬 추론 서버 (Ollama 호환 API)
- 베이스 모델 1개를 메모리에 올려두고
- 요청마다 해당 신의 LoRA 어댑터를 적용해 응답
- 포트: 11434 (Ollama와 동일 → aiService.js 수정 불필요)

사용법:
  python scripts/god-server.py

사전 준비:
  - models/lora/{god_id}/ 폴더에 LoRA 어댑터 존재
"""

import gc
import json
import time
import torch
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import uvicorn
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer
from peft import PeftModel
import threading

BASE_MODEL = "Qwen/Qwen2.5-3B-Instruct"
LORA_DIR   = Path("models/lora")
PORT       = 11434

GOD_IDS = ["cco", "cso", "cpo", "cmo", "cxo", "cfo", "cdo", "cto"]
OLLAMA_TO_GOD = {
    "ai-muse":    "cco",
    "ai-atlas":   "cso",
    "ai-forge":   "cpo",
    "ai-mercury": "cmo",
    "ai-empathy": "cxo",
    "ai-prudence":"cfo",
    "ai-oracle":  "cdo",
    "ai-nexus":   "cto",
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

app = FastAPI()

# ── 모델 상태 ──────────────────────────────────────────────────
_base_model = None
_tokenizer  = None
_current_god = None
_model_with_lora = None

def load_base():
    global _base_model, _tokenizer
    if _base_model is None:
        print(f"[서버] 베이스 모델 로딩: {BASE_MODEL}")
        _tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
        _base_model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL,
            dtype=torch.float16,
            device_map="auto",
        )
        _base_model.eval()
        print("[서버] 베이스 모델 로딩 완료")

def get_model(god_id: str):
    global _current_god, _model_with_lora, _base_model

    if _current_god == god_id and _model_with_lora is not None:
        return _model_with_lora, _tokenizer

    # LoRA 어댑터 전환
    lora_path = LORA_DIR / god_id
    if not lora_path.exists():
        print(f"[경고] {god_id} LoRA 없음, 베이스 모델 사용")
        return _base_model, _tokenizer

    print(f"[서버] LoRA 전환: {_current_god} → {god_id}")
    _model_with_lora = PeftModel.from_pretrained(_base_model, str(lora_path))
    _model_with_lora.eval()
    _current_god = god_id
    return _model_with_lora, _tokenizer

def generate(god_id: str, messages: list, max_tokens: int = 600, temperature: float = 0.85) -> str:
    model, tokenizer = get_model(god_id)

    # ChatML 형식으로 변환
    system_prompt = GOD_SYSTEM_PROMPTS.get(god_id, "")
    full_messages = [{"role": "system", "content": system_prompt}] + messages

    text = tokenizer.apply_chat_template(
        full_messages,
        tokenize=False,
        add_generation_prompt=True,
    )
    inputs = tokenizer(text, return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temperature,
            do_sample=True,
            top_p=0.92,
            repetition_penalty=1.1,
            pad_token_id=tokenizer.eos_token_id,
        )

    new_tokens = outputs[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True)

# ── Ollama 호환 API ────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    stream: Optional[bool] = False
    options: Optional[dict] = {}

@app.post("/api/chat")
async def chat(req: ChatRequest):
    god_id = OLLAMA_TO_GOD.get(req.model)
    if not god_id:
        return JSONResponse({"error": f"Unknown model: {req.model}"}, status_code=400)

    messages = [{"role": m.role, "content": m.content} for m in req.messages
                if m.role != "system"]

    max_tokens = req.options.get("num_predict", 600)
    temperature = req.options.get("temperature", 0.85)

    response_text = generate(god_id, messages, max_tokens, temperature)

    return {
        "model": req.model,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "message": {"role": "assistant", "content": response_text},
        "done": True,
    }

@app.get("/api/tags")
async def tags():
    models = [{"name": name, "model": name} for name in OLLAMA_TO_GOD.keys()]
    return {"models": models}

@app.get("/")
async def health():
    return {"status": "ok", "loaded": _current_god}

# ── 시작 ──────────────────────────────────────────────────────
if __name__ == "__main__":
    load_base()
    print(f"[서버] http://localhost:{PORT} 에서 실행 중")
    print("[서버] 종료: Ctrl+C")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
