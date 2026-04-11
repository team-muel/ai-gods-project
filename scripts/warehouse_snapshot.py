import json
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SNAPSHOT_PATH = PROJECT_ROOT / "warehouse" / "latest-snapshot.json"


def resolve_snapshot_path(cli_snapshot: str | None = None):
    candidate = cli_snapshot or os.environ.get("WAREHOUSE_SNAPSHOT_FILE") or ""
    if candidate:
        path = Path(candidate)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        if not path.exists():
            raise FileNotFoundError(f"스냅샷 파일을 찾을 수 없습니다: {path}")
        return path

    if DEFAULT_SNAPSHOT_PATH.exists():
        return DEFAULT_SNAPSHOT_PATH
    return None


def load_snapshot(cli_snapshot: str | None = None):
    snapshot_path = resolve_snapshot_path(cli_snapshot)
    if not snapshot_path:
        return None, None

    with open(snapshot_path, encoding="utf-8") as f:
        return json.load(f), snapshot_path


def snapshot_debates(snapshot: dict | None) -> list:
    if not snapshot:
        return []
    return snapshot.get("debates") or []


def index_snapshot_debates(snapshot: dict | None) -> dict:
    return {
        str(debate.get("id") or ""): debate
        for debate in snapshot_debates(snapshot)
        if debate.get("id")
    }


def normalize_message(message: dict) -> dict:
    return {
        "god_id": str(message.get("god_id") or message.get("godId") or ""),
        "god_name": str(message.get("god_name") or message.get("god") or ""),
        "round": max(1, int(message.get("round") or 1)),
        "content": str(message.get("content") or ""),
        "created_at": str(message.get("created_at") or message.get("createdAt") or ""),
    }


def collect_sft_memories(snapshot: dict, god_id: str) -> list:
    rows = []
    for debate in snapshot_debates(snapshot):
        messages = [
            normalize_message(message)
            for message in debate.get("messages", [])
            if str(message.get("god_id") or message.get("godId") or "") == god_id
        ]

        if not messages:
            continue

        last_message = max(messages, key=lambda item: (item.get("round", 1), item.get("created_at", ""), len(item.get("content", ""))))
        rows.append({
            "topic": debate.get("topic", ""),
            "my_opinion": last_message.get("content", ""),
            "consensus": debate.get("consensus", ""),
            "created_at": debate.get("created_at", last_message.get("created_at", "")),
        })

    return rows


def collect_snapshot_preference_pairs(snapshot: dict, god_id: str) -> list:
    rows = []
    for debate in snapshot_debates(snapshot):
        for row in debate.get("preference_pairs", []):
            if str(row.get("god_id") or row.get("godId") or "") != god_id:
                continue
            if str(row.get("status") or "ready") != "ready":
                continue
            rows.append(row)
    return rows