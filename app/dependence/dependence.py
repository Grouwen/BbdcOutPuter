from app.oper.httpx_oper import HttpxOper
from app.repositories.cookie_store import CookieStore
from app.repositories.local_store import LocalStore
from app.services.bbdc_service import BbdcService
from fastapi import Request, Depends


async def get_httpx_oper(request: Request):
    return HttpxOper(request.app.state.httpx_infra)

async def get_cookie_store():
    return CookieStore()

async def get_local_store():
    return LocalStore()

async def get_ultimate_oper(request: Request):
    return request.app.state.ultimate_oper

async def get_bbdc_service(httpx_oper:HttpxOper=Depends(get_httpx_oper),
                           cookie_store:CookieStore=Depends(get_cookie_store),
                           local_store:LocalStore=Depends(get_local_store),
                           ultimate_oper=Depends(get_ultimate_oper)):
    return BbdcService(httpx_oper,cookie_store,local_store,ultimate_oper)