from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.api.routers import bbdc_login, bbdc_newword, llm_router
from app.api.static_web import mount_static
from app.common.constants import AUTH_CODE_PATH, COOKIES_PATH, QRCODE_IMG_PATH, OUTPUT_PATH, ULTIMATE_DB_PATH, ENV_PATH, \
    PROMPT_PATH
from app.infrastructure.httpx_infra import init_httpx_infra, close_httpx_infra
from app.oper.ultimate_oper import StarDict
from app.repositories.cookie_store import CookieStore
from app.repositories.env_store import EnvStore
from app.repositories.local_store import LocalStore


def create_dir():
    AUTH_CODE_PATH.parent.mkdir(parents=True, exist_ok=True)
    COOKIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    QRCODE_IMG_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    ULTIMATE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROMPT_PATH.mkdir(parents=True, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_dir()
    load_dotenv(ENV_PATH)
    httpx_infra = init_httpx_infra()
    ultimate_oper = StarDict(ULTIMATE_DB_PATH)
    cookie_store = CookieStore(COOKIES_PATH)
    local_store = LocalStore()
    env_store = EnvStore(ENV_PATH)

    # 挂载
    app.state.httpx_infra = httpx_infra
    app.state.ultimate_oper = ultimate_oper
    app.state.cookie_store = cookie_store
    app.state.local_store = local_store
    app.state.env_store = env_store

    yield

    # 释放
    await close_httpx_infra(app.state.httpx_infra)

app = FastAPI(description="英语单词助手",lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bbdc_login.router)
app.include_router(bbdc_newword.router)
app.include_router(llm_router.router)

mount_static(app)