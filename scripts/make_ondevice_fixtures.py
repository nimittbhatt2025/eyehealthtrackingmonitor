"""
Fixtures for the on-device parity test (eyevio-frontend/scripts/run-ondevice-parity-tests.mjs).

Each fixture is a frame + Face Mesh-style landmarks + the values the *server*
pipeline produces for it, so the browser port can be checked number by number.

  committed:  eyevio-frontend/tests/fixtures/ondevice/        synthetic eye frames (license-free)
  local only: eyevio-frontend/tests/fixtures/ondevice-local/  real dataset crops pasted into frames
                                                             (--local; gitignored)

Reference values:
  heuristics      dry_eye_analysis.measure_sclera_redness / analyze_tear_film_surface / estimate_white_balance
  ML patch        ocular_ml_preprocess.ml_eye_patches_from_landmarks (the exact uint8 patch)
  redness score   PyTorch production model (single pass) and the browser ONNX variant run by Python ORT
  cataract        browser ONNX variant run by Python ORT + the server's screen_cataract abstain decision
"""

from __future__ import annotations

import argparse
import gzip
import json
import random
import sys
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import onnxruntime as ort
import torch
import torch.nn.functional as F
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'eyevio'))

from app.ai_models.cataract_opacity_analysis import pupil_image_metrics  # noqa: E402
from app.ai_models.cataract_resnet import screen_cataract  # noqa: E402
from app.ai_models.cnn_explain import central_mass  # noqa: E402
from app.ai_models.dry_eye_analysis import (  # noqa: E402
    _landmark_bbox,
    analyze_tear_film_surface,
    estimate_white_balance,
    measure_sclera_redness,
)
from app.ai_models.ocular_ml_preprocess import LEFT_EYE_REGION, RIGHT_EYE_REGION, ml_eye_patches_from_landmarks  # noqa: E402
from app.ai_models.sclera_redness_model import _load_model_bundle, _predict_pil, bgr_to_rgb_pil  # noqa: E402

OUT = ROOT / 'eyevio-frontend' / 'tests' / 'fixtures'
MANIFEST = json.loads((ROOT / 'onnx_models' / 'manifest.json').read_text())
N_LANDMARKS = 478
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


def tensor_from_rgb(rgb: np.ndarray) -> np.ndarray:
    arr = np.asarray(Image.fromarray(rgb).resize((224, 224), Image.BILINEAR), np.float32) / 255.0
    return ((arr - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)


def session(name: str) -> ort.InferenceSession:
    entry = MANIFEST[name]
    path = ROOT / 'onnx_models' / entry['files'][entry['browser_variant']]['file']
    return ort.InferenceSession(str(path), providers=['CPUExecutionProvider'])


def eye_landmarks(cx: float, cy: float, rx: float, ry: float, w: int, h: int, indices):
    """Place the eye-region landmark indices on an ellipse (normalised coords)."""
    pts = {}
    for k, idx in enumerate(indices):
        a = 2 * np.pi * k / len(indices)
        pts[idx] = ((cx + rx * np.cos(a)) / w, (cy + ry * np.sin(a)) / h)
    return pts


def build_landmarks(w, h, left, right):
    lm = [[0.5, 0.5] for _ in range(N_LANDMARKS)]
    for pts in (eye_landmarks(*left, w, h, LEFT_EYE_REGION), eye_landmarks(*right, w, h, RIGHT_EYE_REGION)):
        for idx, (x, y) in pts.items():
            lm[idx] = [float(x), float(y)]
    return lm


def draw_eye(img, cx, cy, rx, ry, rng, redness, iris_bgr):
    sclera = np.array([228, 232, 238], np.float32)
    sclera = sclera + np.array([-redness * 0.6, -redness * 0.8, redness * 0.35])
    cv2.ellipse(img, (int(cx), int(cy)), (int(rx * 1.25), int(ry * 1.6)), 0, 0, 360, tuple(float(c) for c in np.clip(sclera, 0, 255)), -1)
    for _ in range(int(3 + redness / 6)):
        x0 = cx + rng.uniform(-rx, rx)
        y0 = cy + rng.uniform(-ry, ry)
        x1 = x0 + rng.uniform(-rx * 0.5, rx * 0.5)
        y1 = y0 + rng.uniform(-ry * 0.4, ry * 0.4)
        cv2.line(img, (int(x0), int(y0)), (int(x1), int(y1)), (70, 60, 190), 1, cv2.LINE_AA)
    cv2.circle(img, (int(cx), int(cy)), int(ry * 0.95), iris_bgr, -1, cv2.LINE_AA)
    cv2.circle(img, (int(cx), int(cy)), int(ry * 0.42), (20, 18, 16), -1, cv2.LINE_AA)
    cv2.circle(img, (int(cx + ry * 0.3), int(cy - ry * 0.3)), max(1, int(ry * 0.15)), (250, 250, 250), -1, cv2.LINE_AA)


def synthetic_frame(seed: int):
    rng = random.Random(seed)
    w, h = 480, 360
    skin = np.array([rng.uniform(90, 170), rng.uniform(120, 190), rng.uniform(160, 225)], np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    shade = 1 - 0.25 * ((xx - w / 2) ** 2 + (yy - h / 2) ** 2) / (w * w / 4)
    img = np.clip(skin[None, None] * shade[..., None], 0, 255).astype(np.uint8)
    redness = rng.uniform(0, 40)
    iris = (int(rng.uniform(20, 90)), int(rng.uniform(40, 110)), int(rng.uniform(60, 140)))
    ry = rng.uniform(9, 16)
    rx = ry * rng.uniform(2.0, 2.6)
    cy = h * rng.uniform(0.38, 0.46)
    left = (w * 0.33, cy, rx, ry)
    right = (w * 0.67, cy + rng.uniform(-4, 4), rx, ry)
    for (cx, cyy, rxx, ryy) in (left, right):
        draw_eye(img, cx, cyy, rxx, ryy, rng, redness, iris)
    cast = np.array([rng.uniform(0.85, 1.15), 1.0, rng.uniform(0.85, 1.2)], np.float32)
    noise = np.random.default_rng(seed).normal(0, rng.uniform(0.8, 2.5), img.shape).astype(np.float32)
    img = np.clip(img.astype(np.float32) * cast + noise, 0, 255).astype(np.uint8)
    if seed % 3 == 0:
        img = cv2.GaussianBlur(img, (3, 3), 0)
    return img, build_landmarks(w, h, left, right)


def local_frames(limit: int):
    """Real macro eye photos pasted into a skin-toned frame (dataset images stay local)."""
    pools = [sorted((ROOT / 'data' / d).rglob('*.jp*g')) for d in ('external_redness', 'cataract')]
    rng = random.Random(7)
    for pool in pools:
        for path in rng.sample(pool, min(limit, len(pool))):
            eye = cv2.imread(str(path))
            if eye is None:
                continue
            w, h = 640, 400
            frame = np.full((h, w, 3), (120, 150, 190), np.uint8)
            tile_w, tile_h = 240, 160
            tile = cv2.resize(eye, (tile_w, tile_h), interpolation=cv2.INTER_AREA)
            boxes = []
            for x0 in (60, 340):
                y0 = 110
                frame[y0:y0 + tile_h, x0:x0 + tile_w] = tile if x0 == 60 else cv2.flip(tile, 1)
                boxes.append((x0 + tile_w / 2, y0 + tile_h / 2, tile_w * 0.3, tile_h * 0.22))
            yield path.stem, frame, build_landmarks(w, h, boxes[0], boxes[1])


def reference(frame_bgr, lm_list, sclera_sess, cat_sess, sclera_bundle):
    h, w = frame_bgr.shape[:2]
    lm = [SimpleNamespace(x=x, y=y) for x, y in lm_list]
    wb = estimate_white_balance(frame_bgr)
    patches, _ = ml_eye_patches_from_landmarks(frame_bgr, lm)
    redness_ref, cataract_ref, patch_blobs = {}, {}, {}
    for side, indices in (('left', LEFT_EYE_REGION), ('right', RIGHT_EYE_REGION)):
        x0, y0, x1, y1 = _landmark_bbox(lm, indices, w, h)
        crop = frame_bgr[y0:y1, x0:x1]
        patch = patches[side]
        rgb_patch = cv2.cvtColor(patch, cv2.COLOR_BGR2RGB)
        torch_score, _, _ = _predict_pil(sclera_bundle['model'], sclera_bundle['device'], bgr_to_rgb_pil(patch), use_tta=False)
        ort_score = float(sclera_sess.run(None, {sclera_sess.get_inputs()[0].name: tensor_from_rgb(rgb_patch)})[0].reshape(-1)[0])
        redness_ref[side] = {
            'redness': measure_sclera_redness(crop, side=side, white_balance=wb),
            'surface': analyze_tear_film_surface(crop),
            'bbox': [x0, y0, x1, y1],
            'patch_shape': list(patch.shape[:2]),
            'score_torch': round(float(np.clip(torch_score, 0, 4)), 4),
            'score_ort': round(float(np.clip(ort_score, 0, 4)), 4),
        }
        patch_blobs[side] = rgb_patch

        cx0, cy0, cx1, cy1 = _landmark_bbox(lm, indices, w, h, pad_x=0.45, pad_y=0.55)
        eye = frame_bgr[cy0:cy1, cx0:cx1]
        prob, _, ood, cam = cat_sess.run(None, {cat_sess.get_inputs()[0].name: tensor_from_rgb(cv2.cvtColor(eye, cv2.COLOR_BGR2RGB))})
        cam_t = torch.from_numpy(cam[0].astype(np.float32))
        up = F.interpolate(cam_t[None, None], size=(224, 224), mode='bilinear', align_corners=False)[0, 0]
        up = (up - up.min()) / (up.max() - up.min() + 1e-8)
        server = screen_cataract(eye, with_cam=False)
        cataract_ref[side] = {
            'bbox': [cx0, cy0, cx1, cy1],
            'prob': float(prob.reshape(-1)[0]),
            'ood_score': float(ood.reshape(-1)[0]),
            'cam_central_mass': round(central_mass(up.numpy()), 4),
            'server_status': server.get('status'),
            'server_likelihood': server.get('likelihood'),
            'image_metrics': pupil_image_metrics(eye),
        }
    return {'white_balance': wb, 'redness': redness_ref, 'cataract': cataract_ref}, patch_blobs


def write_fixture(out_dir: Path, name: str, frame_bgr, landmarks, ref, patches):
    out_dir.mkdir(parents=True, exist_ok=True)
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    (out_dir / f'{name}.rgb.gz').write_bytes(gzip.compress(rgb.tobytes(), 9, mtime=0))
    for side, patch in patches.items():
        (out_dir / f'{name}.{side}.patch.rgb.gz').write_bytes(gzip.compress(patch.tobytes(), 9, mtime=0))
    meta = {'name': name, 'width': rgb.shape[1], 'height': rgb.shape[0], 'landmarks': landmarks, 'expected': ref}
    (out_dir / f'{name}.json').write_text(json.dumps(meta, separators=(',', ':')))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--synthetic', type=int, default=6)
    ap.add_argument('--local', type=int, default=0, help='real dataset crops per dataset (not committed)')
    args = ap.parse_args()

    sclera_sess, cat_sess = session('sclera_redness'), session('cataract_screen')
    bundle = _load_model_bundle()
    for i in range(args.synthetic):
        frame, lm = synthetic_frame(1000 + i)
        ref, patches = reference(frame, lm, sclera_sess, cat_sess, bundle)
        write_fixture(OUT / 'ondevice', f'synthetic_{i:02d}', frame, lm, ref, patches)
    count = 0
    if args.local:
        for stem, frame, lm in local_frames(args.local):
            ref, patches = reference(frame, lm, sclera_sess, cat_sess, bundle)
            write_fixture(OUT / 'ondevice-local', f'local_{count:02d}', frame, lm, ref, patches)
            count += 1
    print(f'wrote {args.synthetic} synthetic and {count} local fixtures to {OUT}')


if __name__ == '__main__':
    main()
