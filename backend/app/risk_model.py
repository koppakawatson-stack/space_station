"""
risk_model.py
=============
ML-based risk classification for conjunction events.

Architecture:
  - Ensemble of RandomForestClassifier + XGBClassifier
  - Features: relative distance, velocity, debris size, orbit type,
              inclination delta, encounter geometry
  - Labels: 0=SAFE, 1=MEDIUM, 2=HIGH, 3=CRITICAL
  - Trained on 5,000 synthetic encounter samples with physically realistic distributions

Training runs once on startup if no saved model exists.
Model saved to: backend/data/models/risk_model.pkl
"""

import os
import math
import logging
import numpy as np
import joblib
from pathlib import Path
from typing import Dict, Any, Tuple, List

logger = logging.getLogger(__name__)

MODEL_DIR  = Path(__file__).parent.parent / "data" / "models"
MODEL_PATH = MODEL_DIR / "risk_model.pkl"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

RISK_LABELS = ["SAFE", "MEDIUM", "HIGH", "CRITICAL"]
ORBIT_TYPE_MAP = {"LEO": 0, "MEO": 1, "GEO": 2, "Polar": 3, "SSO": 4, "HEO": 5, "DEBRIS": 6}


# ── Feature Engineering ────────────────────────────────────────────────────────

def extract_features(conjunction: Dict[str, Any]) -> np.ndarray:
    """
    Build feature vector from a conjunction record.

    Features (8-dim):
      0. miss_distance_km          (CPA in km)
      1. relative_velocity_kms     (km/s)
      2. time_to_encounter_hours   (hours)
      3. debris_size_cm            (estimated, 0 if unknown)
      4. sat_orbit_type_enc        (0–6)
      5. inclination_delta_deg     (|i_sat – i_deb|)
      6. prob_raw                  (chan probability × 100)
      7. altitude_km               (satellite altitude)
    """
    # Parse CPA (may be string like "4.32 km" or float)
    cpa_raw = conjunction.get("cpa_km_float", None) or conjunction.get("closest_approach_km", "999")
    if isinstance(cpa_raw, str):
        cpa = float(cpa_raw.replace(" km", "").strip())
    else:
        cpa = float(cpa_raw)

    # Relative velocity
    rv_raw = conjunction.get("relative_velocity_kms", "0")
    if isinstance(rv_raw, str):
        rv = float(rv_raw.replace(" km/s", "").strip())
    else:
        rv = float(rv_raw)

    # Time to encounter (hours)
    tte_sec = float(conjunction.get("time_to_encounter_seconds", 10800))
    tte_h   = tte_sec / 3600.0

    # Debris size
    size_cm = float(conjunction.get("size_cm", 10.0))

    # Orbit type encoding
    orbit_type = conjunction.get("orbit_type", "LEO")
    orbit_enc  = ORBIT_TYPE_MAP.get(orbit_type, 0)

    # Inclination delta
    inc_delta = float(conjunction.get("inclination_delta", 5.0))

    # Chan probability
    prob_raw = conjunction.get("probability_float", 0.0)
    prob_pct = float(prob_raw) * 100.0

    # Satellite altitude
    altitude = float(conjunction.get("altitude", 500.0))

    return np.array([
        cpa, rv, tte_h, size_cm, orbit_enc,
        inc_delta, prob_pct, altitude
    ], dtype=np.float64)


# ── Synthetic Training Data Generator ─────────────────────────────────────────

def generate_training_data(n_samples: int = 5000, seed: int = 42) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generate physically realistic encounter samples for training.

    Distribution:
      - SAFE     (70%): large CPA, low velocity, small debris
      - MEDIUM   (15%): CPA 10–20 km, moderate velocity
      - HIGH      (10%): CPA 5–10 km, high velocity, large debris
      - CRITICAL   (5%): CPA <5 km, very high velocity, large debris
    """
    rng = np.random.default_rng(seed)
    X   = []
    y   = []

    for label_idx, (label, frac) in enumerate([
        ("SAFE",     0.70),
        ("MEDIUM",   0.15),
        ("HIGH",     0.10),
        ("CRITICAL", 0.05),
    ]):
        n = int(n_samples * frac)

        if label == "SAFE":
            cpa       = rng.uniform(20, 500, n)
            rv        = rng.uniform(0.1, 5.0, n)
            tte_h     = rng.uniform(0.5, 72, n)
            size_cm   = rng.uniform(0.5, 5, n)
            orbit_enc = rng.integers(0, 5, n)
            inc_delta = rng.uniform(0, 30, n)
            prob_pct  = rng.uniform(0, 0.001, n)
            altitude  = rng.uniform(400, 36000, n)

        elif label == "MEDIUM":
            cpa       = rng.uniform(10, 20, n)
            rv        = rng.uniform(3, 10, n)
            tte_h     = rng.uniform(0.5, 24, n)
            size_cm   = rng.uniform(2, 15, n)
            orbit_enc = rng.integers(0, 5, n)
            inc_delta = rng.uniform(0, 60, n)
            prob_pct  = rng.uniform(0.001, 0.01, n)
            altitude  = rng.uniform(400, 2000, n)

        elif label == "HIGH":
            cpa       = rng.uniform(5, 10, n)
            rv        = rng.uniform(5, 15, n)
            tte_h     = rng.uniform(0.1, 12, n)
            size_cm   = rng.uniform(5, 30, n)
            orbit_enc = rng.integers(0, 3, n)
            inc_delta = rng.uniform(10, 90, n)
            prob_pct  = rng.uniform(0.01, 0.1, n)
            altitude  = rng.uniform(400, 1200, n)

        else:  # CRITICAL
            cpa       = rng.uniform(0.1, 5, n)
            rv        = rng.uniform(8, 15, n)
            tte_h     = rng.uniform(0.01, 6, n)
            size_cm   = rng.uniform(10, 100, n)
            orbit_enc = rng.integers(0, 2, n)
            inc_delta = rng.uniform(30, 120, n)
            prob_pct  = rng.uniform(0.1, 100, n)
            altitude  = rng.uniform(400, 800, n)

        chunk = np.column_stack([cpa, rv, tte_h, size_cm, orbit_enc, inc_delta, prob_pct, altitude])
        X.append(chunk)
        y.extend([label_idx] * n)

    X_arr = np.vstack(X)
    y_arr = np.array(y, dtype=int)

    # Shuffle
    idx = rng.permutation(len(y_arr))
    return X_arr[idx], y_arr[idx]


# ── Model Training ─────────────────────────────────────────────────────────────

def train_and_save() -> Any:
    """
    Train ensemble (RandomForest + XGBoost) and save to disk.
    Returns the trained ensemble.
    """
    from sklearn.ensemble import RandomForestClassifier, VotingClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline

    try:
        import xgboost as xgb
        xgb_available = True
    except ImportError:
        xgb_available = False
        logger.warning("XGBoost not available, using RandomForest only")

    logger.info("Training risk classification model…")
    X, y = generate_training_data(5000)

    rf = RandomForestClassifier(
        n_estimators = 120,
        max_depth    = 10,
        min_samples_split = 5,
        class_weight = "balanced",
        random_state = 42,
        n_jobs       = -1,
    )

    if xgb_available:
        xgb_clf = xgb.XGBClassifier(
            n_estimators    = 100,
            max_depth       = 6,
            learning_rate   = 0.1,
            use_label_encoder = False,
            eval_metric     = "mlogloss",
            random_state    = 42,
            verbosity       = 0,
        )
        estimators = [("rf", rf), ("xgb", xgb_clf)]
        ensemble = VotingClassifier(estimators=estimators, voting="soft")
    else:
        ensemble = rf

    pipeline = Pipeline([
        ("scaler",  StandardScaler()),
        ("clf",     ensemble),
    ])

    pipeline.fit(X, y)

    # Quick accuracy check
    from sklearn.model_selection import cross_val_score
    scores = cross_val_score(pipeline, X, y, cv=3, scoring="f1_macro")
    logger.info(f"Risk model CV F1: {scores.mean():.3f} ± {scores.std():.3f}")

    joblib.dump(pipeline, MODEL_PATH)
    logger.info(f"Risk model saved to {MODEL_PATH}")
    return pipeline


def load_model() -> Any:
    """Load saved model or train a new one if not found."""
    if MODEL_PATH.exists():
        try:
            model = joblib.load(MODEL_PATH)
            logger.info(f"Risk model loaded from {MODEL_PATH}")
            return model
        except Exception as e:
            logger.warning(f"Could not load model: {e}, retraining…")
    return train_and_save()


# ── Prediction API ─────────────────────────────────────────────────────────────

_model = None

def get_model():
    global _model
    if _model is None:
        _model = load_model()
    return _model


def predict_risk(conjunction: Dict[str, Any]) -> Dict[str, Any]:
    """
    Predict risk level for a conjunction event.

    Parameters
    ----------
    conjunction : dict from collision_engine.compute_conjunctions()

    Returns
    -------
    dict with: predicted_risk, confidence, feature_importance_note
    """
    try:
        model  = get_model()
        feat   = extract_features(conjunction).reshape(1, -1)
        pred   = model.predict(feat)[0]
        proba  = model.predict_proba(feat)[0]
        label  = RISK_LABELS[int(pred)]
        conf   = float(proba[int(pred)])

        return {
            "predicted_risk":  label,
            "confidence":      round(conf, 4),
            "probabilities": {
                RISK_LABELS[i]: round(float(proba[i]), 4)
                for i in range(len(RISK_LABELS))
            }
        }
    except Exception as e:
        logger.warning(f"Risk prediction failed: {e}")
        # Fallback: use simple threshold on CPA
        cpa = conjunction.get("cpa_km_float", 999)
        if   cpa < 5:   risk = "CRITICAL"
        elif cpa < 10:  risk = "HIGH"
        elif cpa < 20:  risk = "MEDIUM"
        else:           risk = "SAFE"
        return {"predicted_risk": risk, "confidence": 0.0, "probabilities": {}}


def batch_predict(conjunctions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Run risk prediction on a list of conjunctions and annotate them.
    Returns enhanced list with 'ml_risk' and 'ml_confidence' fields.
    """
    enhanced = []
    for c in conjunctions:
        pred = predict_risk(c)
        enhanced.append({
            **c,
            "ml_risk":       pred["predicted_risk"],
            "ml_confidence": pred["confidence"],
        })
    return enhanced


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # Force train and test
    model = train_and_save()

    test_cases = [
        {"cpa_km_float": 1.2,  "relative_velocity_kms": "14.5 km/s", "time_to_encounter_seconds": 7200,
         "size_cm": 30, "orbit_type": "LEO", "inclination_delta": 45, "probability_float": 0.05, "altitude": 560},
        {"cpa_km_float": 45.0, "relative_velocity_kms": "2.1 km/s",  "time_to_encounter_seconds": 86400,
         "size_cm": 3,  "orbit_type": "MEO", "inclination_delta": 5,  "probability_float": 0.0001, "altitude": 20000},
    ]

    for tc in test_cases:
        result = predict_risk(tc)
        print(f"CPA={tc['cpa_km_float']} km → {result['predicted_risk']} (conf={result['confidence']:.2f})")
