import pickle
from pathlib import Path

import aiofiles
from httpx import Cookies


class CookieStore:
    def __init__(self,cookie_path:Path):
        self.cookie_path = cookie_path

    async def save_cookie(self, cookies: Cookies | None):
        if cookies:
            data = pickle.dumps(list(cookies.jar))
            async with aiofiles.open(self.cookie_path, "wb") as f:
                await f.write(data)

    async def load_cookie(self)->Cookies|None:
        if self.cookie_path.exists():
            try:
                async with aiofiles.open(self.cookie_path, "rb") as f:
                    cookie_data = await f.read()
                cookie_list = pickle.loads(cookie_data)
                cookies = Cookies()
                for c in cookie_list:
                    cookies.jar.set_cookie(c)
                return cookies
            except (EOFError, pickle.UnpicklingError, AttributeError, OSError):
                return None

        return None