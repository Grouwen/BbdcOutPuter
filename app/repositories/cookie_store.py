import pickle

import aiofiles
from httpx import Cookies

from app.common.constants import COOKIES_PATH


class CookieStore:

    async def save_cookie(self, cookies: Cookies | None):
        if cookies:
            data = pickle.dumps(list(cookies.jar))
            async with aiofiles.open(COOKIES_PATH, "wb") as f:
                await f.write(data)

    def load_cookie(self)->Cookies|None:
        if COOKIES_PATH.exists():
            try:
                with open(COOKIES_PATH, "rb") as f:
                    cookie_list = pickle.load(f)
                cookies = Cookies()
                for c in cookie_list:
                    cookies.jar.set_cookie(c)
                return cookies
            except (EOFError, pickle.UnpicklingError, AttributeError, OSError):
                return None

        return None