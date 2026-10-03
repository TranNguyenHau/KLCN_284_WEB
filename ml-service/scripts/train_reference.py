import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from features import build_features

parser = argparse.ArgumentParser()
parser.add_argument("--csv", required=True)
parser.add_argument("--features", default="close")
parser.add_argument("--target", default="close")
parser.add_argument("--seq", type=int, default=60)
parser.add_argument("--epochs", type=int, default=50)
parser.add_argument("--out", default=".")
args = parser.parse_args()

features = [f.strip() for f in args.features.split(",")]
df = pd.read_csv(args.csv)
df.columns = [c.lower() for c in df.columns]
df = df.sort_values("date").reset_index(drop=True)
feats = build_features(df, features).dropna().reset_index(drop=True)
split = int(len(feats) * 0.85)

scaler = MinMaxScaler()
scaler.fit(feats.iloc[:split].to_numpy())
scaled = scaler.transform(feats.to_numpy())
target_idx = features.index(args.target)

X, y = [], []
for i in range(args.seq, len(scaled)):
    X.append(scaled[i - args.seq : i])
    y.append(scaled[i, target_idx])
X, y = np.array(X), np.array(y)
X_train, y_train = X[: split - args.seq], y[: split - args.seq]
X_val, y_val = X[split - args.seq :], y[split - args.seq :]

import tensorflow as tf

model = tf.keras.Sequential(
    [
        tf.keras.layers.Input(shape=(args.seq, len(features))),
        tf.keras.layers.LSTM(64, return_sequences=True),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.LSTM(32),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(1),
    ]
)
model.compile(optimizer="adam", loss="mse")
model.fit(
    X_train,
    y_train,
    validation_data=(X_val, y_val),
    epochs=args.epochs,
    batch_size=32,
    callbacks=[tf.keras.callbacks.EarlyStopping(patience=8, restore_best_weights=True)],
)

out = Path(args.out)
(out / "models").mkdir(parents=True, exist_ok=True)
(out / "preprocessing").mkdir(parents=True, exist_ok=True)
model.save(out / "models" / "stock_lstm.keras")
joblib.dump(scaler, out / "preprocessing" / "scaler.pkl")
config = {
    "model_name": "stock_lstm",
    "sequence_length": args.seq,
    "features": features,
    "target_feature": args.target,
    "output_mode": "single_step",
    "max_horizon": 30,
    "min_history_rows": args.seq + 60,
}
(out / "model_config.json").write_text(json.dumps(config, indent=2))
print("Saved model, scaler and model_config.json to", out.resolve())
