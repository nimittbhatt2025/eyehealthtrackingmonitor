"""
Image request parsing shared by the photo endpoints.

Preferred: multipart/form-data with the encoded image as a binary file part and
the other fields as a JSON string in a ``meta`` part (no base64 inflation).
Legacy: application/json with the image as a base64 / data-URL string.
"""

import json
from typing import Any, Dict, Optional, Tuple, Union

from flask import request

MAX_IMAGE_BYTES = 8 * 1024 * 1024
_SIGNATURES = (b'\xff\xd8\xff', b'\x89PNG\r\n\x1a\n', b'RIFF')


class ImageUploadError(ValueError):
    pass


def read_image_request(image_field: str = 'image') -> Tuple[Dict[str, Any], Optional[Union[bytes, str]]]:
    """
    Returns ``(data, image)``: the JSON fields and the image as raw bytes
    (multipart) or a base64 string (legacy JSON). ``image`` is None when absent.
    """
    if request.mimetype == 'multipart/form-data':
        meta = request.form.get('meta')
        try:
            data = json.loads(meta) if meta else {}
        except ValueError as exc:
            raise ImageUploadError('meta must be a JSON object') from exc
        if not isinstance(data, dict):
            raise ImageUploadError('meta must be a JSON object')
        upload = request.files.get(image_field)
        if upload is None:
            return data, None
        raw = upload.read(MAX_IMAGE_BYTES + 1)
        if len(raw) > MAX_IMAGE_BYTES:
            raise ImageUploadError(f'image exceeds {MAX_IMAGE_BYTES // (1024 * 1024)} MB')
        if not raw.startswith(_SIGNATURES):
            raise ImageUploadError('image must be JPEG, PNG or WebP')
        data['_upload'] = {'transport': 'multipart', 'bytes': len(raw)}
        return data, raw

    data = request.get_json(silent=True) or {}
    image = data.get(image_field)
    if image:
        data['_upload'] = {'transport': 'base64', 'bytes': len(image)}
    return data, image


def client_frame_white_balance(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Full-frame white balance sent with a client face-crop upload. White balance
    is a whole-frame statistic, so estimating it on the crop would shift redness
    relative to uncropped photos. Same validation/clipping as on-device results.
    """
    from app.ai_models.on_device import OnDeviceValidationError, sanitize_white_balance

    crop = data.get('client_crop')
    if not isinstance(crop, dict) or not crop.get('box'):
        return None
    try:
        wb = sanitize_white_balance(crop.get('white_balance'), source='client_full_frame')
    except OnDeviceValidationError as exc:
        raise ImageUploadError(str(exc)) from exc
    return wb if wb.get('available') else None


def upload_summary(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Transport + client crop info to keep alongside the analysis (no pixels)."""
    upload = data.get('_upload')
    if not upload:
        return None
    crop = data.get('client_crop')
    if isinstance(crop, dict):
        upload = {**upload, 'client_crop': {
            k: crop[k] for k in ('source_size', 'box', 'scale', 'reason')
            if k in crop and isinstance(crop[k], (int, float, str, list))
        }}
    return upload
