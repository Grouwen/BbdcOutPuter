from json import JSONDecodeError
from typing import Dict

from httpx import AsyncClient, Response, HTTPStatusError, TimeoutException

from app.common.constants import HTTPX_UA


class HttpxOper:
    def __init__(self,httpx_infra:AsyncClient):
        self.httpx_infra = httpx_infra

    async def _request(self,method:str,url:str,**kwargs)->Response:
        """
        发送请求通用方法
        :param method: 请求方法，get/post/put/delete/patch
        :param url: 请求url
        :param kwargs: headers/params/data/json/cookies
        :return:
        """
        request_func = getattr(self.httpx_infra, method.lower())

        # 设置默认值
        headers = kwargs.setdefault("headers", {})
        kwargs.setdefault("timeout", 10)
        headers.setdefault("user-agent", HTTPX_UA)

        # 发送请求
        try:
            response:Response = await request_func(url=url,**kwargs)
        except TimeoutException as e:
            raise RuntimeError(f"请求超时，url={url}") from e
        except Exception as e:
            raise RuntimeError(f"请求失败, url={url}") from e

        response.raise_for_status()

        return response

    async def get_json(self,url,**kwargs)->Dict:
        """
        发送get请求，结果json格式化
        """
        try:
            resp = await self._request("get",url,**kwargs)
            return resp.json()
        except JSONDecodeError as e:
            raise RuntimeError(f"JSON 解析失败, url={url}") from e

    async def post_json(self,url,**kwargs)->Dict:
        """
        发送post请求，结果json格式化
        """
        try:
            resp = await self._request("post", url, **kwargs)
            return resp.json()
        except JSONDecodeError as e:
            raise RuntimeError(f"JSON 解析失败, url={url}") from e

    async def get(self,url,**kwargs)->Response:
        return await self._request("get",url,**kwargs)