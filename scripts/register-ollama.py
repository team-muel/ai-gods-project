"""
병합된 HF 모델 → Ollama 등록 스크립트

사용법:
  python scripts/register-ollama.py --god cco
  python scripts/register-ollama.py --god all
"""

import argparse
import subprocess
from pathlib import Path

GOD_IDS = ["cco", "cso", "cpo", "cmo", "cxo", "cfo", "cdo", "cto"]
GOD_NAMES = {
    "cco": "Muse",   "cso": "Atlas",   "cpo": "Forge",   "cmo": "Mercury",
    "cxo": "Empathy","cfo": "Prudence","cdo": "Oracle",  "cto": "Nexus",
}
OLLAMA_NAMES = {
    "cco": "ai-muse",   "cso": "ai-atlas",   "cpo": "ai-forge",   "cmo": "ai-mercury",
    "cxo": "ai-empathy","cfo": "ai-prudence","cdo": "ai-oracle",  "cto": "ai-nexus",
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

def register(god_id):
    merged_path = Path(f"models/merged/{god_id}").resolve()
    if not merged_path.exists():
        print(f"  [오류] {merged_path} 없음. merge-and-register.py 먼저 실행하세요.")
        return False

    ollama_name = OLLAMA_NAMES[god_id]
    system_prompt = GOD_SYSTEM_PROMPTS[god_id]

    modelfile_path = Path(f"models/lora/{god_id}/Modelfile")
    modelfile_path.parent.mkdir(parents=True, exist_ok=True)
    modelfile_path.write_text(
        f'FROM {merged_path}\n\n'
        f'SYSTEM """{system_prompt}"""\n\n'
        f'PARAMETER temperature 0.85\n'
        f'PARAMETER top_p 0.92\n'
        f'PARAMETER num_predict 600\n'
        f'PARAMETER repeat_penalty 1.1\n',
        encoding="utf-8"
    )

    print(f"  [{GOD_NAMES[god_id]}] Ollama 등록: {ollama_name}...")
    result = subprocess.run(
        ["ollama", "create", ollama_name, "-f", str(modelfile_path)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  [오류]: {result.stderr[-400:]}")
        return False

    print(f"  [완료] {ollama_name} 등록됨")
    return True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--god", required=True)
    args = parser.parse_args()

    targets = GOD_IDS if args.god == "all" else [args.god]
    success = []
    for god_id in targets:
        print(f"\n[{GOD_NAMES[god_id]}({god_id})]")
        if register(god_id):
            success.append(god_id)

    print(f"\n[완료] {len(success)}/{len(targets)} 등록됨")
    print("\n테스트:")
    for g in success:
        print(f"  ollama run {OLLAMA_NAMES[g]}")

if __name__ == "__main__":
    main()
