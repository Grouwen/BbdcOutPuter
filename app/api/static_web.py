from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.common.constants import OUTPUT_PATH


def mount_static(app: FastAPI) -> None:
    app.mount("/output", StaticFiles(directory=OUTPUT_PATH.as_posix()), name="output")