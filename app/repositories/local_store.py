from pathlib import Path

import aiofiles


class LocalStore:
    async def save(self,path:Path|str,content,mode:str="w",encoding="utf-8"):
        if isinstance(path,Path):
            path = path.as_posix()

        async with aiofiles.open(path,mode) as f:
            await f.write(content)

    async def load(self,path:Path|str,mode:str="r",encoding:str="utf-8"):
        if isinstance(path,Path):
            path = path.as_posix()

        async with aiofiles.open(path,mode,encoding=encoding) as f:
            data = await f.read()

        return data