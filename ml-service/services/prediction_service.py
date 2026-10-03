import logging
from datetime import datetime, timezone
from typing import List, Optional

import joblib
import numpy as np
import pandas as pd

from config import settings
from features import build_features
from services.data_provider import HistoryUnavailable, load_history

log = logging.getLogger("prediction_service")


class ModelNotReady(Exception):
    pass


class PredictionService:
    def __init__(self):
        self.model = None
        self.scaler = None
        self.load_error: Optional[str] = None
        self.loaded_at: Optional[str] = None

    @property
    def ready(self) -> bool:
        return self.model is not None and self.scaler is not None

    def load(self):
        self.model, self.scaler, self.load_error = None, None, None
        try:
            if not settings.model_path.exists():
                raise FileNotFoundError(f"Model file not found: {settings.model_path}")
            if not settings.scaler_path.exists():
                raise FileNotFoundError(f"Scaler file not found: {settings.scaler_path}")
            import tensorflow as tf

            model = tf.keras.models.load_model(settings.model_path, compile=False)
            scaler = joblib.load(settings.scaler_path)
            self._validate(model, scaler)
            self.model, self.scaler = model, scaler
            self.loaded_at = datetime.now(timezone.utc).isoformat()
            log.info("Model and scaler loaded from %s", settings.model_path)
        except Exception as exc:
            self.model, self.scaler = None, None
            self.load_error = str(exc)
            log.error("Model load failed: %s", exc)

    def _validate(self, model, scaler):
        input_shape = model.input_shape
        if input_shape[1] is not None and input_shape[1] != settings.sequence_length:
            raise ValueError(
                f"Model expects sequence length {input_shape[1]} but model_config.json says {settings.sequence_length}"
            )
        if input_shape[2] != len(settings.features):
            raise ValueError(
                f"Model expects {input_shape[2]} features but model_config.json lists {len(settings.features)}"
            )
        n_scaler = getattr(scaler, "n_features_in_", len(settings.features))
        if n_scaler != len(settings.features):
            raise ValueError(f"Scaler was fit on {n_scaler} features but {len(settings.features)} are configured")

    def info(self):
        return {
            "ready": self.ready,
            "load_error": self.load_error,
            "loaded_at": self.loaded_at,
            "model_name": settings.model_name,
            "model_path": str(settings.model_path),
            "scaler_path": str(settings.scaler_path),
            "sequence_length": settings.sequence_length,
            "features": settings.features,
            "target_feature": settings.target_feature,
            "output_mode": settings.output_mode,
            "max_horizon": settings.max_horizon,
        }

    def _inverse_target(self, scaled_values):
        idx = settings.features.index(settings.target_feature)
        dummy = np.zeros((len(scaled_values), len(settings.features)))
        dummy[:, idx] = scaled_values
        return self.scaler.inverse_transform(dummy)[:, idx]

    def _window(self, raw: pd.DataFrame):
        feats = build_features(raw, settings.features).dropna()
        if len(feats) < settings.sequence_length:
            raise HistoryUnavailable(
                f"Need at least {settings.sequence_length} usable rows after feature calculation, got {len(feats)}"
            )
        window = feats.tail(settings.sequence_length)[settings.features].to_numpy(dtype="float64")
        scaled = self.scaler.transform(window)
        return scaled.reshape(1, settings.sequence_length, len(settings.features))

    def predict(self, symbol: str, days: int, history: Optional[List] = None):
        if not self.ready:
            raise ModelNotReady(self.load_error or "Model is not loaded")
        if days < 1 or days > settings.max_horizon:
            raise ValueError(f"days must be between 1 and {settings.max_horizon}")
        raw, source = load_history(symbol, history)
        if len(raw) < settings.min_history_rows:
            raise HistoryUnavailable(f"Need at least {settings.min_history_rows} history rows, got {len(raw)}")

        last_date = raw["date"].iloc[-1]
        future_dates = pd.bdate_range(last_date + pd.Timedelta(days=1), periods=days)

        if settings.output_mode == "multi_step":
            out = np.asarray(self.model.predict(self._window(raw), verbose=0)).reshape(-1)
            if len(out) < days:
                raise ValueError(f"Model produces {len(out)} steps but {days} were requested")
            prices = self._inverse_target(out[:days])
        else:
            working = raw.copy()
            prices = []
            for date in future_dates:
                out = np.asarray(self.model.predict(self._window(working), verbose=0)).reshape(-1)
                price = float(self._inverse_target(out[:1])[0])
                prices.append(price)
                row = {
                    "date": date,
                    "open": price,
                    "high": price,
                    "low": price,
                    "close": price,
                    "volume": float(working["volume"].iloc[-1]),
                }
                working = pd.concat([working, pd.DataFrame([row])], ignore_index=True)

        return {
            "symbol": symbol.upper(),
            "predictions": [
                {"date": d.strftime("%Y-%m-%d"), "predicted_price": round(float(p), 2)}
                for d, p in zip(future_dates, prices)
            ],
            "meta": {
                "model_name": settings.model_name,
                "sequence_length": settings.sequence_length,
                "features": settings.features,
                "output_mode": settings.output_mode,
                "history_source": source,
                "history_rows": int(len(raw)),
                "last_actual_date": last_date.strftime("%Y-%m-%d"),
                "last_actual_close": float(raw["close"].iloc[-1]),
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "has_confidence_interval": False,
            },
        }


prediction_service = PredictionService()
