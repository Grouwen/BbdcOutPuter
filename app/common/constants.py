from pathlib import Path
from typing import Final

# httpx的默认ua
HTTPX_UA:Final[str]  = "Mozilla/5.0 (Windo/ws NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"

# 配置文件存放位置
CONFIG_PATH: Final[Path] = Path(__file__).parents[2] / "config" / "config.yaml"

# 输出pdf位置
OUTPUT_PATH: Final[Path] = Path(__file__).parents[2] / "output"

# font位置
FONTS_PATH: Final[Path] = Path(__file__).parents[2] / "fonts"

# 二维码登录图片存放位置
QRCODE_IMG_PATH: Final[Path] = Path(__file__).parents[2] / "output" / "qrcode" / "qrcode.jpg"

# cookies保存位置
COOKIES_PATH: Final[Path] = Path(__file__).parents[2] / "cookies" / "cookies.pkl"

# 图片验证码保存位置
AUTH_CODE_PATH: Final[Path] = Path(__file__).parents[2] / "output" / "authcode" / "authcode.jpg"

# ultimate.db保存位置
ULTIMATE_DB_PATH: Final[Path] = Path(__file__).parents[2] / "translate" / "ultimate.db"