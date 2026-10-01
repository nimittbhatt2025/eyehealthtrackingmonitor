"""Polling endpoint for background photo analysis jobs."""

from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models import AnalysisJob, db
from app.services.analysis_jobs import job_response

jobs_bp = Blueprint('jobs', __name__)


@jobs_bp.route('/<job_id>', methods=['GET'])
@jwt_required()
def get_job(job_id):
    """
    {id, kind, status: queued|running|done|failed, http_status, result}.
    ``result`` is the body the synchronous endpoint would have returned with
    ``http_status``; clients should treat it exactly like that response.
    """
    job = db.session.get(AnalysisJob, job_id)
    if job is None or job.user_id != int(get_jwt_identity()):
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job_response(job)), 200
