from pathlib import Path
from pydantic import BaseModel, Field

from app.common.constants import CONFIG_PATH
from app.config.web_config import WebConfig


class AppConfig(BaseModel):
    web: WebConfig = Field(default_factory=WebConfig)

    @classmethod
    def from_yaml(cls) -> "AppConfig":
        import yaml
        path = Path(CONFIG_PATH).resolve()
        try:
            with path.open("r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
        except FileNotFoundError as e:
            raise FileNotFoundError(f"配置文件未找到: {path}") from e
        if not isinstance(data, dict):
            raise ValueError("配置文件格式错误，必须是一个映射（字典）")
        return cls(**data)

appconfig = AppConfig.from_yaml()

if __name__ == '__main__':
    print(appconfig)