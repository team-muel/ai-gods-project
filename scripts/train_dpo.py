"""
DPO(Direct Preference Optimization) 학습기

generate_dpo_data.py로 생성한 dpo-data/{god_id}.jsonl을 읽어
각 신의 LoRA 모델을 DPO로 강화학습합니다.

사용법:
  python scripts/train_dpo.py --god cco
  python scripts/train_dpo.py --god all

의존성:
  pip install trl>=0.8.0 peft transformers datasets bitsandbytes

출력: models/dpo/{god_id}/  (DPO 튜닝된 LoRA 어댑터)
"""

import argparse
import json
import shutil
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

GOD_IDS = ["cco", "cso", "cpo", "cmo", "cxo", "cfo", "cdo", "cto"]
GOD_NAMES = {
    "cco": "Muse",   "cso": "Atlas",   "cpo": "Forge",   "cmo": "Mercury",
    "cxo": "Empathy","cfo": "Prudence","cdo": "Oracle",  "cto": "Nexus",
}

BASE_MODEL  = "Qwen/Qwen2.5-3B-Instruct"
SFT_LORA_DIR = "models/lora"   # SFT 결과 (베이스로 사용)
DPO_OUT_DIR  = "models/dpo"


def load_dpo_jsonl(path: Path) -> list:
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def train_dpo(god_id: str):
    import torch
    from datasets import Dataset
    from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
    from peft import LoraConfig, get_peft_model, PeftModel, TaskType
    from trl import DPOTrainer, DPOConfig

    data_path = Path(f"dpo-data/{god_id}.jsonl")
    pairs = load_dpo_jsonl(data_path)

    if not pairs:
        print(f"[{god_id}] ⚠️  DPO 데이터 없음 — 스킵 (먼저 generate_dpo_data.py 실행)")
        return False

    print(f"\n[{GOD_NAMES[god_id]}({god_id})] DPO 학습 시작 ({len(pairs)}개 선호 쌍)...")

    # ── 데이터셋 변환 ──────────────────────────────────────────
    # trl DPOTrainer 형식: prompt / chosen / rejected (문자열)
    def fmt(messages: list) -> str:
        parts = []
        for m in messages:
            role = m["role"]
            if role == "system":
                parts.append(f"<|im_start|>system\n{m['content']}<|im_end|>")
            elif role == "user":
                parts.append(f"<|im_start|>user\n{m['content']}<|im_end|>")
            elif role == "assistant":
                parts.append(f"<|im_start|>assistant\n{m['content']}<|im_end|>")
        return "\n".join(parts)

    records = []
    for p in pairs:
        records.append({
            "prompt":   fmt(p["prompt"]),
            "chosen":   fmt(p["chosen"]),
            "rejected": fmt(p["rejected"]),
        })

    dataset = Dataset.from_list(records)

    # ── 모델 로드 ──────────────────────────────────────────────
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )

    sft_lora = Path(SFT_LORA_DIR) / god_id
    print(f"  모델 로딩 (SFT LoRA: {sft_lora if sft_lora.exists() else '없음 → 베이스 모델 사용'})...")

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    tokenizer.pad_token = tokenizer.eos_token

    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        quantization_config=bnb_config,
        device_map="auto",
    )

    # SFT LoRA가 있으면 그 위에 DPO 적용 (없으면 베이스 모델에서 바로)
    if sft_lora.exists():
        model = PeftModel.from_pretrained(base_model, str(sft_lora))
        print(f"  SFT LoRA 로드됨: {sft_lora}")
    else:
        lora_config = LoraConfig(
            r=16, lora_alpha=32,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                            "gate_proj", "up_proj", "down_proj"],
            lora_dropout=0.05, bias="none",
            task_type=TaskType.CAUSAL_LM,
        )
        model = get_peft_model(base_model, lora_config)

    # ── DPO 학습 ──────────────────────────────────────────────
    out_dir = Path(DPO_OUT_DIR) / god_id
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    dpo_config = DPOConfig(
        output_dir=str(out_dir),
        num_train_epochs=3,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        learning_rate=5e-5,
        bf16=True,
        logging_steps=5,
        save_strategy="no",
        optim="paged_adamw_8bit",
        beta=0.1,             # KL 페널티 강도 (낮을수록 보상 중심)
        max_length=1024,
        max_prompt_length=512,
        report_to="none",
    )

    trainer = DPOTrainer(
        model=model,
        ref_model=None,       # peft 모델이면 ref_model=None (내부 frozen copy 사용)
        args=dpo_config,
        train_dataset=dataset,
        processing_class=tokenizer,
    )

    print(f"  DPO 학습 시작...")
    trainer.train()

    model.save_pretrained(str(out_dir))
    tokenizer.save_pretrained(str(out_dir))
    print(f"  [저장] DPO LoRA → {out_dir}")

    del model, base_model, tokenizer, trainer
    import gc
    gc.collect()
    torch.cuda.empty_cache()
    print(f"  [{GOD_NAMES[god_id]}] DPO 완료!")
    return True


def main():
    parser = argparse.ArgumentParser(description="AI Gods DPO 강화학습")
    parser.add_argument("--god", required=True, help="god id 또는 all")
    args = parser.parse_args()

    targets = GOD_IDS if args.god == "all" else [args.god]
    results = {}

    for god_id in targets:
        if god_id not in GOD_IDS:
            print(f"알 수 없는 god_id: {god_id}")
            continue
        results[god_id] = train_dpo(god_id)

    print("\n📊 DPO 학습 결과:")
    for gid, ok in results.items():
        status = "✅ 완료" if ok else "⏭️  스킵 (데이터 없음)"
        print(f"  {status} — {gid}({GOD_NAMES.get(gid, '')})")

    print("\n다음 단계: python scripts/merge-and-register.py --god all")
    print("  → DPO 모델도 merge-and-register.py의 SFT_LORA_DIR를 dpo/ 로 바꿔 실행하세요.")


if __name__ == "__main__":
    main()
