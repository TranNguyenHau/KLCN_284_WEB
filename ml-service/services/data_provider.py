from typing import List, Optional

import pandas as pd

from config import settings
from features import RAW_COLUMNS


class HistoryUnavailable(Exception):
    pass


def frame_from_records(records) -> pd.DataFrame:
    df = pd.DataFrame([r if isinstance(r, dict) else r.model_dump() for r in records])
    df.columns = [c.lower() for c in df.columns]
    if "date" not in df.columns or "close" not in df.columns:
        raise HistoryUnavailable("History must contain 'date' and 'close'")
    df["date"] = pd.to_datetime(df["date"])
    df["close"] = pd.to_numeric(df["close"], errors="coerce")
    for col in RAW_COLUMNS:
        if col not in df.columns or df[col].isna().all():
            df[col] = df["close"] if col != "volume" else 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["close"]).sort_values("date").drop_duplicates("date", keep="last")
    return df.reset_index(drop=True)


def load_history(symbol: str, records: Optional[List] = None):
    if records:
        return frame_from_records(records), "request"
    csv_path = settings.data_dir / f"{symbol.upper()}.csv"
    if csv_path.exists():
        return frame_from_records(pd.read_csv(csv_path).to_dict("records")), "csv"
    raise HistoryUnavailable(
        f"No historical data supplied for {symbol} and {csv_path.name} was not found in the data directory"
    )
