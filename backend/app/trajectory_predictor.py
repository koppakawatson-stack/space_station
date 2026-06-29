"""
trajectory_predictor.py
=======================
LSTM-based future trajectory prediction for satellites.

Architecture:
  Input:  Last N_HISTORY = 24 positions (X, Y, Z in km, sampled every 15 min)
  Model:  2-layer LSTM → Dropout → Linear → N_FUTURE × 3
  Output: Next N_FUTURE = 24 predicted positions (6 hours at 15-min intervals)

For each satellite, we generate the "history" by backward-propagating
the current TLE, then forward-predict using the LSTM. This gives the
visualisation a smooth predicted orbit arc.

Without real historical archives, training uses SGP4-generated orbit
trajectories as ground truth — the LSTM learns the orbital mechanics
pattern from these physically accurate sequences.

Model saved to: backend/data/models/lstm_trajectory.pt
"""

import math
import time
import logging
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

MODEL_DIR  = Path(__file__).parent.parent / "data" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
MODEL_PATH = MODEL_DIR / "lstm_trajectory.pt"

N_HISTORY   = 24    # Past positions used as input (24 × 15 min = 6 hours back)
N_FUTURE    = 24    # Future positions to predict (24 × 15 min = 6 hours forward)
STEP_SEC    = 900   # 15 minutes between samples (seconds)
INPUT_DIM   = 3     # (X, Y, Z)
HIDDEN_DIM  = 128
NUM_LAYERS  = 2
DROPOUT     = 0.1


# ── PyTorch Model Definition ──────────────────────────────────────────────────

def _get_torch():
    """Lazy import torch to avoid slow startup if not GPU-accelerated."""
    try:
        import torch
        import torch.nn as nn
        return torch, nn
    except ImportError:
        return None, None


class OrbitalLSTM:
    """Wrapper class that works with or without PyTorch."""

    def __init__(self):
        self._model  = None
        self._scaler_mean  = None
        self._scaler_scale = None
        self._torch_available = False
        self._initialize()

    def _initialize(self):
        torch, nn = _get_torch()
        if torch is None:
            logger.warning("PyTorch not available — using analytical predictor")
            return
        self._torch_available = True
        self._torch = torch
        self._nn    = nn

        if MODEL_PATH.exists():
            try:
                checkpoint = torch.load(MODEL_PATH, map_location="cpu", weights_only=False)
                self._model        = self._build_model(nn)
                self._model.load_state_dict(checkpoint["model_state"])
                self._scaler_mean  = checkpoint["scaler_mean"]
                self._scaler_scale = checkpoint["scaler_scale"]
                self._model.eval()
                logger.info(f"LSTM trajectory model loaded from {MODEL_PATH}")
                return
            except Exception as e:
                logger.warning(f"Could not load LSTM model: {e}, retraining…")

        self._train_and_save()

    def _build_model(self, nn):
        class _LSTMModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.lstm = nn.LSTM(
                    input_size  = INPUT_DIM,
                    hidden_size = HIDDEN_DIM,
                    num_layers  = NUM_LAYERS,
                    dropout     = DROPOUT,
                    batch_first = True,
                )
                self.dropout = nn.Dropout(DROPOUT)
                self.fc      = nn.Linear(HIDDEN_DIM, N_FUTURE * INPUT_DIM)

            def forward(self, x):
                # x: (batch, N_HISTORY, 3)
                out, _ = self.lstm(x)
                out     = self.dropout(out[:, -1, :])   # last hidden state
                out     = self.fc(out)                  # (batch, N_FUTURE * 3)
                return out.view(-1, N_FUTURE, INPUT_DIM)

        return _LSTMModel()

    def _generate_training_data(self, n_orbits: int = 500) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generate training sequences from SGP4-propagated orbits.
        Each orbit type is represented with varied inclinations and phases.
        """
        from app.simulation import KeplerianElement

        X_all, y_all = [], []

        orbit_configs = [
            # (a, e, i, label)
            (6791, 0.0005, 51.6, "ISS-like"),
            (6921, 0.0001, 53.0, "Starlink-like"),
            (26560, 0.008, 55.0, "GPS-like"),
            (7078, 0.0001, 98.2, "Polar-like"),
            (42164, 0.0001, 0.1, "GEO-like"),
        ]

        rng = np.random.default_rng(42)
        per_config = n_orbits // len(orbit_configs)

        for a, e, i, label in orbit_configs:
            for _ in range(per_config):
                # Randomize orbital elements slightly
                a_r    = a    + rng.uniform(-50,   50)
                i_r    = i    + rng.uniform(-2,    2)
                node_r = rng.uniform(0, 360)
                peri_r = rng.uniform(0, 360)
                m0_r   = rng.uniform(0, 360)
                t0_r   = rng.uniform(0, 3600 * 24)  # random epoch offset

                kep = KeplerianElement(
                    "TRAIN", "TRAIN", "LEO",
                    a_r, e, i_r, node_r, peri_r, m0_r, "Unknown"
                )

                # Build history sequence (t0 - 24 steps)
                history = []
                for k in range(N_HISTORY):
                    t = t0_r + k * STEP_SEC
                    p = kep.propagate(t)
                    history.append([p["x"], p["y"], p["z"]])

                # Build future sequence (t0 + N_HISTORY to t0 + N_HISTORY + N_FUTURE)
                future = []
                for k in range(N_FUTURE):
                    t = t0_r + (N_HISTORY + k) * STEP_SEC
                    p = kep.propagate(t)
                    future.append([p["x"], p["y"], p["z"]])

                X_all.append(history)
                y_all.append(future)

        return np.array(X_all, dtype=np.float32), np.array(y_all, dtype=np.float32)

    def _train_and_save(self):
        """Train the LSTM model on synthetic orbital trajectories."""
        torch, nn = self._torch, self._nn
        if torch is None:
            return

        logger.info("Training LSTM trajectory model…")
        X, y = self._generate_training_data(n_orbits=600)

        # Normalize
        mean  = X.mean(axis=(0, 1), keepdims=True)
        scale = X.std(axis=(0, 1),  keepdims=True) + 1e-8
        X_n   = (X - mean) / scale
        y_n   = (y - mean) / scale  # same normalization

        self._scaler_mean  = mean[0, 0]   # (3,)
        self._scaler_scale = scale[0, 0]  # (3,)

        X_t = torch.from_numpy(X_n)
        y_t = torch.from_numpy(y_n)

        dataset = torch.utils.data.TensorDataset(X_t, y_t)
        loader  = torch.utils.data.DataLoader(dataset, batch_size=32, shuffle=True)

        model     = self._build_model(nn)
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        criterion = nn.MSELoss()

        model.train()
        for epoch in range(30):
            epoch_loss = 0.0
            for xb, yb in loader:
                optimizer.zero_grad()
                pred = model(xb)
                loss = criterion(pred, yb)
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                epoch_loss += loss.item()
            if (epoch + 1) % 10 == 0:
                logger.info(f"  Epoch {epoch+1:3d}/30  loss={epoch_loss/len(loader):.4f}")

        model.eval()
        self._model = model

        torch.save({
            "model_state":   model.state_dict(),
            "scaler_mean":   self._scaler_mean,
            "scaler_scale":  self._scaler_scale,
        }, MODEL_PATH)
        logger.info(f"LSTM model saved to {MODEL_PATH}")

    def predict(self, history_positions: List[Dict[str, float]]) -> List[Dict[str, float]]:
        """
        Predict future trajectory given a list of past positions.

        Parameters
        ----------
        history_positions : list of {x, y, z} dicts (length = N_HISTORY)

        Returns
        -------
        list of {x, y, z, t_offset_sec} dicts (length = N_FUTURE)
        """
        if self._torch_available and self._model is not None:
            return self._predict_lstm(history_positions)
        else:
            return self._predict_analytical(history_positions)

    def _predict_lstm(self, history: List[Dict[str, float]]) -> List[Dict[str, float]]:
        """LSTM-based prediction."""
        torch = self._torch
        try:
            arr = np.array([[p["x"], p["y"], p["z"]] for p in history], dtype=np.float32)
            mean  = self._scaler_mean
            scale = self._scaler_scale
            arr_n = (arr - mean) / scale

            x_t   = torch.from_numpy(arr_n).unsqueeze(0)  # (1, N_HISTORY, 3)
            with torch.no_grad():
                pred_n = self._model(x_t).squeeze(0).numpy()  # (N_FUTURE, 3)

            pred = pred_n * scale + mean

            return [
                {
                    "x": float(pred[k, 0]),
                    "y": float(pred[k, 1]),
                    "z": float(pred[k, 2]),
                    "t_offset_sec": (k + 1) * STEP_SEC,
                }
                for k in range(N_FUTURE)
            ]
        except Exception as e:
            logger.warning(f"LSTM prediction failed: {e}, using analytical fallback")
            return self._predict_analytical(history)

    def _predict_analytical(self, history: List[Dict[str, float]]) -> List[Dict[str, float]]:
        """
        Analytical fallback: fit circular orbit to last 2 history points
        and extrapolate forward using Keplerian motion.
        """
        if len(history) < 2:
            return []

        p1 = history[-2]
        p2 = history[-1]

        r1 = np.array([p1["x"], p1["y"], p1["z"]])
        r2 = np.array([p2["x"], p2["y"], p2["z"]])

        # Estimate angular velocity from position change
        r_mag   = np.linalg.norm(r2)
        a_km    = r_mag
        mu      = 398600.4418
        omega   = math.sqrt(mu / a_km**3)  # rad/sec

        # Rotation axis: cross product of r1, r2
        h = np.cross(r1, r2)
        h_mag = np.linalg.norm(h)
        if h_mag < 1e-6:
            h = np.array([0.0, 0.0, 1.0])
        else:
            h = h / h_mag

        def rotate(v, axis, angle):
            c, s = math.cos(angle), math.sin(angle)
            return (v * c
                    + np.cross(axis, v) * s
                    + axis * np.dot(axis, v) * (1 - c))

        angle_step = omega * STEP_SEC

        future = []
        pos = r2.copy()
        for k in range(N_FUTURE):
            pos = rotate(pos, h, angle_step)
            future.append({
                "x": float(pos[0]),
                "y": float(pos[1]),
                "z": float(pos[2]),
                "t_offset_sec": (k + 1) * STEP_SEC,
            })

        return future


# ── Public API ─────────────────────────────────────────────────────────────────

_predictor: Optional[OrbitalLSTM] = None


def get_predictor() -> OrbitalLSTM:
    global _predictor
    if _predictor is None:
        _predictor = OrbitalLSTM()
    return _predictor


def generate_history(satrec, epoch_unix: float) -> List[Dict[str, float]]:
    """
    Generate N_HISTORY past positions by backward-propagating TLE.
    Used when no real history is available.
    """
    from app.propagator import propagate
    from app.eop_loader import get_eop

    eop = get_eop(epoch_unix)
    history = []
    for k in range(N_HISTORY):
        t = epoch_unix - (N_HISTORY - k) * STEP_SEC
        pos = propagate(satrec, t, eop_cache=eop)
        if pos:
            history.append({"x": pos["x"], "y": pos["y"], "z": pos["z"]})
        else:
            # Extrapolate from last known
            if history:
                history.append(history[-1])

    return history


def predict_trajectory(satrec, epoch_unix: float) -> List[Dict[str, float]]:
    """
    Full pipeline: generate history → LSTM predict → return future path.

    Returns list of {x, y, z, t_offset_sec} for 6 hours ahead.
    """
    try:
        pred = get_predictor()
        history = generate_history(satrec, epoch_unix)
        if len(history) < N_HISTORY:
            logger.warning(f"Insufficient history ({len(history)} < {N_HISTORY}), using analytical")
        return pred.predict(history)
    except Exception as e:
        logger.error(f"Trajectory prediction error: {e}")
        return []


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Initializing LSTM predictor…")
    p = OrbitalLSTM()
    # Test with fake history
    fake_history = [
        {"x": 6791 * math.cos(i * 0.05), "y": 6791 * math.sin(i * 0.05), "z": 100 * math.sin(i * 0.1)}
        for i in range(N_HISTORY)
    ]
    future = p.predict(fake_history)
    print(f"Predicted {len(future)} future positions")
    if future:
        print(f"First: x={future[0]['x']:.1f} y={future[0]['y']:.1f} z={future[0]['z']:.1f}")
        print(f"Last:  x={future[-1]['x']:.1f} y={future[-1]['y']:.1f} z={future[-1]['z']:.1f}")
