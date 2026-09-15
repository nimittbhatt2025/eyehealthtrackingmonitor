#!/usr/bin/env python3
"""
Download + organize public ocular images for EyeVio custom training.

Primary source (CC BY 4.0, Zenodo):
  Sikder — Ocular Image Dataset for Eye Disease Classification
  https://doi.org/10.5281/zenodo.18250149

Produces:
  data/raw/zenodo_ocular/          # extracted archive
  data/external_redness/           # normal | conjunctivitis | other  (sclera weak labels)
  data/cataract/{train,val,test}/{normal,cataract}/
  data/pathology/{train,val,test}/<class>/
  train.csv val.csv test.csv       # sclera ordinal splits at repo root

Usage (repo root):
  ./eyevio/venv/bin/python scripts/pull_ocular_datasets.py
  ./eyevio/venv/bin/python scripts/pull_ocular_datasets.py --skip-download  # reorganize only
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA = REPO_ROOT / 'data'
RAW = DATA / 'raw' / 'zenodo_ocular'
ARCHIVE_NAME = (
    'Image Dataset on Eye Diseases Classification '
    '(Uveitis, Conjunctivitis, Cataract, Eyelid) with Symptoms and SMOTE Validation.rar'
)
ZENODO_URL = (
    'https://zenodo.org/api/records/18250149/files/'
    + urllib.request.quote(ARCHIVE_NAME)
    + '/content'
)
EXPECTED_MD5 = '0aa08c999025c02ec4c4fce0fcd143c0'
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}

# Map source folder name (lowercase) → our labels
SCLERA_MAP = {
    'normal': 'normal',
    'conjunctivitis': 'conjunctivitis',
    'uveitis': 'other',  # redness-adjacent but not conjunctivitis
}
CATARACT_POS = {'cataract', 'cataracts'}
CATARACT_NEG = {'normal'}
PATHOLOGY_MAP = {
    'normal': 'normal',
    'conjunctivitis': 'conjunctivitis',
    'cataract': 'cataract',
    'cataracts': 'cataract',
    'eyelid disorders': 'other',
    'eyelid drooping': 'other',
    'eyelid': 'other',
    'uveitis': 'other',
}


def _md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def download_archive(force: bool) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    archive = RAW / ARCHIVE_NAME
    if archive.is_file() and not force:
        digest = _md5(archive)
        if digest == EXPECTED_MD5:
            print(f'Archive already present ({archive.name})')
            return archive
        print(f'Checksum mismatch ({digest}); re-downloading')
    print(f'Downloading Zenodo archive (~43 MB)...')
    print(f'  {ZENODO_URL}')
    urllib.request.urlretrieve(ZENODO_URL, archive)
    digest = _md5(archive)
    if digest != EXPECTED_MD5:
        raise SystemExit(f'MD5 mismatch: got {digest}, expected {EXPECTED_MD5}')
    print(f'Downloaded OK ({digest})')
    return archive


def extract_archive(archive: Path, force: bool) -> Path:
    extract_root = RAW / 'extracted'
    if extract_root.exists() and any(extract_root.rglob('*')) and not force:
        print(f'Extracted tree already present: {extract_root}')
        return extract_root
    if extract_root.exists():
        shutil.rmtree(extract_root)
    extract_root.mkdir(parents=True, exist_ok=True)
    unar = shutil.which('unar')
    if not unar:
        raise SystemExit('unar not found — brew install unar')
    print('Extracting RAR with unar...')
    subprocess.run(
        [unar, '-force-overwrite', '-o', str(extract_root), str(archive)],
        check=True,
    )
    return extract_root


def _normalize_class_name(name: str) -> str:
    return ' '.join(name.replace('_', ' ').replace('-', ' ').split()).strip().lower()


def find_class_dirs(extract_root: Path) -> dict[str, Path]:
    """Locate class folders under the extracted tree."""
    found: dict[str, Path] = {}
    for path in extract_root.rglob('*'):
        if not path.is_dir():
            continue
        key = _normalize_class_name(path.name)
        images = [p for p in path.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
        if len(images) < 5:
            continue
        # Prefer the deepest / most specific folder name
        if key not in found or len(images) > len(list(found[key].glob('*'))):
            found[key] = path
    return found


def _iter_images(directory: Path) -> list[Path]:
    return sorted(
        p for p in directory.rglob('*')
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )


def _hardlink_or_copy(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        return
    try:
        os.link(src, dest)
    except OSError:
        shutil.copy2(src, dest)


def _split_list(items: list, ratios: tuple[float, float, float], seed: int) -> dict[str, list]:
    rng = random.Random(seed)
    items = list(items)
    rng.shuffle(items)
    n = len(items)
    n_train = max(1, int(n * ratios[0])) if n >= 3 else n
    n_val = max(1, int(n * ratios[1])) if n >= 3 else 0
    if n_train + n_val >= n and n >= 3:
        n_val = max(0, n - n_train - 1)
    return {
        'train': items[:n_train],
        'val': items[n_train:n_train + n_val],
        'test': items[n_train + n_val:],
    }


def stage_external_redness(class_dirs: dict[str, Path], limit: int | None) -> dict[str, int]:
    out = DATA / 'external_redness'
    if out.exists():
        shutil.rmtree(out)
    counts: dict[str, int] = {}
    for src_name, label in SCLERA_MAP.items():
        src = class_dirs.get(src_name)
        if not src:
            continue
        files = _iter_images(src)
        if limit:
            files = files[:limit]
        dest_dir = out / label
        for src_file in files:
            digest = hashlib.md5(src_file.read_bytes()).hexdigest()[:10]
            dest = dest_dir / f'EXT-{label[:4]}-{digest}{src_file.suffix.lower()}'
            _hardlink_or_copy(src_file, dest)
        counts[label] = counts.get(label, 0) + len(files)
    return counts


def stage_split_dataset(
    class_dirs: dict[str, Path],
    out_root: Path,
    label_map: dict[str, str],
    ratios: tuple[float, float, float],
    seed: int,
    limit_per_class: int | None,
) -> dict[str, dict[str, int]]:
    if out_root.exists():
        shutil.rmtree(out_root)
    # Gather by target label
    by_label: dict[str, list[Path]] = {}
    for src_name, dest_label in label_map.items():
        src = class_dirs.get(src_name)
        if not src:
            continue
        files = _iter_images(src)
        if limit_per_class:
            files = files[:limit_per_class]
        by_label.setdefault(dest_label, []).extend(files)

    summary: dict[str, dict[str, int]] = {}
    for label, files in by_label.items():
        # de-dupe by content hash
        unique: dict[str, Path] = {}
        for f in files:
            digest = hashlib.md5(f.read_bytes()).hexdigest()
            unique[digest] = f
        splits = _split_list(list(unique.values()), ratios, seed + hash(label) % 10_000)
        for split_name, split_files in splits.items():
            for src_file in split_files:
                dest = out_root / split_name / label / src_file.name
                _hardlink_or_copy(src_file, dest)
            summary.setdefault(split_name, {})[label] = len(split_files)
    return summary


def write_manifest(payload: dict) -> Path:
    path = DATA / 'DATASET_MANIFEST.json'
    path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    return path


def ensure_gitignore() -> None:
    gi = REPO_ROOT / '.gitignore'
    lines = [
        '',
        '# Local training data (large; pull with scripts/pull_ocular_datasets.py)',
        'data/',
        'train.csv',
        'val.csv',
        'test.csv',
        'cataract_detection_resnet18.pth',
        'cataract_class_names.json',
        'pathology_resnet18.pth',
        'pathology_class_names.json',
        'best_unfrozen_ordinal.pth',
        'sclera_redness_ordinal.pth',
    ]
    existing = gi.read_text(encoding='utf-8') if gi.exists() else ''
    if 'data/' in existing and 'train.csv' in existing:
        return
    with gi.open('a', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'Updated {gi}')


def main() -> int:
    parser = argparse.ArgumentParser(description='Pull + organize ocular training datasets')
    parser.add_argument('--skip-download', action='store_true')
    parser.add_argument('--force', action='store_true', help='Re-download / re-extract')
    parser.add_argument('--limit', type=int, default=0, help='Cap images per source class (0=all)')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--ratios', type=float, nargs=3, default=(0.7, 0.15, 0.15))
    parser.add_argument('--skip-csv', action='store_true')
    args = parser.parse_args()
    limit = args.limit if args.limit > 0 else None

    ensure_gitignore()

    if not args.skip_download:
        archive = download_archive(force=args.force)
        extract_root = extract_archive(archive, force=args.force)
    else:
        extract_root = RAW / 'extracted'
        if not extract_root.exists():
            print('No extracted data — run without --skip-download first', file=sys.stderr)
            return 1

    class_dirs = find_class_dirs(extract_root)
    print('Discovered class folders:')
    for name, path in sorted(class_dirs.items()):
        n = len(_iter_images(path))
        print(f'  {name}: {n} → {path.relative_to(extract_root)}')

    needed = {'normal', 'conjunctivitis', 'cataract'}
    missing = needed - set(class_dirs)
    if missing:
        # try singular/plural aliases already in find
        if 'cataracts' in class_dirs:
            class_dirs['cataract'] = class_dirs['cataracts']
            missing.discard('cataract')
    if missing:
        print(f'Missing required classes: {sorted(missing)}', file=sys.stderr)
        return 1

    redness = stage_external_redness(class_dirs, limit)
    print('\nexternal_redness:', redness)

    cataract_map = {**{k: 'cataract' for k in CATARACT_POS}, **{k: 'normal' for k in CATARACT_NEG}}
    cataract_summary = stage_split_dataset(
        class_dirs, DATA / 'cataract', cataract_map, tuple(args.ratios), args.seed, limit,
    )
    print('cataract splits:', json.dumps(cataract_summary, indent=2))

    pathology_summary = stage_split_dataset(
        class_dirs, DATA / 'pathology', PATHOLOGY_MAP, tuple(args.ratios), args.seed + 1, limit,
    )
    print('pathology splits:', json.dumps(pathology_summary, indent=2))

    manifest = {
        'source': {
            'title': 'Ocular Image Dataset for Eye Disease Classification and Screening Research',
            'doi': '10.5281/zenodo.18250149',
            'license': 'CC BY 4.0',
            'url': 'https://zenodo.org/records/18250149',
            'note': 'Research/screening only — not for clinical diagnosis.',
        },
        'external_redness': redness,
        'cataract': cataract_summary,
        'pathology': pathology_summary,
    }
    mpath = write_manifest(manifest)
    print(f'\nManifest → {mpath}')

    if not args.skip_csv:
        split_script = REPO_ROOT / 'scripts' / 'build_sclera_train_split.py'
        cmd = [
            sys.executable,
            str(split_script),
            '--external', str(DATA / 'external_redness'),
            '--images-root', str(DATA),
            '--out-dir', str(REPO_ROOT),
            '--seed', str(args.seed),
        ]
        print('\nBuilding sclera CSVs...')
        subprocess.run(cmd, check=True, cwd=str(REPO_ROOT))

    print('\nDone. Next:')
    print('  ./eyevio/venv/bin/python train_bounded_ordinal.py')
    print('  ./eyevio/venv/bin/python train_cataract_resnet.py --data-root data/cataract')
    print('  ./eyevio/venv/bin/python train_pathology_classifier.py --data-root data/pathology')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
