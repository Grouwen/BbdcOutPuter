from typing import Literal, List

from pydantic import BaseModel, Field

class Option(BaseModel):
    option_number: Literal["A", "B", "C", "D"] = Field(description="选项号")
    option_content: str = Field(description="选项内容")

class Question(BaseModel):
    question_number: Literal["1", "2", "3", "4","5"] = Field(description="题号")
    question_content: str = Field(description="问题内容")
    options:List[Option] = Field(description="选项列表")
    analysis: str = Field(description="本题答案解析")
    correct_option: Option = Field(description="本题正确答案")

class ReadComprehensionLlm(BaseModel):
    title: str = Field(description="文章标题")
    content: str = Field(description="文章内容")
    questions: List[Question] = Field(description="题目列表")
    core_point: str = Field(description="本文核心考点")