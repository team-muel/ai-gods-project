"""
AI Gods LoRA 파인튜닝 스크립트 (Unsloth + QLoRA)
실행: finetune_env/Scripts/python scripts/finetune.py [--god cso] [--all]
출력: finetuned_models/{godId}/
"""

import argparse
import json
import os
import sys
from pathlib import Path

# ── 설정 ──────────────────────────────────────────────────────
BASE_MODEL  = "unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit"
MAX_SEQ_LEN = 2048
LORA_RANK   = 16       # 낮을수록 빠름/가벼움, 높을수록 품질 ↑
EPOCHS      = 3
BATCH_SIZE  = 2
GRAD_ACCUM  = 4        # effective batch = 2×4 = 8

GOD_IDS = ['cco', 'cso', 'cpo', 'cmo', 'cxo', 'cfo', 'cdo', 'cto']

ROOT       = Path(__file__).parent.parent
DATA_DIR   = ROOT / "training_data"
OUTPUT_DIR = ROOT / "finetuned_models"
OUTPUT_DIR.mkdir(exist_ok=True)

# ── 데이터 로드 ───────────────────────────────────────────────
def load_jsonl(path):
    if not path.exists():
        return []
    with open(path, encoding='utf-8') as f:
        return [json.loads(l) for l in f if l.strip()]

# ── 단일 신 파인튜닝 ─────────────────────────────────────────
def finetune_god(god_id):
    data_path = DATA_DIR / f"{god_id}.jsonl"
    samples   = load_jsonl(data_path)

    if not samples:
        print(f"[{god_id}] ⚠️  학습 데이터 없음 — 스킵")
        return False

    print(f"\n[{god_id}] 🔥 파인튜닝 시작 ({len(samples)}개 샘플)")

    # Unsloth import (설치 확인)
    try:
        from unsloth import FastLanguageModel
        from unsloth.chat_templates import get_chat_template
        from trl import SFTTrainer
        from transformers import TrainingArguments
        from datasets import Dataset
    except ImportError as e:
        print(f"패키지 오류: {e}")
        print("finetune_env/Scripts/pip install unsloth trl datasets 실행 후 재시도하세요.")
        sys.exit(1)

    # 모델 로드 (4bit QLoRA)
    print(f"[{god_id}] 📥 모델 로드 중...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name     = BASE_MODEL,
        max_seq_length = MAX_SEQ_LEN,
        load_in_4bit   = True,
        dtype          = None,
    )

    # LoRA 어댑터 추가
    model = FastLanguageModel.get_peft_model(
        model,
        r              = LORA_RANK,
        target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                          "gate_proj", "up_proj", "down_proj"],
        lora_alpha     = LORA_RANK * 2,
        lora_dropout   = 0,
        bias           = "none",
        use_gradient_checkpointing = "unsloth",
    )

    tokenizer = get_chat_template(tokenizer, chat_template="llama-3.1")

    # 데이터셋 포맷 변환
    def format_sample(sample):
        text = tokenizer.apply_chat_template(
            sample["messages"], tokenize=False, add_generation_prompt=False
        )
        return {"text": text}

    dataset = Dataset.from_list([format_sample(s) for s in samples])

    god_output = OUTPUT_DIR / god_id
    god_output.mkdir(exist_ok=True)

    # 학습
    trainer = SFTTrainer(
        model     = model,
        tokenizer = tokenizer,
        train_dataset = dataset,
        dataset_text_field = "text",
        max_seq_length = MAX_SEQ_LEN,
        args = TrainingArguments(
            output_dir          = str(god_output / "checkpoints"),
            num_train_epochs    = EPOCHS,
            per_device_train_batch_size = BATCH_SIZE,
            gradient_accumulation_steps = GRAD_ACCUM,
            warmup_steps        = max(1, len(samples) // 10),
            learning_rate       = 2e-4,
            fp16                = True,
            logging_steps       = 1,
            optim               = "adamw_8bit",
            save_strategy       = "epoch",
            report_to           = "none",
        ),
    )

    print(f"[{god_id}] 🏋️  학습 시작...")
    trainer.train()

    # LoRA 어댑터 저장
    adapter_path = god_output / "lora_adapter"
    model.save_pretrained(str(adapter_path))
    tokenizer.save_pretrained(str(adapter_path))
    print(f"[{god_id}] 💾 어댑터 저장됨: {adapter_path}")

    # GGUF로 변환 (Ollama용)
    gguf_path = god_output / "model.gguf"
    print(f"[{god_id}] 🔄 GGUF 변환 중...")
    model.save_pretrained_gguf(
        str(god_output / "gguf"),
        tokenizer,
        quantization_method = "q4_k_m",   # 4bit 양자화 (12GB VRAM 최적)
    )
    print(f"[{god_id}] ✅ GGUF 저장됨: {god_output}/gguf/")

    # 메모리 해제
    del model, tokenizer
    import gc, torch
    gc.collect()
    torch.cuda.empty_cache()

    return True

# ── 메인 ─────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Gods 파인튜닝")
    parser.add_argument("--god", type=str, help=f"특정 신만: {GOD_IDS}")
    parser.add_argument("--all", action="store_true", help="8명 전체 파인튜닝")
    args = parser.parse_args()

    if args.all:
        targets = GOD_IDS
    elif args.god:
        if args.god not in GOD_IDS:
            print(f"유효하지 않은 god ID: {args.god}. 선택지: {GOD_IDS}")
            sys.exit(1)
        targets = [args.god]
    else:
        parser.print_help()
        sys.exit(0)

    print(f"🚀 AI Gods 파인튜닝 시작: {targets}")
    results = {}
    for gid in targets:
        results[gid] = finetune_god(gid)

    print("\n📊 결과:")
    for gid, ok in results.items():
        print(f"  {'✅' if ok else '⏭️ '} {gid}: {'완료' if ok else '데이터 없음'}")

    print("\n🎉 파인튜닝 완료! 다음 단계: npm run update-models")
