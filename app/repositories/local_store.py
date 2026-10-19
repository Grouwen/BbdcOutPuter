from pathlib import Path

import aiofiles


class LocalStore:
    async def save(self,path:Path|str,content,mode:str="w"):
        if isinstance(path,Path):
            path = path.as_posix()

        async with aiofiles.open(path,mode) as f:
            await f.write(content)