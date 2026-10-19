from dataclasses import dataclass, field
from typing import List, Dict, Optional


@dataclass
class UltimateResult:
    word: str = ""  # 单词名称
    phonetic: str = ""  # 音标（以英语音标为主）
    definition: List[str] = field(default_factory=list)  # 单词释义（英文），每行一个释义
    translation: List[str] = field(default_factory=list)  # 单词释义（中文），每行一个释义
    pos: List[str] = field(default_factory=list)  # 词性/词语位置，用 "/" 分割不同位置
    collins: int = 0  # 柯林斯星级
    oxford: bool = False  # 是否是牛津三千核心词汇
    tag: List[str] = field(default_factory=list)  # 标签字符串，如 zk/中考 gk/高考 cet4/四级 等，空格分割
    bnc: Optional[int] = None  # 英国国家语料库词频顺序
    frq: Optional[int] = None  # 当代语料库词频顺序
    exchange: List[str] = field(default_factory=list)  # 时态、复数等变换，用 "/" 分割不同项目
    detail: Dict = field(default_factory=dict)  # json 扩展信息，字典形式保存例句等
    audio: Optional[str] = None  # 读音音频 url

    @classmethod
    def _split(cls, value, sep="/"):
        """按分隔符拆分字符串，空值返回空列表"""
        if not value:
            return []
        return [item.strip() for item in value.split(sep) if item.strip()]

    @classmethod
    def from_dict(cls, data: dict) -> "UltimateResult":
        """从原始字典直接构造 UltimateResult 对象"""
        return cls(
            word=data.get("word", ""),
            phonetic=data.get("phonetic", ""),
            definition=cls._split(data.get("definition", ""), sep="\n"),
            translation=cls._split(data.get("translation", ""), sep="\n"),
            pos=cls._split(data.get("pos", ""), sep="/"),
            collins=data.get("collins", 0),
            oxford=bool(data.get("oxford", 0)),
            tag=cls._split(data.get("tag", ""), sep=" "),
            bnc=data.get("bnc"),
            frq=data.get("frq"),
            exchange=cls._split(data.get("exchange", ""), sep="/"),
            detail=data.get("detail"),
            audio=data.get("audio") or None,
        )
