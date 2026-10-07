#!/usr/bin/env python3
"""Modelo NPS próximo ciclo: logística (resposta) + multinomial (categoria)."""
from __future__ import annotations

import json
import math
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PANEL_PATH = ROOT / "data" / "processed" / "nps_prediction_training_panel.json"
OUT_PRED = ROOT / "data" / "processed" / "nps_prediction_next_cycle.json"
OUT_REPORT = ROOT / "data" / "quality" / "nps_prediction_model_report.json"

SEED = 20261006
MODEL_VERSION = "nps-logit-two-step-v1"

NUMERIC_FEATURES = [
    "months_since_entry",
    "cliente_ativo",
    "has_app_access",
    "prior_nps_count",
    "last_nps_score",
    "avg_nps_score",
    "nps_score_delta",
    "days_since_last_nps",
    "meetings_before",
    "mechanisms_implemented",
    "has_implemented_mechanism",
    "ep_transfers_before",
    "payments_before",
    "amount_paid_before",
    "days_since_last_meeting",
]

CAT_FEATURES = ["programa", "safra_trimestre", "tenure_bucket"]
CATEGORIES = ["Promotor", "Neutro", "Detrator"]


def load_panel() -> dict:
    if not PANEL_PATH.is_file():
        raise SystemExit(f"Missing panel: {PANEL_PATH}. Run build-nps-prediction-panel.mjs first.")
    with PANEL_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def try_sklearn():
    try:
        from sklearn.compose import ColumnTransformer
        from sklearn.impute import SimpleImputer
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import (
            average_precision_score,
            brier_score_loss,
            f1_score,
            log_loss,
            roc_auc_score,
        )
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import OneHotEncoder, StandardScaler

        return {
            "ColumnTransformer": ColumnTransformer,
            "SimpleImputer": SimpleImputer,
            "LogisticRegression": LogisticRegression,
            "Pipeline": Pipeline,
            "OneHotEncoder": OneHotEncoder,
            "StandardScaler": StandardScaler,
            "roc_auc_score": roc_auc_score,
            "average_precision_score": average_precision_score,
            "brier_score_loss": brier_score_loss,
            "f1_score": f1_score,
            "log_loss": log_loss,
        }
    except ImportError:
        return None


def rows_to_table(rows: list) -> tuple[list[dict], np.ndarray, np.ndarray | None]:
    y_resp = np.array([r["responded"] for r in rows], dtype=int)
    y_cat = []
    for r in rows:
        if r["responded"] == 1 and r.get("category") in CATEGORIES:
            y_cat.append(r["category"])
        else:
            y_cat.append(None)
    return rows, y_resp, np.array(y_cat, dtype=object)


def aggregate_nps(probs_r: np.ndarray, probs_cat: np.ndarray) -> float:
    num = 0.0
    den = 0.0
    for i in range(len(probs_r)):
        r = float(probs_r[i])
        if r <= 0:
            continue
        p_prom = float(probs_cat[i, 0])
        p_det = float(probs_cat[i, 2])
        num += r * (p_prom - p_det)
        den += r
    if den <= 0:
        return float("nan")
    return round(100.0 * num / den, 1)


def nps_from_labels(rows: list, cycle: str) -> float | None:
    scores = [r["score"] for r in rows if r["cycle"] == cycle and r["responded"] == 1]
    if not scores:
        return None
    prom = sum(1 for s in scores if s >= 9)
    det = sum(1 for s in scores if s <= 6)
    return round(100.0 * (prom - det) / len(scores), 1)


def build_preprocessor(sk):
    num_pipe = sk["Pipeline"](
        [
            ("imp", sk["SimpleImputer"](strategy="median")),
            ("scale", sk["StandardScaler"]()),
        ]
    )
    cat_pipe = sk["Pipeline"](
        [
            ("imp", sk["SimpleImputer"](strategy="constant", fill_value="Não informado")),
            (
                "oh",
                sk["OneHotEncoder"](handle_unknown="ignore", max_categories=12, sparse_output=False),
            ),
        ]
    )
    return sk["ColumnTransformer"](
        [
            ("num", num_pipe, NUMERIC_FEATURES),
            ("cat", cat_pipe, CAT_FEATURES),
        ]
    )


def features_frame(rows: list) -> pd.DataFrame:
    return pd.DataFrame([r["features"] for r in rows])


def fit_response_model(sk, train_rows):
    _, y, _ = rows_to_table(train_rows)
    if len(set(y.tolist())) < 2:
        return None
    X = features_frame(train_rows)
    pre = build_preprocessor(sk)
    clf = sk["LogisticRegression"](
        penalty="l2",
        C=1.0,
        class_weight="balanced",
        max_iter=2000,
        random_state=SEED,
    )
    pipe = sk["Pipeline"]([("pre", pre), ("clf", clf)])
    pipe.fit(X, y)
    return pipe


def fit_category_model(sk, train_rows):
    cat_rows = [r for r in train_rows if r["responded"] == 1 and r.get("category") in CATEGORIES]
    if len(cat_rows) < 30:
        return None
    y = np.array([r["category"] for r in cat_rows], dtype=object)
    if len(set(y.tolist())) < 2:
        return None
    X = features_frame(cat_rows)
    pre = build_preprocessor(sk)
    clf = sk["LogisticRegression"](
        penalty="l2",
        C=1.0,
        solver="lbfgs",
        max_iter=2500,
        random_state=SEED,
    )
    pipe = sk["Pipeline"]([("pre", pre), ("clf", clf)])
    pipe.fit(X, y)
    return pipe


def predict_proba_cat(pipe, X, sk_available: bool) -> np.ndarray:
    if pipe is None:
        priors = np.array([0.5, 0.25, 0.25])
        return np.tile(priors, (len(X), 1))
    proba = pipe.predict_proba(X)
    classes = list(pipe.named_steps["clf"].classes_)
    out = np.zeros((len(X), 3))
    for j, c in enumerate(CATEGORIES):
        if c in classes:
            out[:, j] = proba[:, classes.index(c)]
    row_s = out.sum(axis=1, keepdims=True)
    row_s[row_s == 0] = 1
    return out / row_s


def predict_proba_resp(pipe, X) -> np.ndarray:
    if pipe is None:
        return np.full(len(X), 0.35)
    return pipe.predict_proba(X)[:, 1]


def temporal_folds(cycles: list[str]) -> list[tuple[list[str], str]]:
    folds = []
    for i in range(2, len(cycles)):
        folds.append((cycles[:i], cycles[i]))
    return folds


def main() -> None:
    random.seed(SEED)
    np.random.seed(SEED)

    panel = load_panel()
    sk = try_sklearn()
    if sk is None:
        out = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "error": "scikit-learn not installed; pip install -r requirements-model.txt",
            "model_version": MODEL_VERSION,
        }
        OUT_PRED.parent.mkdir(parents=True, exist_ok=True)
        OUT_PRED.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        raise SystemExit(2)

    rows = panel["rows"]
    cycles = panel["meta"]["official_cycles"]
    folds_meta = []
    nps_errors = []

    for train_cycles, test_cycle in temporal_folds(cycles):
        train_rows = [r for r in rows if r["cycle"] in train_cycles]
        test_rows = [r for r in rows if r["cycle"] == test_cycle]
        if not test_rows:
            continue

        resp_pipe = fit_response_model(sk, train_rows)
        cat_pipe = fit_category_model(sk, train_rows)

        X_test = features_frame(test_rows)
        pr = predict_proba_resp(resp_pipe, X_test)
        pc = predict_proba_cat(cat_pipe, X_test, True)
        pred_nps = aggregate_nps(pr, pc)
        actual = nps_from_labels(test_rows, test_cycle)
        if actual is None:
            for c in panel["cycles"]:
                if c["ciclo"] == test_cycle:
                    actual = c.get("nps_official")
        err = None if actual is None or math.isnan(pred_nps) else abs(pred_nps - actual)

        y_test = np.array([r["responded"] for r in test_rows])
        fold_info = {
            "train_cycles": train_cycles,
            "test_cycle": test_cycle,
            "n_train": len(train_rows),
            "n_test": len(test_rows),
            "nps_predicted": pred_nps,
            "nps_actual": actual,
            "nps_abs_error": err,
        }
        if resp_pipe is not None and len(set(y_test.tolist())) > 1:
            try:
                fold_info["response_roc_auc"] = float(
                    sk["roc_auc_score"](y_test, pr)
                )
                fold_info["response_brier"] = float(sk["brier_score_loss"](y_test, pr))
            except ValueError:
                pass
        folds_meta.append(fold_info)
        if err is not None:
            nps_errors.append(err)

    mae_nps = round(float(np.mean(nps_errors)), 2) if nps_errors else None

    # Baselines on same folds
    baseline_last = []
    baseline_mean = []
    official_by = {c["ciclo"]: c.get("nps_official") for c in panel["cycles"]}
    for f in folds_meta:
        test = f["test_cycle"]
        idx = cycles.index(test)
        if idx <= 0:
            continue
        prev = official_by.get(cycles[idx - 1])
        hist = [official_by.get(cycles[j]) for j in range(idx) if official_by.get(cycles[j]) is not None]
        actual = f["nps_actual"]
        if prev is not None and actual is not None:
            baseline_last.append(abs(prev - actual))
        if hist and actual is not None:
            baseline_mean.append(abs(float(np.mean(hist)) - actual))
    mae_baseline_last = round(float(np.mean(baseline_last)), 2) if baseline_last else None
    mae_baseline_mean = round(float(np.mean(baseline_mean)), 2) if baseline_mean else None

    # Final fit on all historical rows
    resp_final = fit_response_model(sk, rows)
    cat_final = fit_category_model(sk, rows)

    proj = panel["projection_universe"]
    X_proj = features_frame(proj)
    pr_proj = predict_proba_resp(resp_final, X_proj)
    pc_proj = predict_proba_cat(cat_final, X_proj, True)
    expected_nps = aggregate_nps(pr_proj, pc_proj)

    # Composition (weighted by response prob)
    w = pr_proj
    wsum = w.sum() or 1
    p_pct = float((w * pc_proj[:, 0]).sum() / wsum * 100)
    n_pct = float((w * pc_proj[:, 1]).sum() / wsum * 100)
    d_pct = float((w * pc_proj[:, 2]).sum() / wsum * 100)
    expected_responses = int(round(w.sum()))

    # Bootstrap interval
    boots = []
    rng = np.random.default_rng(SEED)
    n = len(proj)
    for _ in range(500):
        idx = rng.integers(0, n, n)
        boots.append(aggregate_nps(pr_proj[idx], pc_proj[idx]))
    boots = [b for b in boots if not math.isnan(b)]
    interval_low = round(float(np.percentile(boots, 10)), 1) if boots else None
    interval_high = round(float(np.percentile(boots, 90)), 1) if boots else None

    last_nps = official_by.get(panel["meta"]["last_official_cycle"])
    delta_vs_last = (
        round(expected_nps - last_nps, 1)
        if last_nps is not None and not math.isnan(expected_nps)
        else None
    )

    trustworthy = (
        mae_nps is not None
        and mae_baseline_last is not None
        and mae_nps <= mae_baseline_last * 1.15
        and len(rows) >= 500
    )

    drivers = []
    if cat_final is not None:
        clf = cat_final.named_steps["clf"]
        pre = cat_final.named_steps["pre"]
        try:
            names = pre.get_feature_names_out()
            coefs = clf.coef_
            prom_idx = list(clf.classes_).index("Promotor") if "Promotor" in clf.classes_ else 0
            vec = coefs[prom_idx]
            pairs = sorted(zip(names, vec), key=lambda x: abs(x[1]), reverse=True)[:8]
            for name, val in pairs:
                drivers.append(
                    {
                        "variable": str(name),
                        "direction": "positiva" if val > 0 else "negativa",
                        "intensity": "forte" if abs(val) > 0.25 else "moderada",
                        "interpretation": f"associada no modelo à probabilidade de Promotor (coef. {val:.3f})",
                    }
                )
        except Exception:
            pass

    target_cycle = panel["meta"]["target_cycle"]
    cutoff = panel["meta"]["as_of"]

    prediction_doc = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cutoff_date": cutoff,
        "target_cycle": target_cycle,
        "model_version": MODEL_VERSION,
        "seed": SEED,
        "model": {
            "type": "Modelagem preditiva supervisionada",
            "response_model": "Regressão logística (L2, class_weight=balanced)",
            "category_model": "Regressão logística multinomial (L2)",
            "regularization": "L2",
            "features": NUMERIC_FEATURES + CAT_FEATURES,
            "unit": "cliente",
            "formula":
                "NPS = 100 × Σ(rᵢ × (Pᵢ,Promotor − Pᵢ,Detrator)) / Σ(rᵢ)",
        },
        "prediction": {
            "expected_nps": expected_nps,
            "interval_low": interval_low,
            "interval_high": interval_high,
            "expected_promoter_pct": round(p_pct, 1),
            "expected_neutral_pct": round(n_pct, 1),
            "expected_detractor_pct": round(d_pct, 1),
            "expected_responses": expected_responses,
            "eligible_clients": len(proj),
            "last_official_nps": last_nps,
            "delta_vs_last_official": delta_vs_last,
            "trustworthy": trustworthy,
            "disclaimer":
                "Estimativa estatística baseada em padrões históricos; não é garantia do resultado futuro.",
        },
        "validation": {
            "folds": folds_meta,
            "mae_nps": mae_nps,
            "mae_baseline_last_nps": mae_baseline_last,
            "mae_baseline_mean_nps": mae_baseline_mean,
            "temporal_folds": len(folds_meta),
        },
        "drivers": drivers,
        "quality": {
            "training_rows": len(rows),
            "training_responses": sum(1 for r in rows if r["responded"] == 1),
            "training_clients": len({r["client_id"] for r in rows}),
            "cycles": len(cycles),
            "warnings": []
            if trustworthy
            else [
                "Modelo ainda sem evidência suficiente para projeção confiável; use com cautela.",
            ],
        },
        "backtest": [
            {
                "cycle": f["test_cycle"],
                "nps_predicted": f["nps_predicted"],
                "nps_actual": f["nps_actual"],
                "error": f["nps_abs_error"],
            }
            for f in folds_meta
        ],
    }

    report = {
        "generated_at": prediction_doc["generated_at"],
        "panel_path": str(PANEL_PATH.relative_to(ROOT)),
        "training_rows": len(rows),
        "cycles": panel["cycles"],
        "missingness": {},
        "folds": folds_meta,
        "mae_nps": mae_nps,
        "baselines": {
            "last_nps": mae_baseline_last,
            "mean_history": mae_baseline_mean,
        },
        "features": NUMERIC_FEATURES + CAT_FEATURES,
        "warnings": prediction_doc["quality"]["warnings"],
    }

    OUT_PRED.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_PRED.write_text(json.dumps(prediction_doc, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PRED.name}, MAE NPS={mae_nps}, projected NPS={expected_nps} ({target_cycle})")


if __name__ == "__main__":
    main()
