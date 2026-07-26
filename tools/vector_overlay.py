# 線抽出の答え合わせ用PDFを2つ作る。
#  (A) test1_overlay.pdf … 元図の上に検出した線を赤で重ねる（どこを拾えたかが一目で分かる）
#  (B) test1_vector_only.pdf … 検出した線だけのベクターPDF（純粋な変換で何が残るかの実物）
import os, json
import fitz

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_test")
K = 72.0 / 300.0                     # px(300dpi) → pt
data = json.load(open(os.path.join(BASE, "lines.json"), encoding="utf-8"))
Wpt, Hpt = data["page_pt"]

# (A) 重ね合わせ
doc = fitz.open()
pg = doc.new_page(width=Wpt, height=Hpt)
pg.insert_image(pg.rect, filename=os.path.join(BASE, "test1.png"))
for L in data["h"]:
    pg.draw_line((L["a"] * K, L["pos"] * K), (L["b"] * K, L["pos"] * K), color=(1, 0, 0), width=0.6)
for L in data["v"]:
    pg.draw_line((L["pos"] * K, L["a"] * K), (L["pos"] * K, L["b"] * K), color=(1, 0, 0), width=0.6)
p1 = os.path.join(BASE, "test1_overlay.pdf")
doc.save(p1, deflate=True)

# (B) 線だけ
doc2 = fitz.open()
p2 = doc2.new_page(width=Wpt, height=Hpt)
for L in data["h"]:
    p2.draw_line((L["a"] * K, L["pos"] * K), (L["b"] * K, L["pos"] * K), color=(0, 0, 0), width=max(0.5, L["th"] * K))
for L in data["v"]:
    p2.draw_line((L["pos"] * K, L["a"] * K), (L["pos"] * K, L["b"] * K), color=(0, 0, 0), width=max(0.5, L["th"] * K))
pth2 = os.path.join(BASE, "test1_vector_only.pdf")
doc2.save(pth2, deflate=True)

print("overlay=%dKB vector_only=%dKB h=%d v=%d" % (
    os.path.getsize(p1) // 1024, os.path.getsize(pth2) // 1024, len(data["h"]), len(data["v"])))
