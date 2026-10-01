#!/usr/bin/env python3
"""
Export the cataract screener and sclera redness model to ONNX (fp32 + static
int8), check parity against PyTorch on the held-out test sets, benchmark CPU
latency, and measure whether redness test-time augmentation (TTA) earns its cost.

The cataract graph returns everything the app needs from one forward pass, so
browser and server compute it identically:
  prob       temperature-scaled P(cataract)           [N]
  logits     raw logits                               [N, 2]
  ood_score  max over layers of Mahalanobis / scale   [N]
  cam        class activation map on layer4 (7×7)     [N, 7, 7]
With global-average pooling followed by one linear layer, Grad-CAM on layer4
equals CAM (the gradient of the logit w.r.t. each layer4 activation is the fc
weight / HW), so no backward pass is needed.

The redness graph returns the clamped 0–4 score.

Outputs (repo root):
  onnx_models/{cataract_screen,sclera_redness}.{fp32,int8}.onnx
  onnx_models/manifest.json
  eyevio-frontend/public/models/  (copies for the browser)
  docs/model_cards/assets/onnx_export_report.json

Usage:
  ./eyevio/venv/bin/python scripts/export_onnx.py [--skip-int8] [--calib 128]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import shutil
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'eyevio'))
sys.path.insert(0, str(REPO))

from app.ai_models.cnn_explain import OOD_LAYERS, layer_distances, ood_score  # noqa: E402
from train_cataract_resnet import IMG_EXT, _dedupe, _list_split, webcam_sim  # noqa: E402

OUT = REPO / 'onnx_models'
WEB_OUT = REPO / 'eyevio-frontend' / 'public' / 'models'
REPORT = REPO / 'docs' / 'model_cards' / 'assets' / 'onnx_export_report.json'
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
OPSET = 17


def preprocess(img: Image.Image) -> np.ndarray:
    """Same as torchvision Resize((224,224)) + ToTensor + Normalize on a PIL image."""
    arr = np.asarray(img.convert('RGB').resize((224, 224), Image.BILINEAR), dtype=np.float32) / 255.0
    return ((arr - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)


# ─── wrappers ────────────────────────────────────────────────────────────────

class CataractScreenNet(nn.Module):
    def __init__(self, resnet: nn.Module, ood: dict, temperature: float, pos_idx: int):
        super().__init__()
        self.net = resnet
        self.pos_idx = pos_idx
        self.register_buffer('temperature', torch.tensor(float(temperature)))
        for name in OOD_LAYERS:
            self.register_buffer(f'{name}_means', torch.from_numpy(ood[f'{name}_means']).float())
            self.register_buffer(f'{name}_prec', torch.from_numpy(ood[f'{name}_prec']).float())
        self.register_buffer('scales', torch.tensor([float(s) for s in ood['scales']]).clamp_min(1e-6))

    def forward(self, x):
        m = self.net
        h = m.maxpool(m.relu(m.bn1(m.conv1(x))))
        ratios = []
        for i, name in enumerate(OOD_LAYERS):
            h = getattr(m, name)(h)
            f = h.mean(dim=(2, 3))
            d = f.unsqueeze(1) - getattr(self, f'{name}_means').unsqueeze(0)  # N, C, D
            q = (torch.matmul(d, getattr(self, f'{name}_prec')) * d).sum(-1)  # N, C
            dist = torch.sqrt(torch.clamp(q, min=0.0)).min(dim=1).values
            ratios.append(dist / self.scales[i])
            if name == 'layer4':
                pooled, maps = f, h
        logits = m.fc(pooled)
        # Two classes: softmax(l/T)[pos] == sigmoid((l_pos - l_other)/T). Avoids a Softmax node,
        # which onnxruntime's static quantiser mishandles when only Conv/Gemm are quantised.
        margin = logits[:, self.pos_idx] - logits[:, 1 - self.pos_idx]
        prob = torch.sigmoid(margin / self.temperature)
        ood = torch.stack(ratios, dim=1).max(dim=1).values
        w = m.fc.weight[self.pos_idx].view(1, -1, 1, 1)
        cam = torch.relu((maps * w).sum(1))
        return prob, logits, ood, cam


class ScleraNet(nn.Module):
    def __init__(self, model: nn.Module):
        super().__init__()
        self.model = model

    def forward(self, x):
        return self.model(x)


def load_cataract():
    from app.ai_models import cataract_resnet as cr

    cr._bundle, cr._load_attempted = None, False
    b = cr._get_bundle()
    if not b or not b['calibrated']:
        raise SystemExit('Calibrated cataract model not found')
    net = b['model'].to('cpu').eval()
    wrapped = CataractScreenNet(net, b['ood'], b['meta']['temperature'], b['pos_idx']).eval()
    return wrapped, b


def load_sclera():
    from app.ai_models.sclera_redness_model import _architecture_from_state, _build_model, _resolve_weights_path

    path = _resolve_weights_path()
    state = torch.load(path, map_location='cpu')
    model = _build_model(_architecture_from_state(state))
    model.load_state_dict(state)
    return ScleraNet(model.eval()).eval(), str(path)


# ─── data ────────────────────────────────────────────────────────────────────

def cataract_data():
    root = REPO / 'data' / 'cataract'
    classes = sorted(d.name for d in (root / 'train').iterdir() if d.is_dir())
    train = _list_split(root / 'train', classes)
    _, test, _ = _dedupe(train, _list_split(root / 'val', classes), _list_split(root / 'test', classes))
    pos = next(i for i, c in enumerate(classes) if 'cataract' in c.lower())
    return train, test, pos


def redness_data():
    index = {p.name: p for p in (REPO / 'data' / 'external_redness').rglob('*') if p.suffix.lower() in IMG_EXT}

    def rows(name):
        with (REPO / name).open(newline='') as fh:
            return [(index[r['image_id']], int(r['sclera_redness_grade_0_to_4']))
                    for r in csv.DictReader(fh) if r['image_id'] in index]

    return rows('train.csv'), rows('test.csv')


# ─── export / quantise ───────────────────────────────────────────────────────

def export(model, path: Path, output_names, dynamic_out):
    x = torch.from_numpy(np.zeros((1, 3, 224, 224), dtype=np.float32))
    torch.onnx.export(
        model, x, str(path), input_names=['input'], output_names=output_names, opset_version=OPSET,
        dynamic_axes={'input': {0: 'n'}, **{k: {0: 'n'} for k in dynamic_out}}, dynamo=False,
    )


class _Calib:
    def __init__(self, images):
        self.it = iter([{'input': preprocess(Image.open(p))} for p in images])

    def get_next(self):
        return next(self.it, None)


def quantise(src: Path, dst: Path, calib_images):
    """Static QDQ int8, percentile calibration, first conv and final fc kept in fp32.

    Best of the recipes compared in scripts/quant_experiments.py.
    """
    import onnx
    from onnxruntime.quantization import CalibrationMethod, QuantFormat, QuantType, quantize_static
    from onnxruntime.quantization.shape_inference import quant_pre_process

    pre = dst.with_suffix('.pre.onnx')
    quant_pre_process(str(src), str(pre), skip_symbolic_shape=True)
    compute = [n for n in onnx.load(str(pre)).graph.node if n.op_type in ('Conv', 'Gemm')]
    quantize_static(
        str(pre), str(dst), _Calib(calib_images), quant_format=QuantFormat.QDQ,
        activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8, per_channel=True,
        op_types_to_quantize=['Conv', 'Gemm'], nodes_to_exclude=[compute[0].name, compute[-1].name],
        calibrate_method=CalibrationMethod.Percentile, extra_options={'CalibPercentile': 99.99},
    )
    pre.unlink(missing_ok=True)


def session(path: Path, threads: int = 0):
    import onnxruntime as ort

    so = ort.SessionOptions()
    if threads:
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
    return ort.InferenceSession(str(path), so, providers=['CPUExecutionProvider'])


def bench(fn, x, n=30):
    for _ in range(3):
        fn(x)
    t = []
    for _ in range(n):
        s = time.perf_counter()
        fn(x)
        t.append((time.perf_counter() - s) * 1000)
    return {'median_ms': round(float(np.median(t)), 2), 'p90_ms': round(float(np.percentile(t, 90)), 2)}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ─── evaluation ──────────────────────────────────────────────────────────────

def eval_cataract(torch_model, bundle, sessions, test, pos):
    from sklearn.metrics import roc_auc_score

    thr = float(bundle['meta']['ood']['threshold'])
    y = np.array([int(lbl == pos) for _, lbl in test])
    sets = {
        'clean': [preprocess(Image.open(p)) for p, _ in test],
        'webcam_sim': [preprocess(webcam_sim(Image.open(p), random.Random(i))) for i, (p, _) in enumerate(test)],
    }
    out = {}
    for set_name, xs in sets.items():
        with torch.no_grad():
            ref = [torch_model(torch.from_numpy(x)) for x in xs]
        ref_p = np.array([r[0].item() for r in ref])
        ref_o = np.array([r[2].item() for r in ref])
        ref_cam = np.stack([r[3][0].numpy() for r in ref])

        # Also confirm the wrapper matches the production code path (cnn_explain).
        from app.ai_models.cnn_explain import forward_with_features
        with torch.no_grad():
            prod_o = []
            for x in xs[:40]:
                feats, _ = forward_with_features(bundle['model'], torch.from_numpy(x))
                prod_o.append(float(ood_score(layer_distances({n: v.numpy() for n, v in feats.items()}, bundle['ood']),
                                              bundle['ood']['scales_by_layer'])[0]))
        res = {
            'n': len(xs),
            'torch': {'auc': float(roc_auc_score(y, ref_p)), 'abstain_rate': float(np.mean(ref_o > thr))},
            'wrapper_vs_production_ood_max_abs_diff': float(np.max(np.abs(np.array(prod_o) - ref_o[:40]))),
        }
        for name, sess in sessions.items():
            outs = [sess.run(None, {'input': x}) for x in xs]
            p = np.array([o[0][0] for o in outs])
            o = np.array([o[2][0] for o in outs])
            cam = np.stack([o_[3][0] for o_ in outs])
            assessed = (ref_o <= thr) & (o <= thr)
            res[name] = {
                'auc': float(roc_auc_score(y, p)),
                'prob_max_abs_diff': float(np.max(np.abs(p - ref_p))),
                'prob_mean_abs_diff': float(np.mean(np.abs(p - ref_p))),
                'ood_max_abs_diff': float(np.max(np.abs(o - ref_o))),
                'ood_mean_abs_diff': float(np.mean(np.abs(o - ref_o))),
                'abstain_rate': float(np.mean(o > thr)),
                'abstain_agreement': float(np.mean((o > thr) == (ref_o > thr))),
                'band_agreement_when_both_assessed': float(np.mean(
                    np.digitize(p[assessed], [0.2, 0.8]) == np.digitize(ref_p[assessed], [0.2, 0.8]))) if assessed.any() else None,
                'cam_max_abs_diff_normalised': float(np.max(np.abs(
                    cam / (cam.max(axis=(1, 2), keepdims=True) + 1e-8) - ref_cam / (ref_cam.max(axis=(1, 2), keepdims=True) + 1e-8)))),
            }
        out[set_name] = res
    return out


def eval_redness(torch_model, sessions, test):
    from scipy.stats import spearmanr
    from app.ai_models.sclera_redness_model import _tta_variants

    y = np.array([g for _, g in test])
    imgs = [Image.open(p).convert('RGB') for p, _ in test]
    xs = [preprocess(im) for im in imgs]
    with torch.no_grad():
        single = np.array([float(torch_model(torch.from_numpy(x)).item()) for x in xs])
        tta_runs = np.array([[float(torch_model(torch.from_numpy(preprocess(v))).item()) for v in _tta_variants(im)]
                             for im in imgs])
    tta_mean, tta_std = tta_runs.mean(1), tta_runs.std(1)
    cn = np.isin(y, [0, 3])

    def metrics(pred):
        from sklearn.metrics import roc_auc_score
        pred = np.clip(pred, 0, 4)
        return {
            'mae': float(np.mean(np.abs(pred - y))),
            'spearman': float(spearmanr(y, pred).correlation),
            'auc_conjunctivitis_vs_normal': float(roc_auc_score((y[cn] == 3).astype(int), pred[cn])),
            'grade_agreement_vs_tta': float(np.mean(np.rint(pred) == np.rint(np.clip(tta_mean, 0, 4)))),
        }

    err = np.abs(np.clip(tta_mean, 0, 4) - y)
    rng = np.random.default_rng(0)
    boot = []
    for _ in range(2000):
        i = rng.integers(0, len(y), len(y))
        boot.append(np.mean(np.abs(np.clip(single[i], 0, 4) - y[i])) - np.mean(np.abs(np.clip(tta_mean[i], 0, 4) - y[i])))
    out = {
        'n': len(y),
        'tta': {
            'single_pass': metrics(single),
            'tta_5_pass': metrics(tta_mean),
            'mae_single_minus_tta_ci95': [float(np.percentile(boot, 2.5)), float(np.percentile(boot, 97.5))],
            'score_max_abs_diff_single_vs_tta': float(np.max(np.abs(np.clip(single, 0, 4) - np.clip(tta_mean, 0, 4)))),
            'tta_std_vs_abs_error_spearman': float(spearmanr(tta_std, err).correlation),
            'tta_std_median': float(np.median(tta_std)),
        },
    }
    for name, sess in sessions.items():
        p = np.array([float(sess.run(None, {'input': x})[0].reshape(-1)[0]) for x in xs])
        out[name] = {
            **metrics(p),
                'grade_agreement_vs_torch_single': float(np.mean(np.rint(np.clip(p, 0, 4)) == np.rint(np.clip(single, 0, 4)))),
                'score_max_abs_diff_vs_torch': float(np.max(np.abs(p - single))),
            'score_mean_abs_diff_vs_torch': float(np.mean(np.abs(p - single))),
        }
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--skip-int8', action='store_true')
    ap.add_argument('--calib', type=int, default=400)
    args = ap.parse_args()
    default_threads = torch.get_num_threads()
    OUT.mkdir(exist_ok=True)
    report = {'opset': OPSET, 'torch': torch.__version__}
    import onnxruntime as ort
    report['onnxruntime'] = ort.__version__
    rng = random.Random(0)

    # Cataract
    cat_model, cat_bundle = load_cataract()
    cat_train, cat_test, pos = cataract_data()
    cat_fp32 = OUT / 'cataract_screen.fp32.onnx'
    export(cat_model, cat_fp32, ['prob', 'logits', 'ood_score', 'cam'], ['prob', 'logits', 'ood_score', 'cam'])
    cat_paths = {'fp32': cat_fp32}
    if not args.skip_int8:
        cat_int8 = OUT / 'cataract_screen.int8.onnx'
        quantise(cat_fp32, cat_int8, [p for p, _ in rng.sample(cat_train, args.calib)])
        cat_paths['int8'] = cat_int8

    # Redness
    red_model, red_weights = load_sclera()
    red_train, red_test = redness_data()
    red_fp32 = OUT / 'sclera_redness.fp32.onnx'
    export(red_model, red_fp32, ['score'], ['score'])
    red_paths = {'fp32': red_fp32}
    if not args.skip_int8:
        red_int8 = OUT / 'sclera_redness.int8.onnx'
        quantise(red_fp32, red_int8, [p for p, _ in rng.sample(red_train, min(args.calib, len(red_train)))])
        red_paths['int8'] = red_int8

    cat_sessions = {f'ort_{k}': session(v) for k, v in cat_paths.items()}
    red_sessions = {f'ort_{k}': session(v) for k, v in red_paths.items()}
    report['cataract'] = eval_cataract(cat_model, cat_bundle, cat_sessions, cat_test, pos)
    report['redness'] = eval_redness(red_model, red_sessions, red_test)

    # Latency, single image, CPU. torch default threads vs ORT default and 1 thread
    x = preprocess(Image.open(cat_test[0][0]))
    xt = torch.from_numpy(x)
    lat = {}
    for label, model, paths in (('cataract', cat_model, cat_paths), ('redness', red_model, red_paths)):
        with torch.no_grad():
            lat[label] = {'torch_cpu': bench(lambda v: model(v), xt)}
            torch.set_num_threads(1)
            lat[label]['torch_cpu_1thread'] = bench(lambda v: model(v), xt)
            torch.set_num_threads(default_threads)
        for k, pth in paths.items():
            lat[label][f'ort_{k}'] = bench(lambda v, s=session(pth): s.run(None, {'input': v}), x)
            lat[label][f'ort_{k}_1thread'] = bench(lambda v, s=session(pth, 1): s.run(None, {'input': v}), x)
    with torch.no_grad():
        red_tta = lambda v: [red_model(v) for _ in range(5)]
        lat['redness']['torch_cpu_tta5'] = bench(red_tta, xt)
    report['latency_single_image'] = lat

    # Browser variants: int8 only where it leaves the app's decisions unchanged on the test set.
    # The cataract abstain decision is the safety mechanism, so it must match the server exactly.
    red_int8_ok = 'ort_int8' in report['redness'] and report['redness']['ort_int8']['grade_agreement_vs_torch_single'] == 1.0
    cat_int8 = report['cataract'].get('webcam_sim', {}).get('ort_int8', {})
    cat_int8_ok = cat_int8.get('abstain_agreement') == 1.0 and cat_int8.get('band_agreement_when_both_assessed') == 1.0
    manifest = {
        'cataract_screen': {
            'browser_variant': 'int8' if cat_int8_ok else 'fp32',
            'files': {k: {'file': v.name, 'bytes': v.stat().st_size, 'sha256': sha256(v)} for k, v in cat_paths.items()},
            'outputs': ['prob', 'logits', 'ood_score', 'cam'],
            'input': {'shape': [1, 3, 224, 224], 'mean': MEAN.tolist(), 'std': STD.tolist(), 'resize': 'bilinear_antialias_224'},
            'method': cat_bundle['meta']['version'],
            'temperature': cat_bundle['meta']['temperature'],
            'thresholds': {k: cat_bundle['meta']['thresholds'][k] for k in ('rule_out', 'rule_in')},
            'ood_threshold': cat_bundle['meta']['ood']['threshold'],
            'crop': {'landmarks': 'LEFT/RIGHT_EYE_REGION', 'pad_x': 0.45, 'pad_y': 0.55},
            'model_card': 'docs/model_cards/cataract_resnet18.md',
        },
        'sclera_redness': {
            'browser_variant': 'int8' if red_int8_ok else 'fp32',
            'files': {k: {'file': v.name, 'bytes': v.stat().st_size, 'sha256': sha256(v)} for k, v in red_paths.items()},
            'outputs': ['score'],
            'input': {'shape': [1, 3, 224, 224], 'mean': MEAN.tolist(), 'std': STD.tolist(), 'resize': 'bilinear_antialias_224'},
            'method': 'bounded_ordinal_resnet18_v1',
            'weights': Path(red_weights).name,
            'crop': {'landmarks': 'LEFT/RIGHT_EYE_REGION', 'pad_x': 0.10, 'pad_y': 0.15, 'then': 'prepare_ocular_patch'},
            'model_card': 'docs/model_cards/sclera_redness_resnet18.md',
        },
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    WEB_OUT.mkdir(parents=True, exist_ok=True)
    for old in WEB_OUT.glob('*.onnx'):
        old.unlink()
    browser_files = [OUT / manifest[m]['files'][manifest[m]['browser_variant']]['file'] for m in manifest]
    for f in [*browser_files, OUT / 'manifest.json']:
        shutil.copy2(f, WEB_OUT / f.name)
    report['files'] = {name: m['files'] for name, m in manifest.items()}
    REPORT.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
