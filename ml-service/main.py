import logging
import os
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import settings
from services.data_provider import HistoryUnavailable
from services.prediction_service import ModelNotReady, prediction_service

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    prediction_service.load()
    yield


app = FastAPI(title="Stock LSTM Inference Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Candle(BaseModel):
    date: str
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: float
    volume: Optional[float] = None


class PredictRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=10)
    days: int = Field(default=7, ge=1, le=90)
    history: Optional[List[Candle]] = None


@app.get("/health")
def health():
    return {"status": "ok" if prediction_service.ready else "degraded", **prediction_service.info()}


@app.get("/model/info")
def model_info():
    return prediction_service.info()


@app.post("/model/reload")
def reload_model():
    prediction_service.load()
    return prediction_service.info()


@app.post("/predict")
def predict(req: PredictRequest):
    try:
        return prediction_service.predict(req.symbol, req.days, req.history)
    except ModelNotReady as exc:
        raise HTTPException(status_code=503, detail=f"Model not ready: {exc}")
    except (HistoryUnavailable, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logging.exception("Prediction failed")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")
