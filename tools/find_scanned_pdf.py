# スキャン画像だけのPDF（文字データ・線データを持たないPDF）を探す調査スクリプト。
# 読み取りのみ。結果は UTF-8 のテキストへ書き出す（コンソールの文字化けを避けるため）。
import os, glob, sys
import fitz  # PyMuPDF

ROOTS = [r"C:\Users\mishima_cl_18\Downloads", r"C:\Users\mishima_cl_18\Desktop"]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scan_survey.txt")

rows = []
checked = 0
for root in ROOTS:
    for path in glob.glob(os.path.join(root, "**", "*.pdf"), recursive=True):
        checked += 1
        try:
            with fitz.open(path) as d:
                if d.page_count == 0:
                    continue
                pg = d[0]
                n_text = len(pg.get_text().strip())      # 文字データの量
                n_draw = len(pg.get_drawings())          # ベクター線の数
                n_img = len(pg.get_images(full=True))    # 貼られた画像の数
                r = pg.rect
                # スキャンPDFの典型＝文字ゼロ・線ほぼゼロ・画像あり
                if n_text == 0 and n_draw <= 2 and n_img >= 1:
                    rows.append((path, d.page_count, n_text, n_draw, n_img,
                                 round(r.width), round(r.height)))
        except Exception:
            pass

rows.sort(key=lambda x: -(x[5] * x[6]))   # 大きい図面から
with open(OUT, "w", encoding="utf-8") as f:
    f.write("checked=%d  scanned_candidates=%d\n\n" % (checked, len(rows)))
    for i, (p, pc, nt, nd, ni, w, h) in enumerate(rows[:40], 1):
        f.write("%2d) %dp text=%d draw=%d img=%d size=%dx%d\n    %s\n" % (i, pc, nt, nd, ni, w, h, p))
print("checked=%d scanned_candidates=%d" % (checked, len(rows)))
print("out=%s" % OUT)
