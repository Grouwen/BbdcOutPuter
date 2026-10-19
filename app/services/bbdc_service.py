import asyncio
import random
import re
import time
import urllib.parse
from typing import AsyncIterator
import aiofiles
from datetime import datetime
from app.common.constants import QRCODE_IMG_PATH, AUTH_CODE_PATH
from app.domain.ultimate_result import UltimateResult
from app.domain.word import Word
from app.enums.qr_state_code import QrStateCode
from app.oper.httpx_oper import HttpxOper
from app.oper.ultimate_oper import StarDict
from app.repositories.cookie_store import CookieStore
from app.repositories.local_store import LocalStore
from app.schemas.bbdc_login_phone_request import BbdcLoginPhoneRequest
from app.schemas.result import Result


class BbdcService:
    def __init__(self,httpx_oper:HttpxOper,
                 cookie_store:CookieStore,
                 local_store:LocalStore,
                 ultimate_oper:StarDict):
        self.httpx_oper=httpx_oper
        self.cookie_store=cookie_store
        self.local_store=local_store
        self.ultimate_oper=ultimate_oper

    # ------------------------- 登录相关 -------------------------
    async def login_by_qrcode(self) -> AsyncIterator[str]:
        """
        使用微信二维码登录
        """
        # 定义常量
        APPID = "wx361671240615dce5"
        SCOPE = "snsapi_login"
        CALLBACK = "https://bbdc.cn/lexis/wx/callback"
        REDIRECT_URL = "http://www.bbdc.cn/newword"

        # 定义header
        headers = {
            "Referer": "https://www.bbdc.cn/lexis/login?redirectUrl=" + urllib.parse.quote(REDIRECT_URL, safe=""),
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "*/*",
        }

        # 先获取state
        state_rep = await self.httpx_oper.get_json("https://www.bbdc.cn/api/fetch-state", headers=headers)
        state = state_rep["data_body"]["state"]

        # 构造请求获取二维码标识
        target = REDIRECT_URL + "?showMsg=1"
        redirect_uri = CALLBACK + "?redirect_uri=" + target
        ts = str(int(time.time() * 1000))
        params = {
            "appid": APPID,
            "scope": SCOPE,
            "redirect_uri": redirect_uri,
            "state": state,
            "login_type": "jssdk",
            "self_redirect": "false",
            "styletype": "",
            "sizetype": "",
            "bgcolor": "",
            "rst": "",
            "ts": ts,
            "style": "black",
        }
        resp = await self.httpx_oper.get("https://open.weixin.qq.com/connect/qrconnect", params=params)

        qrcode_sign = re.search(r',\s*G\s*=\s*"([^"]+)"', resp.text)
        if not qrcode_sign:
            raise RuntimeError(f"获取二维码标识失败，未匹配到二维码标识，url：{resp.request.url}")
        qrcode_sign = qrcode_sign.group(1)

        # 获取二维码图片并保存到本地
        qrcode = await self.httpx_oper.get(f"https://open.weixin.qq.com/connect/qrcode/{qrcode_sign}")
        async with aiofiles.open(QRCODE_IMG_PATH, "wb") as f:
            await f.write(qrcode.content)

        # 推送二维码路径
        yield QRCODE_IMG_PATH.as_posix()
        # 轮询状态
        last_state_code = None
        while True:
            # 构造请求参数
            timeout = 40
            params = {
                "uuid": qrcode_sign,
            }
            if last_state_code:
                params["last"] = last_state_code

            # 轮询
            resp = await self.httpx_oper.get(f"https://lp.open.weixin.qq.com/connect/l/qrconnect", params=params,
                                            timeout=timeout)
            state_code = re.search(r'window\.wx_errcode=(\d+)', resp.text)
            wx_code = re.search(r"window\.wx_code='([^']*)'", resp.text)
            if not state_code:
                raise RuntimeError(f"轮询二维码状态失败，未匹配到状态码，返回：{resp.text}")
            state_code = int(state_code.group(1))
            wx_code = wx_code.group(1)

            # 状态机
            if state_code == QrStateCode.POLLING_TIMEOUT.value:
                yield "获取二维码成功，扫描二维码来登录"
                last_state_code = None
                await asyncio.sleep(2)
            elif state_code == QrStateCode.QRCODE_TTL.value:
                # raise RuntimeError(f"二维码过期，登录失败。")
                yield "二维码过期，登录失败。"
                return
            elif state_code == QrStateCode.CANCEL_LOGIN.value:
                yield "用户取消"
                last_state_code = QrStateCode.CANCEL_LOGIN.value
                await asyncio.sleep(2)
            elif state_code == QrStateCode.WAIT_FOR_CONFIRM.value:
                yield "已扫描，待确认"
                last_state_code = QrStateCode.WAIT_FOR_CONFIRM.value
            elif state_code == QrStateCode.SERVICE_ERROR.value:
                # raise RuntimeError("轮询二维码时，服务器异常。")
                yield "轮询二维码时，服务器异常。"
                return
            elif state_code == QrStateCode.CONFIRM_LOGIN.value:
                params = {
                    "redirect_uri": "https://bbdc.cn/index?showMsg=1",
                    "code": wx_code,
                    "state": state
                }
                resp = await self.httpx_oper.get("https://bbdc.cn/lexis/wx/callback", params=params)
                unregistered = bool(re.search(r'id=["\']r["\'][^>]*value=["\']0["\']', resp.text, re.I))
                if unregistered:
                    # raise RuntimeError("未注册的账号，请使用其他登录方式")
                    yield "未注册的账号，请使用其他登录方式"
                    return
                cookies = self.httpx_oper.httpx_infra.cookies
                await self.cookie_store.save_cookie(cookies)
                yield "ok"
                return
            else:
                # raise RuntimeError(f"轮询二维码失败，未知原因。返回：{resp.text}")
                yield f"未知状态：{resp.text}"
                return

    async def get_auth_code(self)->Result:
        """
        获取图片验证码
        """
        token = "t" + str(1e6 * random.random())
        auth_code_resp = await self.httpx_oper.get(f"https://www.bbdc.cn/captcha_code?token={token}")

        await self.local_store.save(AUTH_CODE_PATH, auth_code_resp.content,"wb")

        return Result.ok(
            {
            "url":AUTH_CODE_PATH.as_posix(),
            "token":token
            }
        )

    async def get_phone_code(self, req:BbdcLoginPhoneRequest)->Result:
        """
        获取验证码
        """
        params = {
            "captchaToken":req.token,
            "phone":req.phone_number,
            "verifyCode":req.auth_code
        }
        get_code_resp = await self.httpx_oper.get_json("https://www.bbdc.cn/phone/code",params=params)
        if get_code_resp["result_code"] != 200:
            error_message = get_code_resp.get("error_body",{}).get("user_message","")
            return Result.error(f"获取验证码失败，{error_message}")

        return Result.ok({})

    async def login_by_phone(self, req:BbdcLoginPhoneRequest)->Result:
        """
        使用手机登录
        """
        params = {
            "captchaToken":req.token,
            "phone":req.phone_number,
            "verifyCode":req.auth_code,
            "code":req.code
        }
        phone_login_resp = await self.httpx_oper.get_json("https://www.bbdc.cn/phone/code/validate",params=params)

        if phone_login_resp["result_code"] != 200:
            return Result.error(f"登录失败: {phone_login_resp['error_body']['info']}")

        cookies = self.httpx_oper.httpx_infra.cookies
        await self.cookie_store.save_cookie(cookies)

        return Result.ok({})

    async def auto_login(self)->Result:
        # 读取cookie
        cookies = self.cookie_store.load_cookie()
        if not cookies:
            return Result.ok({"is_login":False})

        # 携带cookie检测cookie是否有效
        self.httpx_oper.httpx_infra.cookies = cookies
        index_resp = await self.httpx_oper.get("https://www.bbdc.cn/index")
        # 判断是否登录
        html = index_resp.text
        has_logout = 'id="loginOut"' in html
        login_user_empty = re.search(r'id=["\']loginUser["\'][^>]*>\s*</div>', html) is not None
        has_login_link = 'class="login-in">登录<' in html or 'class="login-in"' in html

        logged_in = has_logout or (not login_user_empty and not has_login_link)
        if logged_in:
            return Result.ok({"is_login": True})

        return Result.ok({"is_login":False})



    # ------------------------- 业务相关 -------------------------
    async def get_newword_by_page(self,page:int)->Result:
        rep = await self.httpx_oper.get_json(f"https://www.bbdc.cn/api/user-new-word?page={page}")
        if rep["result_code"] != 200:
            return Result.error(f"获取生词数据失败，原因：{rep["error_body"]["user_message"]}")
        # {
        #   "result_code": 200,
        #   "data_kind": "user_new_word",
        #   "data_version": "1.0",
        #   "data_body": {
        #     "wordList": [
        #       {
        #         "ukpron": "ˈbeəli",
        #         "updatetime": "2026-10-16 18:47:44",
        #         "word": "barely",
        #         "uspron": "ˈberli"
        #       },],
        #     "pageInfo": {
        #       "totalRecord": 425,
        #       "pageSize": 24,
        #       "totalPage": 18,
        #       "currentPage": 2
        #     }
        #   }
        # }

        # 转为word对象
        word_with_ultimate = []
        if not rep.get("data_body", {}):
            return Result.error("返回数据为空")
        word_resp_list = rep.get("data_body", {}).get("wordList", [])
        for word_resp in word_resp_list:
            # 获取翻译信息
            # ultimate_oper_result = await asyncio.to_thread(
            #     self.ultimate_oper.query, word_resp["word"]
            # )
            ultimate_oper_result = self.ultimate_oper.query(word_resp["word"])
            ultimate_result = UltimateResult.from_dict(ultimate_oper_result or {})
            # 存储为date对象
            updatetime = datetime.strptime(word_resp["updatetime"], '%Y-%m-%d %H:%M:%S').date()

            word_with_ultimate.append(Word(
                word = word_resp["word"],
                uspron = word_resp["uspron"],
                ukpron = word_resp["ukpron"],
                updatetime = updatetime,
                ultimate = ultimate_result,
            ))

        return Result.ok({
            "wordList": word_with_ultimate,
            "pageInfo": rep.get("data_body", {}).get("pageInfo")
        })
