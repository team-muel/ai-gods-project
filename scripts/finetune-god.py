"""
PEFT + QLoRA 신별 파인튜닝 스크립트 (RTX 3060 12GB, Windows 호환)

사용법:
  python scripts/finetune-god.py --god cco
  python scripts/finetune-god.py --god all

출력: models/lora/{god_id}/  (LoRA 어댑터 + merged 모델)
"""

import argparse
import json
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

GOD_IDS = ["cco", "cso", "cpo", "cmo", "cxo", "cfo", "cdo", "cto"]
GOD_NAMES = {
    "cco": "Muse", "cso": "Atlas", "cpo": "Forge", "cmo": "Mercury",
    "cxo": "Empathy", "cfo": "Prudence", "cdo": "Oracle", "cto": "Nexus",
}

BASE_MODEL = "Qwen/Qwen2.5-3B-Instruct"  # 무료, 한국어 강함, 3060 최적

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

def load_data(god_id):
    data_path = Path(f"training-data/{god_id}.jsonl")
    if not data_path.exists():
        raise FileNotFoundError(f"{data_path} 없음. export-training-data.py 먼저 실행하세요.")

    texts = []
    with open(data_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            convs = entry["conversations"]
            system = next((c["content"] for c in convs if c["role"] == "system"), "")
            user   = next((c["content"] for c in convs if c["role"] == "user"), "")
            asst   = next((c["content"] for c in convs if c["role"] == "assistant"), "")
            # ChatML 형식
            text = (
                f"<|im_start|>system\n{system}<|im_end|>\n"
                f"<|im_start|>user\n{user}<|im_end|>\n"
                f"<|im_start|>assistant\n{asst}<|im_end|>"
            )
            texts.append({"text": text})

    print(f"  [데이터] {god_id}: {len(texts)}개")
    return texts

def finetune(god_id):
    import torch
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        BitsAndBytesConfig,
        TrainingArguments,
    )
    from peft import LoraConfig, get_peft_model, TaskType
    from trl import SFTTrainer, SFTConfig
    from datasets import Dataset

    print(f"\n[{GOD_NAMES[god_id]}] 파인튜닝 시작...")

    # 4비트 양자화 설정
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )

    print("  모델 로딩...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        quantization_config=bnb_config,
        device_map="auto",
    )

    # LoRA 설정
    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # 데이터셋
    raw = load_data(god_id)
    dataset = Dataset.from_list(raw)

    # 출력 경로
    lora_out = Path(f"models/lora/{god_id}")
    lora_out.mkdir(parents=True, exist_ok=True)

    # 학습
    from trl import SFTConfig
    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=dataset,
        args=SFTConfig(
            output_dir=str(lora_out),
            num_train_epochs=10,
            per_device_train_batch_size=1,
            gradient_accumulation_steps=4,
            learning_rate=2e-4,
            bf16=True,
            logging_steps=5,
            save_strategy="epoch",
            optim="paged_adamw_8bit",
            warmup_steps=5,
            lr_scheduler_type="cosine",
            report_to="none",
            dataset_text_field="text",
        ),
    )

    trainer.train()

    # LoRA 저장
    model.save_pretrained(str(lora_out))
    tokenizer.save_pretrained(str(lora_out))
    print(f"  [저장] LoRA -> {lora_out}")

    # 메모리 해제
    del model, tokenizer, trainer
    import gc
    gc.collect()
    torch.cuda.empty_cache()
    print(f"  [{GOD_NAMES[god_id]}] 완료!")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--god", required=True, help="god id (cco~cto) 또는 all")
    args = parser.parse_args()

    targets = GOD_IDS if args.god == "all" else [args.god]
    for god_id in targets:
        if god_id not in GOD_IDS:
            print(f"알 수 없는 god_id: {god_id}")
            continue
        finetune(god_id)

    print("\n[완료] 모든 파인튜닝 끝!")
    print("다음: Ollama로 로드하거나 llama.cpp로 서빙하세요.")

if __name__ == "__main__":
    main()
