import pandas as pd

RAW_COLUMNS = ("open", "high", "low", "close", "volume")


def _rsi(close, period):
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    rs = gain / loss.replace(0, float("nan"))
    return (100 - 100 / (1 + rs)).fillna(100)


def build_features(df, features):
    close = df["close"]
    out = pd.DataFrame(index=df.index)
    for name in features:
        key = name.lower()
        if key in RAW_COLUMNS:
            out[name] = df[key]
        elif key == "return":
            out[name] = close.pct_change()
        elif key.startswith("sma_"):
            out[name] = close.rolling(int(key[4:])).mean()
        elif key.startswith("ema_"):
            out[name] = close.ewm(span=int(key[4:]), adjust=False).mean()
        elif key.startswith("rsi_"):
            out[name] = _rsi(close, int(key[4:]))
        elif key == "macd":
            out[name] = close.ewm(span=12, adjust=False).mean() - close.ewm(span=26, adjust=False).mean()
        elif key == "macd_signal":
            macd = close.ewm(span=12, adjust=False).mean() - close.ewm(span=26, adjust=False).mean()
            out[name] = macd.ewm(span=9, adjust=False).mean()
        else:
            raise ValueError(f"Unsupported feature '{name}'")
    return out
