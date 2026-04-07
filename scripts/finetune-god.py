"""
Unsloth + QLoRA 신별 파인튜닝 스크립트 (RTX 3060 12GB 최적화)

사용법:
  python scripts/finetune-god.py --god cco
  python scripts/finetune-god.py --god all   (전체 8명)

출력: models/lora/{god_id}/  (LoRA 어댑터)
      models/gguf/{god_id}.gguf  (llama.cpp용)
"""

import argparse
import json
from pathlib import Path

GOD_IDS = ["cco", "cso", "cpo", "cmo", "cxo", "cfo", "cdo", "cto"]
GOD_NAMES = {
    "cco": "Muse", "cso": "Atlas", "cpo": "Forge", "cmo": "Mercury",
    "cxo": "Empathy", "cfo": "Prudence", "cdo": "Oracle", "cto": "Nexus",
}

BASE_MODEL = "unsloth/Llama-3.2-3B-Instruct-bnb-4bit"  # 3060 최적 (약 5GB VRAM)

def load_dataset(god_id: str):
    from datasets import Dataset

    data_path = Path(f"training-data/{god_id}.jsonl")
    if not data_path.exists():
        raise FileNotFoundError(f"❌ {data_path} 없음. 먼저 export-training-data.py 실행하세요.")

    records = []
    with open(data_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))

    print(f"  📊 {god_id} 학습 데이터: {len(records)}개")
    return Dataset.from_list(records)

def format_conversations(example):
    """ChatML 형식 → 단일 텍스트로"""
    convs = example["conversations"]
    text = ""
    for turn in convs:
        role = turn["role"]
        content = turn["content"]
        if role == "system":
            text += f"<|system|>\n{content}\n"
        elif role == "user":
            text += f"<|user|>\n{content}\n"
        elif role == "assistant":
            text += f"<|assistant|>\n{content}\n"
    text += "<|end|>"
    return {"text": text}

def finetune(god_id: str):
    from unsloth import FastLanguageModel
    from trl import SFTTrainer
    from transformers import TrainingArguments

    print(f"\n🚀 [{GOD_NAMES[god_id]}] 파인튜닝 시작...")

    # 모델 로드
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=2048,
        dtype=None,
        load_in_4bit=True,
    )

    # LoRA 설정
    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
    )

    # 데이터셋
    dataset = load_dataset(god_id)
    dataset = dataset.map(format_conversations, remove_columns=dataset.column_names)

    # 출력 폴더
    lora_out = Path(f"models/lora/{god_id}")
    lora_out.mkdir(parents=True, exist_ok=True)

    # 학습
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=2048,
        dataset_num_proc=2,
        args=TrainingArguments(
            per_device_train_batch_size=2,
            gradient_accumulation_steps=4,
            warmup_steps=5,
            num_train_epochs=3,          # 데이터 적을수록 epoch 늘림
            learning_rate=2e-4,
            fp16=True,
            logging_steps=10,
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="linear",
            output_dir=str(lora_out),
            save_strategy="epoch",
        ),
    )

    trainer.train()
    model.save_pretrained(str(lora_out))
    tokenizer.save_pretrained(str(lora_out))
    print(f"  ✅ LoRA 저장: {lora_out}")

    # GGUF 변환 (llama.cpp용)
    gguf_out = Path(f"models/gguf")
    gguf_out.mkdir(parents=True, exist_ok=True)
    gguf_path = gguf_out / f"{god_id}.gguf"

    print(f"  🔄 GGUF 변환 중...")
    model.save_pretrained_gguf(
        str(gguf_out / god_id),
        tokenizer,
        quantization_method="q4_k_m",   # 품질/속도 균형
    )
    print(f"  ✅ GGUF 저장: {gguf_path}")

    # 메모리 해제
    del model, tokenizer
    import gc, torch
    gc.collect()
    torch.cuda.empty_cache()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--god", required=True, help="god id (cco/cso/.../cto) 또는 all")
    args = parser.parse_args()

    targets = GOD_IDS if args.god == "all" else [args.god]

    for god_id in targets:
        if god_id not in GOD_IDS:
            print(f"❌ 알 수 없는 god_id: {god_id}")
            continue
        finetune(god_id)

    print("\n🎉 파인튜닝 완료!")
    print("다음 단계: python scripts/serve-gods.py 로 llama.cpp 서버 실행")

if __name__ == "__main__":
    main()
