from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEB_DIR = PROJECT_ROOT / "web"
OUTPUT_DIR = PROJECT_ROOT / "output"


def mount_web(app: FastAPI) -> None:
    """挂载前端页面与 output 静态目录。"""
    if not WEB_DIR.is_dir():
        raise RuntimeError(
            f"未找到前端目录：{WEB_DIR}\n"
            f"请把压缩包里的 web/ 整个目录复制到项目根目录后再启动。"
        )

    # 二维码 / 验证码图片所在目录，后端首次启动时可能还不存在
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 顺序很重要：/output 必须先于 "/" 注册
    app.mount("/output", StaticFiles(directory=OUTPUT_DIR.as_posix()), name="output")
    app.mount("/", StaticFiles(directory=WEB_DIR.as_posix(), html=True), name="web")
