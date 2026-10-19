from typing import Dict, Any

from pydantic import BaseModel


class Result(BaseModel):
    code: int
    message: str
    data:Dict[str, Any]

    @classmethod
    def ok(cls,data: Dict[str, Any]):
        return cls(code=200,message="ok",data=data)

    @classmethod
    def error(cls, message:str):
        return cls(code=2001, message=message, data={})