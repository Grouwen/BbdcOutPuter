from typing import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.dependence.dependence import get_llm_service
from app.schemas.result import Result
from app.services.llm_service import LlmService

router = APIRouter(prefix="/llm", tags=["大模型相关"])

@router.post("/generate/readComprehension", response_class=EventSourceResponse)
async def generate_read_comprehension(
        llm_service: LlmService = Depends(get_llm_service)
) -> AsyncIterator[ServerSentEvent]:
    try:
        async for event in llm_service.generate_read_comprehension():
            yield event
    except Exception as e:
        yield ServerSentEvent(
            event="error",
            data=Result.error(f"出现未知错误，原因：{str(e)}"),
        )