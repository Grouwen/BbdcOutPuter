from pathlib import Path
from typing import Final

# httpx的默认ua
HTTPX_UA:Final[str] = "Mozilla/5.0 (Windo/ws NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36"

# 项目位置
PROJECT_ROOT: Final[Path] = Path(__file__).resolve().parents[2]

# 配置文件存放位置
CONFIG_PATH: Final[Path] = PROJECT_ROOT / "config" / "config.yaml"

# 输出位置
OUTPUT_PATH: Final[Path] = PROJECT_ROOT / "output"

# font位置 保留 后续加入命令行启动
# FONTS_PATH: Final[Path] = PROJECT_ROOT / "fonts"

# 二维码登录图片存放位置
QRCODE_IMG_PATH: Final[Path] = OUTPUT_PATH / "qrcode" / "qrcode.jpg"

# cookies保存位置
COOKIES_PATH: Final[Path] = PROJECT_ROOT / "cookies" / "cookies.pkl"

# 图片验证码保存位置
AUTH_CODE_PATH: Final[Path] = OUTPUT_PATH / "authcode" / "authcode.jpg"

# ultimate.db保存位置
ULTIMATE_DB_PATH: Final[Path] = PROJECT_ROOT / "translate" / "ultimate.db"