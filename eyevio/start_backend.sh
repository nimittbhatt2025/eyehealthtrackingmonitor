#!/bin/bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
FLASK_APP=run.py /Users/vivaanbhatt/Desktop/research-project/eyevio/venv/bin/python3.12 -m flask db upgrade
if [ $? -ne 0 ]; then
	echo "Database migration failed. Fix migration issues and retry."
	exit 1
fi
/Users/vivaanbhatt/Desktop/research-project/eyevio/venv/bin/python3.12 run.py
