from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.api.routers import bbdc_login, bbdc_newword
from app.api.static_web import mount_web
from app.common.constants import AUTH_CODE_PATH, COOKIES_PATH, QRCODE_IMG_PATH, OUTPUT_PATH, ULTIMATE_DB_PATH
from app.infrastructure.httpx_infra import init_httpx_infra, close_httpx_infra
from app.oper.ultimate_oper import StarDict


def create_dir():
    AUTH_CODE_PATH.parent.mkdir(parents=True, exist_ok=True)
    COOKIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    QRCODE_IMG_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_dir()
    httpx_infra = init_httpx_infra()
    ultimate_oper = StarDict(ULTIMATE_DB_PATH)

    # 挂载
    app.state.httpx_infra = httpx_infra
    app.state.ultimate_oper = ultimate_oper

    yield

    # 释放
    await close_httpx_infra(app.state.httpx_infra)

app = FastAPI(description="英语单词助手",lifespan=lifespan)


# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # 生产环境建议替换为具体的前端域名
#     allow_credentials=True,
#     allow_methods=["*"],  # 允许所有方法（包括 OPTIONS）
#     allow_headers=["*"],  # 允许所有请求头
# )

app.include_router(bbdc_login.router)
app.include_router(bbdc_newword.router)

mount_web(app)