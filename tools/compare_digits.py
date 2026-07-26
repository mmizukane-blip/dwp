# 8種類のOCR結果（エンジン×前処理）を突き合わせ、数字・寸法の信頼度を検証する。
#  ・丸数字(①②…)→普通の数字へ正規化（Tesseract日本語の癖の補正）
#  ・「2つ以上の読み方で一致した寸法」＝信頼できる読み、として抽出
#  ・1文字違いのペア＝どちらかが誤読の候補、として警告
import os, re
from collections import Counter, OrderedDict
import fitz

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_test")

def read(name):
    p = os.path.join(BASE, name)
    if not os.path.exists(p):
        return None
    t = open(p, encoding="utf-8", errors="replace").read()
    return None if t.startswith("ENGINE_NULL") else t

def pdf_text(name):
    p = os.path.join(BASE, name)
    if not os.path.exists(p):
        return None
    with fitz.open(p) as d:
        return d[0].get_text()

SRC = OrderedDict([
    ("Tess日本語_元",     pdf_text("test1_psm11.pdf")),
    ("Tess日本語_線消し", read("clean_jpn.txt")),
    ("Tess英語_元",       read("test1_eng.txt")),
    ("Tess英語_線消し",   read("clean_eng.txt")),
    ("Tess数字限定",      read("clean_wl.txt")),
    ("Win標準_元",        read("win_orig.txt")),
    ("Win標準_線消し",    read("win_clean.txt")),
    ("Tess_赤分離",       read("red_jpn.txt")),
])

CIRC = {c: str(i) for i, c in enumerate("⓪①②③④⑤⑥⑦⑧⑨")}
CIRC.update({c: str(i + 10) for i, c in enumerate("⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲")})
CIRC["⑳"] = "20"
ZEN = {chr(0xFF10 + i): str(i) for i in range(10)}

def norm(t):
    t = "".join(CIRC.get(ch, ZEN.get(ch, ch)) for ch in t)
    t = re.sub(r"(?<=[0-9]) (?=[0-9])", "", t)      # 「1 5 5 0」→「1550」
    return t

PATS = [r"\d{2,4}x\d{2,4}", r"FL[+\-]?\d{3,4}", r"[WDH]\d{3,4}", r"\d{3,5}"]

def toks(t):
    c = Counter()
    for p in PATS:
        for m in re.findall(p, norm(t)):
            c[m] += 1
    return c

tokmap = {}
lines = []
lines.append("=== 各読み取りの規模 ===")
for name, t in SRC.items():
    if t is None:
        lines.append("%-16s: なし" % name); continue
    c = toks(t)
    tokmap[name] = c
    lines.append("%-16s: 文字数=%5d  数字トークン=%3d種  ハッチング誤読『楊』=%d回"
                 % (name, len(t), len(c), t.count("楊")))

# --- 2つ以上のソースで一致した読み ---
agree = Counter()
where = {}
for name, c in tokmap.items():
    for tk in c:
        agree[tk] += 1
        where.setdefault(tk, []).append(name)
conf = sorted([(n, tk) for tk, n in agree.items() if n >= 2], reverse=True)
lines.append("")
lines.append("=== 2つ以上で一致した読み（信頼できる候補）: %d件 ===" % len(conf))
for n, tk in conf[:50]:
    lines.append("  %-12s … %d通りが一致（%s）" % (tk, n, "、".join(where[tk][:4])))

# --- 1文字違い＝誤読の疑いペア ---
allt = sorted(agree.keys())
sus = []
for i, a in enumerate(allt):
    for b in allt[i + 1:]:
        if len(a) == len(b) and sum(x != y for x, y in zip(a, b)) == 1:
            sus.append((a, agree[a], b, agree[b]))
lines.append("")
lines.append("=== 1文字違いのペア（どちらかが誤読の疑い）: %d組（先頭30） ===" % len(sus))
for a, na, b, nb in sus[:30]:
    lines.append("  %s(%d票) ⇔ %s(%d票)" % (a, na, b, nb))

# --- 赤分離レイヤーの中身（筋違符号が読めたか） ---
red = SRC.get("Tess_赤分離")
if red:
    lines.append("")
    lines.append("=== 赤マーキングだけの読み取り ===")
    lines.append("  910の出現: %d回" % norm(red).count("910"))
    for s in "いはちへとろ":
        lines.append("  符号「%s」: %d回" % (s, red.count(s)))
    body = " / ".join(x.strip() for x in red.splitlines() if x.strip())[:600]
    lines.append("  全文: " + body)

rep = os.path.join(BASE, "compare_report.txt")
open(rep, "w", encoding="utf-8").write("\n".join(lines))
print("sources=%d confident=%d suspects=%d report=compare_report.txt"
      % (len(tokmap), len(conf), len(sus)))
