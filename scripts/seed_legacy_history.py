#!/usr/bin/env python3
"""Create a v1.0-era SQLite history database for migration testing."""

from pathlib import Path
import json
import sqlite3
import sys
from datetime import datetime


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: seed_legacy_history.py <data-dir>")
    data_dir = Path(sys.argv[1])
    data_dir.mkdir(parents=True, exist_ok=True)
    db = data_dir / "fault_detect.db"
    conn = sqlite3.connect(db)
    try:
        conn.execute(
            """
            CREATE TABLE detect_history (
                id TEXT PRIMARY KEY,
                ts TEXT,
                url TEXT,
                status_code TEXT,
                root_cause TEXT,
                scenario_name TEXT,
                confidence REAL,
                report TEXT
            )
            """
        )
        conclusion = {
            "root_cause": "backend",
            "root_cause_label": "后端",
            "scenario_name": "旧版历史迁移",
            "confidence": 0.8,
        }
        conn.execute(
            "INSERT INTO detect_history "
            "(id, ts, url, status_code, root_cause, scenario_name, confidence, report) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (
                "legacy001",
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "http://127.0.0.1:18080/error",
                "500",
                "后端",
                "旧版历史迁移",
                0.8,
                json.dumps(conclusion, ensure_ascii=False),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    print(db)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
