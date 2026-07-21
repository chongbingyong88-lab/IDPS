"""Download the UNSW-NB15 partition CSV used by the benchmark pipeline.

The file is the official 175,341-record partition of UNSW-NB15 (Moustafa &
Slay, MilCIS 2015) with 45 columns including the binary `label` and the
multiclass `attack_cat`. It is fetched from a public GitHub mirror of the
dataset; the canonical source is the UNSW Canberra research data portal:
https://research.unsw.edu.au/projects/unsw-nb15-dataset

The CSV (~32 MB) is written to ml/data/ which is git-ignored.
"""

import hashlib
import urllib.request

from src import config

URL = (
    "https://raw.githubusercontent.com/abhinav-bhardwaj/"
    "IoT-Network-Intrusion-Detection-System-UNSW-NB15/HEAD/datasets/UNSW_NB15.csv"
)


def main() -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    if config.DATASET_CSV.exists():
        print(f"{config.DATASET_CSV} already exists - skipping download.")
        return
    print(f"Downloading {URL}\n -> {config.DATASET_CSV} (~32 MB) ...")
    urllib.request.urlretrieve(URL, config.DATASET_CSV)
    digest = hashlib.sha256(config.DATASET_CSV.read_bytes()).hexdigest()
    print(f"Done. size={config.DATASET_CSV.stat().st_size:,} bytes sha256={digest[:16]}...")


if __name__ == "__main__":
    main()
