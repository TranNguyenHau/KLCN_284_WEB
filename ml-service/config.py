import json
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _resolve(value, default):
    path = Path(os.getenv(value, default))
    return path if path.is_absolute() else BASE_DIR / path


class Settings:
    def __init__(self):
        self.config_path = _resolve("MODEL_CONFIG_PATH", "model_config.json")
        self.model_path = _resolve("MODEL_PATH", "models/stock_lstm.keras")
        self.scaler_path = _resolve("SCALER_PATH", "preprocessing/scaler.pkl")
        self.data_dir = _resolve("DATA_DIR", "data")
        cfg = {}
        if self.config_path.exists():
            with open(self.config_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        self.raw = cfg
        self.model_name = cfg.get("model_name", "stock_lstm")
        self.sequence_length = int(cfg.get("sequence_length", 60))
        self.features = list(cfg.get("features", ["close"]))
        self.target_feature = cfg.get("target_feature", "close")
        self.output_mode = cfg.get("output_mode", "single_step")
        self.max_horizon = int(cfg.get("max_horizon", 30))
        self.min_history_rows = int(cfg.get("min_history_rows", self.sequence_length + 60))
        if self.target_feature not in self.features:
            raise ValueError("target_feature must be included in features")
        if self.output_mode not in ("single_step", "multi_step"):
            raise ValueError("output_mode must be single_step or multi_step")


settings = Settings()
