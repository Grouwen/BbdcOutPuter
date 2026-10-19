#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 A4「单词默写」PDF 模板（复刻截图中的版式）

三种模式，均只保留题目、从顶部开始排版（无页头页尾，词少时也从上往下排）：
  both（默认）：左右两栏双向测试，每页 20 词
      左栏：序号 | 单词(已印) | 释义(留空) | 勾选框
      右栏：序号 | 单词(留空) | 释义(已印) | 勾选框
  en：只印英文单词、释义留空，两栏连续排布，每页 40 词
  zh：只印中文释义、单词留空，两栏连续排布，每页 40 词

依赖：pip install reportlab
字体：中文用 Noto Sans SC（思源黑体）的静态字重，需放在 ./fonts 下：
  fonts/NotoSansSC-Regular.ttf
  fonts/NotoSansSC-Bold.ttf
（中文字形必须内嵌；不要用 reportlab 内置的 STSong-Light，它不内嵌，浏览器/手机端会空白）

用法：
    python3 gen_wordlist_pdf.py            # 一次生成 both / en / zh 三个 PDF
"""
from pathlib import Path
from typing import List

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from app.common.constants import FONTS_PATH

# ---------- 字体 ----------
# 中文字形必须「内嵌」到 PDF 里，否则很多阅读器（如浏览器/移动端）显示为空白。
# reportlab 自带的 CID 字体 STSong-Light 是不内嵌的，所以这里改用思源黑体 / Noto Sans SC。
CN_R = FONTS_PATH/"NotoSansSC-Regular.ttf"
CN_B = FONTS_PATH/"NotoSansSC-Bold.ttf"
pdfmetrics.registerFont(TTFont("CN", CN_R))
pdfmetrics.registerFont(TTFont("CNB", CN_B))
CN, CNB = "CN", "CNB"
EN, EN_B = "Helvetica", "Helvetica-Bold"

# ---------- 调色板（从截图采样得到） ----------
ORANGE_BG = colors.HexColor("#FAAC85")   # 表头实心橙块
PEACH_BG  = colors.HexColor("#FFEFE7")   # 表头浅橙底
STRIPE    = colors.HexColor("#FFE8DA")   # 隔行浅橙
DASH      = colors.HexColor("#F0C6B2")   # 竖向虚线分隔
LINE      = colors.HexColor("#F3DFD4")   # 横向细线 / 外框
DARK      = colors.HexColor("#2E2A28")
CHECK     = colors.HexColor("#C9CDD4")

# ---------- 页面几何（单位 pt，A4 = 595.28 x 841.89） ----------
PW, PH = A4
MARGIN = 48                                 # 题目与页面四周的留白
INNER_W = PW - 2 * MARGIN

GAP = 12                                    # 左右栏间距
HALF_W = (INNER_W - GAP) / 2
COL_NO, COL_WORD, COL_MEAN, COL_CHECK = 22, 95, 106.64, 20  # = HALF_W
HDR_H, ROW_H = 20, 36                       # 表头高 / 行高
PER_PAGE = 20                               # 双向模式每页词数
SINGLE_PER_PAGE = PER_PAGE * 2              # 单向模式每页词数（两栏连续排布）


# ---------- 基础绘制工具 ----------
def text(c, x, y, s, font=CN, size=9, color=DARK, align="left", bold=False):
    """绘制文字；align 支持 left/center/right；bold 直接切换加粗字重"""
    if bold:
        font = CNB if font == CN else EN_B
    c.setFont(font, size)
    c.setFillColor(color)
    if align == "center":
        c.drawCentredString(x, y, s)
    elif align == "right":
        c.drawRightString(x, y, s)
    else:
        c.drawString(x, y, s)


def text_width(s, font, size):
    return pdfmetrics.stringWidth(s, font, size)


def wrap(s, font, size, max_w, max_lines=3):
    """按字符折行（中英文皆可），超出行数截断加省略号"""
    lines, cur = [], ""
    for ch in s:
        if text_width(cur + ch, font, size) <= max_w:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
            if len(lines) == max_lines:
                break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    if len(lines) == max_lines:
        used = "".join(lines)
        if len(used) < len(s):
            while lines[-1] and text_width(lines[-1] + "…", font, size) > max_w:
                lines[-1] = lines[-1][:-1]
            lines[-1] += "…"
    return lines


def draw_checkbox(c, cx, cy, s=11, bg=colors.white):
    c.setFillColor(bg)
    c.setStrokeColor(CHECK)
    c.setLineWidth(0.8)
    c.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.3, stroke=1, fill=1)


# ---------- 半栏表格 ----------
def draw_half(c, x_left, top_y, rows, mode):
    """
    rows: [(no, word, meaning), ...]
    mode: 'en' -> 左栏（印单词、释义留空）
          'zh' -> 右栏（释义印、单词留空）
    返回表格底部 y
    """
    hdr_h, row_h = HDR_H, ROW_H
    xs = [x_left,
          x_left + COL_NO,
          x_left + COL_NO + COL_WORD,
          x_left + COL_NO + COL_WORD + COL_MEAN,
          x_left + HALF_W]

    # ---- 表头：整行浅橙底 ----
    c.setFillColor(PEACH_BG)
    c.rect(xs[0], top_y - hdr_h, HALF_W, hdr_h, stroke=0, fill=1)
    # Word 列的实心橙圆角块
    c.setFillColor(ORANGE_BG)
    pad = 3
    c.roundRect(xs[1] + pad, top_y - hdr_h + pad, COL_WORD - 2 * pad,
                hdr_h - 2 * pad, 3, stroke=0, fill=1)
    text(c, (xs[1] + xs[2]) / 2, top_y - hdr_h + 7, "Word", CN, 9, DARK,
         align="center", bold=True)
    text(c, xs[2] + 8, top_y - hdr_h + 7, "Meaning", CN, 9, DARK,
         align="left", bold=True)

    # ---- 数据行 ----
    y = top_y - hdr_h
    for i, (no, word, mean) in enumerate(rows):
        stripe = (i % 2 == 1)                      # 隔行浅橙
        row_bg = STRIPE if stripe else colors.white
        c.setFillColor(row_bg)
        c.rect(xs[0], y - row_h, HALF_W, row_h, stroke=0, fill=1)

        # 序号
        text(c, (xs[0] + xs[1]) / 2, y - row_h / 2 - 3, str(no), EN, 9,
             colors.HexColor("#6B6B6B"), align="center", bold=True)
        # 单词 / 释义
        if mode == "en":
            text(c, xs[1] + 8, y - row_h / 2 - 3.2, word, EN_B, 10.5, DARK)
        else:
            sub = colors.HexColor("#5A5A5A")
            lines = wrap(mean, CN, 8.5, COL_MEAN - 14, 3)
            leading = 9.6
            # 多行整体在行内垂直居中
            first = y - row_h / 2 + (len(lines) - 1) * leading / 2 - 3.0
            for j, ln in enumerate(lines):
                text(c, xs[2] + 8, first - j * leading, ln, CN, 8.5, sub)
        # 勾选框
        draw_checkbox(c, (xs[3] + xs[4]) / 2, y - row_h / 2, 11, row_bg)

        # 横向细线
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        c.line(xs[0], y - row_h, xs[4], y - row_h)
        y -= row_h

    # ---- 竖向虚线 + 外框 ----
    c.setStrokeColor(DASH)
    c.setLineWidth(0.6)
    c.setDash(2, 2)
    for gx in (xs[1], xs[2], xs[3]):
        c.line(gx, top_y, gx, y)
    c.setDash()
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.rect(xs[0], y, HALF_W, top_y - y, stroke=1, fill=0)
    return y


def draw_page(c, left_rows, right_rows, left_mode, right_mode):
    """
    left_rows / right_rows: [(no, word, meaning), ...]
    left_mode / right_mode: 'en'（印单词、释义留空）或 'zh'（印释义、单词留空）
    整页只保留题目（左右两栏表格），从顶部开始排版；不再有页头页尾
    """
    x0 = MARGIN
    table_top = PH - MARGIN                     # 从顶部往下排，词少也不会居中

    # ---- 左右两栏 ----
    bottom = draw_half(c, x0, table_top, left_rows, left_mode)
    draw_half(c, x0 + HALF_W + GAP, table_top, right_rows, right_mode)

    # 中缝虚线
    c.setStrokeColor(DASH)
    c.setLineWidth(0.6)
    c.setDash(2, 2)
    mid = x0 + HALF_W + GAP / 2
    c.line(mid, table_top, mid, bottom)
    c.setDash()


def generate_pdf(path:Path, words:List, mode="both"):
    """
    words = [
        (1, "corresponding", "adj. 符合的，相应的"),
    ]

    mode: 'both' 双向测试（每页 20 词）
          'en'   只印英文，释义留空（每页 40 词）
          'zh'   只印中文，单词留空（每页 40 词）
    """

    per_page = PER_PAGE if mode == "both" else SINGLE_PER_PAGE
    total = len(words)
    pages = max(1, (total + per_page - 1) // per_page)
    c = canvas.Canvas(path.as_posix(), pagesize=A4)
    for p in range(pages):
        chunk = words[p * per_page:(p + 1) * per_page]
        if mode == "both":
            # 同一组词、左印英文右印中文
            rows = [(i + 1, w, m) for i, (_, w, m) in enumerate(chunk)]
            draw_page(c, rows, rows, "en", "zh")
        else:
            # 两栏连续排布，序号跨栏递增；左右都是同一种模式
            n_left = (len(chunk) + 1) // 2
            left = [(i + 1, w, m) for i, (_, w, m) in enumerate(chunk[:n_left])]
            right = [(n_left + i + 1, w, m)
                     for i, (_, w, m) in enumerate(chunk[n_left:])]
            draw_page(c, left, right, mode, mode)
        c.showPage()
    c.save()
    print("生成完成：", path)