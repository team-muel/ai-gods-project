"""
DPO(Direct Preference Optimization) 학습 데이터 생성기

토론 결과에서 선호 쌍(chosen / rejected)을 자동 생성합니다.

보상 신호 설계:
  - chosen  : 합의에 도달한 토론의 마지막 라운드 발언 (긍정 반응 포함)
  - rejected: 합의 미달 토론 또는 부정 반응(반박)이 많은 발언

사용법:
  python scripts/generate_dpo_data.py
  python scripts/generate_dpo_data.py --god cco --out dpo-data/cco.jsonl

출력: dpo-data/{god_id}.jsonl
"""

import argparse
import json
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

try:
    from supabase import create_client
    SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY")
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise SystemExit("❌ .env에서 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 필요")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
except ImportError:
    raise SystemExit("❌ supabase-py 필요: pip install supabase")

GOD_IDS = ["cco", "cso", "cpo", "cmo", "cxo", "cfo", "cdo", "cto"]

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

# 긍정/부정 키워드 기반 발언 품질 점수 계산
POS_WORDS = ["동의", "좋은 지적", "맞습니다", "공감", "훌륭", "정확", "탁월", "핵심"]
NEG_WORDS = ["반박", "아니다", "틀리", "동의하지", "그렇지 않", "문제가", "우려"]

def score_message(content: str) -> float:
    pos = sum(1 for w in POS_WORDS if w in content)
    neg = sum(1 for w in NEG_WORDS if w in content)
    length_bonus = min(1.0, len(content) / 400)  # 적절한 길이 보너스
    return pos * 0.3 - neg * 0.2 + length_bonus

def fetch_debates_with_consensus() -> list:
    """합의 도달 토론 조회"""
    result = supabase.table("debates") \
        .select("id, topic, consensus, total_rounds") \
        .not_.is_("consensus", "null") \
        .execute()
    return result.data or []

def fetch_debates_without_consensus() -> list:
    """합의 미달 토론 조회 (consensus가 없거나 짧음)"""
    result = supabase.table("debates") \
        .select("id, topic, consensus, total_rounds") \
        .execute()
    all_debates = result.data or []
    return [d for d in all_debates if not d.get("consensus") or len(d["consensus"]) < 50]

def fetch_messages_for_debate(debate_id: str) -> list:
    result = supabase.table("debate_messages") \
        .select("god_id, god_name, round, content") \
        .eq("debate_id", debate_id) \
        .order("round") \
        .execute()
    return result.data or []

def build_dpo_pairs(god_id: str) -> list:
    system_prompt = GOD_SYSTEM_PROMPTS.get(god_id)
    if not system_prompt:
        return []

    pairs = []

    # ── chosen: 합의 도달 토론의 마지막 라운드 발언 ──────────
    good_debates = fetch_debates_with_consensus()
    for debate in good_debates:
        messages = fetch_messages_for_debate(debate["id"])
        god_msgs = [m for m in messages if m["god_id"] == god_id]
        if not god_msgs:
            continue

        last_round = max(m["round"] for m in god_msgs)
        last_msgs  = [m for m in god_msgs if m["round"] == last_round]
        if not last_msgs:
            continue

        chosen_msg = max(last_msgs, key=lambda m: score_message(m["content"]))

        # rejected 후보: 같은 토론의 Round 1 발언 (초기 의견 < 최종 발언)
        first_msgs = [m for m in god_msgs if m["round"] == 1]
        if not first_msgs:
            continue
        rejected_msg = first_msgs[0]

        # chosen과 rejected가 같으면 스킵
        if chosen_msg["content"].strip() == rejected_msg["content"].strip():
            continue

        prompt = f"주제: {debate['topic']}\n\n당신의 전문 분야 관점에서 의견을 제시하세요."
        pairs.append({
            "prompt": [
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": prompt},
            ],
            "chosen":   [{"role": "assistant", "content": chosen_msg["content"]}],
            "rejected": [{"role": "assistant", "content": rejected_msg["content"]}],
            "meta": {
                "debate_id":   debate["id"],
                "topic":       debate["topic"],
                "total_rounds": debate["total_rounds"],
                "reward_type": "consensus_reached",
            }
        })

    # ── rejected 보강: 합의 미달 토론 발언을 rejected로 추가 ──
    bad_debates = fetch_debates_without_consensus()
    bad_debate_ids = {d["id"] for d in bad_debates}

    # 합의 도달한 토론 중 점수 높은 발언을 chosen으로 재활용
    for debate in good_debates[:len(bad_debates)]:
        messages    = fetch_messages_for_debate(debate["id"])
        god_msgs    = [m for m in messages if m["god_id"] == god_id]
        if not god_msgs:
            continue
        chosen_msg = max(god_msgs, key=lambda m: score_message(m["content"]))

        # bad debate에서 같은 신의 발언 가져오기
        for bad_debate in bad_debates[:5]:
            bad_msgs = fetch_messages_for_debate(bad_debate["id"])
            bad_god_msgs = [m for m in bad_msgs if m["god_id"] == god_id]
            if not bad_god_msgs:
                continue
            rejected_msg = min(bad_god_msgs, key=lambda m: score_message(m["content"]))

            if chosen_msg["content"].strip() == rejected_msg["content"].strip():
                continue

            prompt = f"주제: {debate['topic']}\n\n당신의 전문 분야 관점에서 의견을 제시하세요."
            pairs.append({
                "prompt": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": prompt},
                ],
                "chosen":   [{"role": "assistant", "content": chosen_msg["content"]}],
                "rejected": [{"role": "assistant", "content": rejected_msg["content"]}],
                "meta": {
                    "chosen_debate_id":   debate["id"],
                    "rejected_debate_id": bad_debate["id"],
                    "reward_type": "no_consensus_penalty",
                }
            })

    return pairs

def main():
    parser = argparse.ArgumentParser(description="DPO 선호 쌍 생성")
    parser.add_argument("--god", default="all", help="god id 또는 all")
    parser.add_argument("--out", default=None, help="출력 경로 (단일 신일 때)")
    args = parser.parse_args()

    targets = GOD_IDS if args.god == "all" else [args.god]
    out_dir = Path("dpo-data")
    out_dir.mkdir(exist_ok=True)

    total = 0
    for god_id in targets:
        if god_id not in GOD_IDS:
            print(f"알 수 없는 god_id: {god_id}")
            continue

        pairs = build_dpo_pairs(god_id)
        out_path = Path(args.out) if args.out and len(targets) == 1 else out_dir / f"{god_id}.jsonl"

        with open(out_path, "w", encoding="utf-8") as f:
            for pair in pairs:
                f.write(json.dumps(pair, ensure_ascii=False) + "\n")

        print(f"  [OK] {god_id}: {len(pairs)}개 DPO 쌍 → {out_path}")
        total += len(pairs)

    print(f"\n[완료] 총 {total}개 DPO 선호 쌍 생성")
    if total < 10:
        print("⚠️  쌍이 적습니다. 토론을 더 진행한 후 재실행하세요.")

if __name__ == "__main__":
    main()
