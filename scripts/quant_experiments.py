#!/usr/bin/env python3
"""
Try alternative int8 recipes against the fp32 ONNX models exported by
export_onnx.py and report parity on the decisions the app actually makes
(cataract abstain + band, redness grade). Writes
docs/model_cards/assets/onnx_quant_experiments.json.
"""

from __future__ import annotations

import json
import random
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'scripts'))
from export_onnx import (  # noqa: E402
    OUT, _Calib, bench, cataract_data, load_cataract, preprocess, redness_data, session,
)
from train_cataract_resnet import webcam_sim  # noqa: E402


def static(src, dst, images, method, per_channel=True, exclude_first_last=False):
    import onnx
    from onnxruntime.quantization import CalibrationMethod, QuantFormat, QuantType, quantize_static
    from onnxruntime.quantization.shape_inference import quant_pre_process

    pre = Path(tempfile.mkdtemp()) / 'pre.onnx'
    quant_pre_process(str(src), str(pre), skip_symbolic_shape=True)
    nodes = [n for n in onnx.load(str(pre)).graph.node if n.op_type in ('Conv', 'Gemm')]
    exclude = [nodes[0].name, nodes[-1].name] if exclude_first_last else []
    extra = {'CalibPercentile': 99.99} if method == 'percentile' else {}
    quantize_static(
        str(pre), str(dst), _Calib(images), quant_format=QuantFormat.QDQ,
        activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8, per_channel=per_channel,
        op_types_to_quantize=['Conv', 'Gemm'], nodes_to_exclude=exclude,
        calibrate_method={'minmax': CalibrationMethod.MinMax, 'percentile': CalibrationMethod.Percentile,
                          'entropy': CalibrationMethod.Entropy}[method],
        extra_options=extra,
    )


def dynamic(src, dst):
    from onnxruntime.quantization import QuantType, quantize_dynamic

    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QUInt8, op_types_to_quantize=['Conv', 'Gemm', 'MatMul'])


def main():
    rng = random.Random(0)
    _, bundle = load_cataract()
    thr = float(bundle['meta']['ood']['threshold'])
    cat_train, cat_test, _ = cataract_data()
    red_train, red_test = redness_data()
    cat_xs = [preprocess(webcam_sim(Image.open(p), random.Random(i))) for i, (p, _) in enumerate(cat_test)]
    cat_xs += [preprocess(Image.open(p)) for p, _ in cat_test]
    red_xs = [preprocess(Image.open(p)) for p, _ in red_test]

    ref_cat = session(OUT / 'cataract_screen.fp32.onnx')
    ref_red = session(OUT / 'sclera_redness.fp32.onnx')
    rc = [ref_cat.run(None, {'input': x}) for x in cat_xs]
    rp, ro = np.array([o[0][0] for o in rc]), np.array([o[2][0] for o in rc])
    rr = np.array([float(ref_red.run(None, {'input': x})[0].reshape(-1)[0]) for x in red_xs])

    cat_calib = [p for p, _ in rng.sample(cat_train, 400)]
    red_calib = [p for p, _ in rng.sample(red_train, min(400, len(red_train)))]
    tmp = Path(tempfile.mkdtemp())
    recipes = {
        'static_minmax_128': lambda s, d, imgs: static(s, d, imgs[:128], 'minmax'),
        'static_percentile_400': lambda s, d, imgs: static(s, d, imgs, 'percentile'),
        'static_percentile_400_keep_first_last_fp32': lambda s, d, imgs: static(s, d, imgs, 'percentile', exclude_first_last=True),
        'dynamic_uint8': lambda s, d, imgs: dynamic(s, d),
    }
    report = {}
    x0 = cat_xs[0]
    for name, fn in recipes.items():
        row = {}
        try:
            cdst, rdst = tmp / f'cat_{name}.onnx', tmp / f'red_{name}.onnx'
            fn(OUT / 'cataract_screen.fp32.onnx', cdst, cat_calib)
            fn(OUT / 'sclera_redness.fp32.onnx', rdst, red_calib)
            cs, rs = session(cdst), session(rdst)
            co = [cs.run(None, {'input': x}) for x in cat_xs]
            p, o = np.array([v[0][0] for v in co]), np.array([v[2][0] for v in co])
            both = (o <= thr) & (ro <= thr)
            r = np.array([float(rs.run(None, {'input': x})[0].reshape(-1)[0]) for x in red_xs])
            row = {
                'cataract_bytes': cdst.stat().st_size,
                'cataract_abstain_agreement': float(np.mean((o > thr) == (ro > thr))),
                'cataract_band_agreement_both_assessed': float(np.mean(np.digitize(p[both], [0.2, 0.8]) == np.digitize(rp[both], [0.2, 0.8]))),
                'cataract_prob_max_abs_diff': float(np.max(np.abs(p - rp))),
                'redness_bytes': rdst.stat().st_size,
                'redness_grade_agreement': float(np.mean(np.rint(np.clip(r, 0, 4)) == np.rint(np.clip(rr, 0, 4)))),
                'redness_score_max_abs_diff': float(np.max(np.abs(r - rr))),
                'cataract_latency': bench(lambda v: cs.run(None, {'input': v}), x0),
                'cataract_latency_1thread': bench(lambda v, s=session(cdst, 1): s.run(None, {'input': v}), x0),
            }
        except Exception as exc:  # noqa: BLE001
            row = {'error': f'{exc.__class__.__name__}: {exc}'[:300]}
        report[name] = row
        print(name, json.dumps(row))
    report['fp32_reference_latency'] = bench(lambda v: ref_cat.run(None, {'input': v}), x0)
    report['fp32_reference_latency_1thread'] = bench(lambda v, s=session(OUT / 'cataract_screen.fp32.onnx', 1): s.run(None, {'input': v}), x0)
    (REPO / 'docs' / 'model_cards' / 'assets' / 'onnx_quant_experiments.json').write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
