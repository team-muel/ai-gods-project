"""Supabase 또는 warehouse snapshot → Unsloth 학습용 JSONL 변환 스크립트."""

import argparse
import os
import json
from pathlib import Path
from dotenv import load_dotenv
from warehouse_snapshot import collect_sft_memories, load_snapshot

load_dotenv(Path(__file__).parent.parent / ".env")

supabase = None

GOD_SYSTEM_PROMPTS = {
    "cco": "당신은 Muse(뮤즈), AI 기업의 최고 창의 책임자(CCO)입니다. 창의성, 브랜드 스토리텔링, 감성적 메시지 관점에서 날카롭게 분석합니다. 항상 창의적이고 독창적인 시각을 제시하세요. 반드시 한국어로 답변하세요.",
    "cso": "당신은 Atlas(아틀라스), AI 기업의 최고 전략 책임자(CSO)입니다. 장기 전략, 경쟁 우위, 시장 포지셔닝 관점에서 분석합니다. 데이터와 트렌드를 기반으로 전략적 통찰을 제시하세요. 반드시 한국어로 답변하세요.",
    "cpo": "당신은 Forge(포지), AI 기업의 최고 제품 책임자(CPO)입니다. 제품 개발, 사용자 경험, 로드맵 관점에서 분석합니다. 실용적이고 실행 가능한 제품 전략을 제시하세요. 반드시 한국어로 답변하세요.",
    "cmo": "당신은 Mercury(머큐리), AI 기업의 최고 마케팅 책임자(CMO)입니다. 마케팅, 고객 획득, 브랜드 인지도 관점에서 분석합니다. 시장 반응과 고객 심리를 중심으로 전략을 제시하세요. 반드시 한국어로 답변하세요.",
    "cxo": "당신은 Empathy(엠퍼시), AI 기업의 최고 경험 책임자(CXO)입니다. 고객 경험, 사용자 만족, 감성적 연결 관점에서 분석합니다. 인간 중심적 시각을 잃지 마세요. 반드시 한국어로 답변하세요.",
    "cfo": "당신은 Prudence(프루던스), AI 기업의 최고 재무 책임자(CFO)입니다. 재무 건전성, ROI, 리스크 관리 관점에서 분석합니다. 숫자와 현실적 제약을 기반으로 냉철하게 판단하세요. 반드시 한국어로 답변하세요.",
    "cdo": "당신은 Oracle(오라클), AI 기업의 최고 데이터 책임자(CDO)입니다. 데이터 분석, 인사이트 도출, 의사결정 지원 관점에서 분석합니다. 근거 있는 데이터로 판단을 지원하세요. 반드시 한국어로 답변하세요.",
    "cto": "당신은 Nexus(넥서스), AI 기업의 최고 기술 책임자(CTO)입니다. 기술 아키텍처, 인프라, 기술적 실현 가능성 관점에서 분석합니다. 기술적 현실과 혁신 가능성을 균형 있게 제시하세요. 반드시 한국어로 답변하세요.",
}


def get_supabase_client():
    global supabase
    if supabase is not None:
        return supabase

    try:
        from supabase import create_client
    except ImportError:
        raise SystemExit("❌ supabase-py 필요: pip install supabase")

    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        raise SystemExit("❌ .env에서 SUPABASE_URL/VITE_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY 필요")

    supabase = create_client(supabase_url, supabase_key)
    return supabase

def fetch_memories(god_id: str, snapshot: dict | None) -> list:
    if snapshot is not None:
        return collect_sft_memories(snapshot, god_id)

    result = get_supabase_client().table("god_memories") \
        .select("topic, my_opinion, consensus, created_at") \
        .eq("god_id", god_id) \
        .eq("status", "active") \
        .order("created_at", desc=False) \
        .execute()
    return result.data or []

def to_jsonl_entry(god_id: str, memory: dict) -> dict:
    """ChatML 형식으로 변환"""
    topic = memory.get("topic", "")
    opinion = memory.get("my_opinion", "")
    consensus = memory.get("consensus", "")

    user_msg = f"주제: {topic}\n\n당신의 전문 분야 관점에서 초기 의견을 제시하세요."
    assistant_msg = opinion.strip()

    if not assistant_msg:
        return None

    entry = {
        "conversations": [
            {"role": "system", "content": GOD_SYSTEM_PROMPTS[god_id]},
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": assistant_msg},
        ]
    }

    # 합의문도 추가 학습 샘플로 (있을 때만)
    if consensus and len(consensus) > 50:
        entry["extra"] = {
            "consensus": consensus,
            "topic": topic,
        }

    return entry

def main():
    parser = argparse.ArgumentParser(description="SFT 학습 데이터 export")
    parser.add_argument("--snapshot", default=None, help="warehouse snapshot.json 경로")
    args = parser.parse_args()

    snapshot, snapshot_path = load_snapshot(args.snapshot)
    if snapshot_path:
        print(f"[snapshot] 사용: {snapshot_path}")

    out_dir = Path("training-data")
    out_dir.mkdir(exist_ok=True)

    total = 0
    for god_id in GOD_SYSTEM_PROMPTS:
        memories = fetch_memories(god_id, snapshot)
        entries = [to_jsonl_entry(god_id, m) for m in memories]
        entries = [e for e in entries if e]  # None 제거

        out_path = out_dir / f"{god_id}.jsonl"
        with open(out_path, "w", encoding="utf-8") as f:
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        print(f"  [OK] {god_id}: {len(entries)}개 -> {out_path}")
        total += len(entries)

    print(f"\n[완료] 총 {total}개 학습 샘플 생성")

if __name__ == "__main__":
    main()
