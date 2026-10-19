from fastapi import APIRouter, Depends

from app.dependence.dependence import get_bbdc_service
from app.services.bbdc_service import BbdcService

router = APIRouter(prefix="/bbdc/service", tags=["不背单词业务相关"])

@router.get("/getNewword/{page}")
async def bbdc_get_newword(page:int=1,
                           bbdc_service:BbdcService = Depends(get_bbdc_service)):
    return await bbdc_service.get_newword_by_page(page-1)