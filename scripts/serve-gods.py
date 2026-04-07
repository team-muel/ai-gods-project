"""
8명 신 모델을 llama.cpp 서버로 서빙
각 신은 포트 11500~11507에서 실행

사용법:
  python scripts/serve-gods.py          # 전체 실행
  python scripts/serve-gods.py --god cco  # 단일 실행

사전 설치: llama.cpp (https://github.com/ggerganov/llama.cpp)
  winget install llama.cpp
  또는 https://github.com/ggerganov/llama.cpp/releases 에서 다운로드
"""

import argparse
import subprocess
import sys
from pathlib import Path

GOD_IDS = ["cco", "cso", "cpo", "cmo", "cxo", "cfo", "cdo", "cto"]
GOD_NAMES = {
    "cco": "Muse", "cso": "Atlas", "cpo": "Forge", "cmo": "Mercury",
    "cxo": "Empathy", "cfo": "Prudence", "cdo": "Oracle", "cto": "Nexus",
}
BASE_PORT = 11500

def start_server(god_id: str, port: int):
    gguf_path = Path(f"models/gguf/{god_id}-unsloth.Q4_K_M.gguf")
    if not gguf_path.exists():
        # 파일명 패턴 탐색
        gguf_dir = Path(f"models/gguf/{god_id}")
        candidates = list(gguf_dir.glob("*.gguf")) if gguf_dir.exists() else []
        if not candidates:
            candidates = list(Path("models/gguf").glob(f"{god_id}*.gguf"))
        if not candidates:
            print(f"  ❌ {god_id} GGUF 파일 없음 (먼저 finetune-god.py 실행)")
            return None
        gguf_path = candidates[0]

    cmd = [
        "llama-server",
        "-m", str(gguf_path),
        "--port", str(port),
        "--host", "127.0.0.1",
        "-ngl", "35",          # GPU 레이어 수 (3060 기준)
        "--ctx-size", "4096",
        "--threads", "4",
        "--log-disable",
    ]

    print(f"  🚀 [{GOD_NAMES[god_id]}] 포트 {port} 서버 시작...")
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return proc

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--god", default="all", help="god id 또는 all")
    args = parser.parse_args()

    targets = GOD_IDS if args.god == "all" else [args.god]
    processes = []

    for i, god_id in enumerate(targets):
        port = BASE_PORT + GOD_IDS.index(god_id)
        proc = start_server(god_id, port)
        if proc:
            processes.append((god_id, port, proc))

    if not processes:
        print("❌ 실행된 서버 없음")
        sys.exit(1)

    print(f"\n✅ {len(processes)}개 서버 실행 중:")
    for god_id, port, _ in processes:
        print(f"  [{GOD_NAMES[god_id]}] http://127.0.0.1:{port}")

    print("\n포트 매핑 (.env에 추가):")
    for god_id, port, _ in processes:
        print(f"  LLAMA_{god_id.upper()}_PORT={port}")

    print("\n종료하려면 Ctrl+C")
    try:
        for _, _, proc in processes:
            proc.wait()
    except KeyboardInterrupt:
        print("\n👋 서버 종료 중...")
        for _, _, proc in processes:
            proc.terminate()

if __name__ == "__main__":
    main()
