import os
from pathlib import Path

from dotenv import set_key, load_dotenv


class EnvStore:
    def __init__(self,env_path:Path):
        self.env_path = env_path
        self.api_key = os.getenv("LLM_API_KEY")
        self.model_name = os.getenv("LLM_MODEL_NAME")

    def have_env(self)->bool:
        self.load_env()
        if not self.api_key or not self.model_name:
            return False
        return True

    def load_env(self):
        load_dotenv(override=True)
        self.api_key = os.getenv("LLM_API_KEY")
        self.model_name = os.getenv("LLM_MODEL_NAME")

    def set_env(self,key_name:str,value):
        set_key(self.env_path,key_name,value)
        self.api_key = os.getenv("LLM_API_KEY")
        self.model_name = os.getenv("LLM_MODEL_NAME")