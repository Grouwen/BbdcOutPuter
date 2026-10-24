import json
from typing import AsyncIterator

import instructor
from fastapi.sse import ServerSentEvent
from instructor import Partial
from litellm import acompletion

from app.common.constants import PROMPT_PATH
from app.domain.word import Word
from app.oper.httpx_oper import HttpxOper
from app.repositories.env_store import EnvStore
from app.repositories.local_store import LocalStore
from app.schemas.read_comprehension_llm import ReadComprehensionLlm
from app.schemas.result import Result
from app.services.bbdc_service import BbdcService
from app.util.llm_msg_util import system_msg, user_msg


class LlmService:
    def __init__(self,env_store:EnvStore,
                 httpx_oper:HttpxOper,
                 local_store:LocalStore,
                 bbdc_service:BbdcService):
        self.env_store = env_store
        self.httpx_oper = httpx_oper
        self.local_store = local_store
        self.bbdc_service = bbdc_service

    async def generate_read_comprehension(self)->AsyncIterator[ServerSentEvent]:
        if not self.env_store.have_env():
            yield ServerSentEvent(event="error",
                                  data=Result.error("api_key或model_name为空"))
            return
        # 获取所有生词
        all_word = []
        async for word in self.bbdc_service.get_all_newword():
            if word.event == "error":
                yield word
                return
            if word.event == "done":
                break
            if word.event == "warn":
                yield word
                continue
            if word.event == "progress":
                result: Result = word.data
                for word_item in result.data.get("wordList", []):
                    word_item:Word = word_item
                    all_word.append({
                        "word":word_item.word,
                        "translate":word_item.ultimate.translation
                    })
                page_inofo = result.data.get("pageInfo",{})
                total_page = page_inofo.get("totalPage", 0)
                current_page = page_inofo.get("currentPage", 0)
                yield ServerSentEvent(event="progress",
                                  data=Result.ok({"message":f"获取第{current_page}/{total_page}页单词成功。"}))

        if not all_word:
            yield ServerSentEvent(event="error",
                                  data=Result.error("单词为空，生成阅读失败！"))
            return

        # 提示前端，已获取全部单词
        yield ServerSentEvent(event="words_ready",data={})

        prompt = await self.local_store.load(PROMPT_PATH/"generate_read_comprehension.txt")

        message = [
            system_msg(prompt),
            user_msg(json.dumps(all_word))
        ]

        client = instructor.from_litellm(acompletion, mode=instructor.Mode.JSON)
        stream = await client.create(
            model=self.env_store.model_name,
            api_key=self.env_store.api_key,
            messages=message,
            response_model=Partial[ReadComprehensionLlm],
            stream=True,
            max_retries=2,
        )

        async for read_comprehension_llm in stream:
            json_str = read_comprehension_llm.model_dump_json()
            yield ServerSentEvent(event="token",data={"token":json_str[:100]})


        yield ServerSentEvent(event="done", data=Result.ok({"result": read_comprehension_llm}))
        return