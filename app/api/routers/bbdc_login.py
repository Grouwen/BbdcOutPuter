from fastapi import APIRouter, Depends
from sse_starlette import EventSourceResponse

from app.dependence.dependence import get_bbdc_service
from app.schemas.bbdc_login_phone_request import BbdcLoginPhoneRequest
from app.services.bbdc_service import BbdcService

router = APIRouter(prefix="/bbdc/login", tags=["登录"])

# 二维码登录
@router.get("/qrcode")
async def bbdc_login_qrcode(bbdc_service: BbdcService = Depends(get_bbdc_service)):
    async def publisher():
        try:
            async for msg in bbdc_service.login_by_qrcode():
                yield msg
        except Exception as e:
            yield f"服务异常：{e}"
    return EventSourceResponse(publisher())

# 手机验证码登录
@router.post("/phone")
async def bbdc_login_phone(
    req: BbdcLoginPhoneRequest,
    bbdc_service: BbdcService = Depends(get_bbdc_service),
):
    return await bbdc_service.login_by_phone(req)
# 获取图片验证码
@router.get("/getAuthCode")
async def bbdc_login_phone_get_auth_code(bbdc_service: BbdcService = Depends(get_bbdc_service)):
    return await bbdc_service.get_auth_code()
# 获取手机验证码
@router.post("/getPhoneCode")
async def bbdc_login_phone_get_phone_code(req: BbdcLoginPhoneRequest,
                                          bbdc_service: BbdcService = Depends(get_bbdc_service)):
    return await bbdc_service.get_phone_code(req)

# 自动登录
@router.post("/autoLogin")
async def bbdc_login_auto_login(bbdc_service: BbdcService = Depends(get_bbdc_service)):
    return await bbdc_service.auto_login()