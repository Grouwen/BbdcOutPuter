import json
from dataclasses import dataclass, asdict
from datetime import date

from app.domain.ultimate_result import UltimateResult


def dc_default(obj):
    if hasattr(obj, "__dataclass_fields__"):
        return asdict(obj)
    if isinstance(obj, date):
        return obj.isoformat()
    raise TypeError(f"not serializable: {type(obj)}")

@dataclass
class Word:
    word: str
    uspron: str
    ukpron: str
    updatetime: date
    ultimate: UltimateResult

    def to_json(self) -> str:
        return json.dumps(self, default=dc_default, ensure_ascii=False)