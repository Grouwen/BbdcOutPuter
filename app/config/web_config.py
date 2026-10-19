from pydantic import BaseModel

class WebConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 20056