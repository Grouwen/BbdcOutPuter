from pydantic import BaseModel


class BbdcLoginPhoneRequest(BaseModel):
    phone_number:int
    auth_code:str
    token:str
    code:str = ""