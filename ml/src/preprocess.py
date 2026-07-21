"""Data loading and preprocessing for UNSW-NB15.

Implements the preprocessing objectives from Assignment 1:
  clean -> encode -> normalize -> balance -> feature-select

Design notes
------------
* The transformer (one-hot encoder + scaler) is FIT ON THE TRAINING SPLIT ONLY
  and then applied to the test split, so no information leaks from test data.
* `attack_cat` (the multiclass family label) is never shown to the models; it is
  kept aside purely so results can be broken down per attack family.
* Class imbalance (attack 68% / normal 32%) is handled with cost-sensitive
  learning (class weights / scale_pos_weight) rather than synthetic
  oversampling; rare families are preserved by stratifying the split on
  `attack_cat`.
"""

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_selection import mutual_info_classif
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from . import config


@dataclass
class Dataset:
    """Fully preprocessed dataset plus bookkeeping used for the report."""

    X_train: np.ndarray
    X_test: np.ndarray
    y_train: np.ndarray
    y_test: np.ndarray
    attack_cat_test: pd.Series          # family label per test row (analysis only)
    feature_names: list[str]            # names after encoding + selection
    mi_ranking: pd.Series               # mutual information of ALL encoded features
    info: dict = field(default_factory=dict)  # cleaning/split stats for the report


def load_raw(path=config.DATASET_CSV) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found - run `python download_data.py` first."
        )
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()
    return df


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Drop identifiers, duplicates and non-finite values."""
    info = {"rows_raw": len(df)}

    df = df.drop(columns=["id"], errors="ignore")

    # Normalize the categorical placeholders ('-' means "no service").
    for col in ("proto", "service", "state"):
        df[col] = df[col].astype(str).str.strip().str.lower().replace({"-": "none"})

    before = len(df)
    df = df.drop_duplicates()
    info["duplicates_removed"] = before - len(df)

    # Replace infinities, then impute any missing numerics with the median.
    df = df.replace([np.inf, -np.inf], np.nan)
    info["missing_values"] = int(df.isna().sum().sum())
    num_cols = df.select_dtypes(include=[np.number]).columns
    df[num_cols] = df[num_cols].fillna(df[num_cols].median())

    info["rows_clean"] = len(df)
    return df, info


def build_dataset() -> Dataset:
    """Run the full preprocessing chain and return model-ready matrices."""
    df, info = clean(load_raw())

    y = df["label"].astype(int)
    attack_cat = df["attack_cat"]
    X = df.drop(columns=["label", "attack_cat"])

    cat_cols = ["proto", "service", "state"]
    num_cols = [c for c in X.columns if c not in cat_cols]
    info["n_numeric"] = len(num_cols)
    info["n_categorical"] = len(cat_cols)

    # Stratify on the attack FAMILY so rare families (e.g. Worms, n=130)
    # appear in both splits in the same proportion.
    X_tr, X_te, y_tr, y_te, cat_tr, cat_te = train_test_split(
        X, y, attack_cat,
        test_size=config.TEST_SIZE,
        stratify=attack_cat,
        random_state=config.SEED,
    )
    info["rows_train"], info["rows_test"] = len(X_tr), len(X_te)
    info["train_class_counts"] = y_tr.value_counts().to_dict()
    info["test_class_counts"] = y_te.value_counts().to_dict()

    # Encode + normalize. Fit on train only.
    transformer = ColumnTransformer(
        [
            ("num", StandardScaler(), num_cols),
            ("cat", OneHotEncoder(
                handle_unknown="ignore",
                min_frequency=config.RARE_CATEGORY_MIN_FREQ,
                sparse_output=False,
            ), cat_cols),
        ],
        verbose_feature_names_out=False,
    )
    Xt_tr = transformer.fit_transform(X_tr)
    Xt_te = transformer.transform(X_te)
    encoded_names = list(transformer.get_feature_names_out())
    info["n_features_encoded"] = len(encoded_names)

    # Feature selection: mutual information, estimated on a training subsample.
    rng = np.random.RandomState(config.SEED)
    idx = rng.choice(len(Xt_tr), size=min(config.MI_SAMPLE, len(Xt_tr)), replace=False)
    mi = mutual_info_classif(Xt_tr[idx], y_tr.iloc[idx], random_state=config.SEED)
    mi_ranking = pd.Series(mi, index=encoded_names).sort_values(ascending=False)

    top = mi_ranking.head(config.TOP_K_FEATURES).index
    keep = [encoded_names.index(name) for name in top]
    info["n_features_selected"] = len(keep)

    # Cost-sensitive class weighting (balancing strategy).
    neg, pos = int((y_tr == 0).sum()), int((y_tr == 1).sum())
    info["scale_pos_weight"] = neg / pos

    return Dataset(
        X_train=Xt_tr[:, keep],
        X_test=Xt_te[:, keep],
        y_train=y_tr.to_numpy(),
        y_test=y_te.to_numpy(),
        attack_cat_test=cat_te.reset_index(drop=True),
        feature_names=list(top),
        mi_ranking=mi_ranking,
        info=info,
    )
