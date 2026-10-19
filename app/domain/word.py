from dataclasses import dataclass
from datetime import date

from app.domain.ultimate_result import UltimateResult


@dataclass
class Word:
    word: str
    uspron: str
    ukpron: str
    updatetime: date
    ultimate: UltimateResult