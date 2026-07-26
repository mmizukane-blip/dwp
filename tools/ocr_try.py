# スキャン図面PDF → OCR（Tesseract）で「透明な文字を重ねた検索できるPDF」を試作する実験。
# 見た目は元のまま。文字が選択・検索でき、モジュールグリッドの「文字への吸着」も効くようになる想定。
# 使い方: python ocr_try.py "<入力PDF>" [ページ番号(1始まり)]
import os, sys, subprocess, io
import fitz
from PIL import Image

TESS = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
DPI = 300
OUTDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_test")
os.makedirs(OUTDIR, exist_ok=True)

src = sys.argv[1]
pageno = int(sys.argv[2]) if len(sys.argv) > 2 else 1
stem = "test%d" % pageno

# --- 1) 指定ページを300dpiのPNGにする（DPI情報も埋める＝出力PDFの紙サイズが狂わないように） ---
doc = fitz.open(src)
pg = doc[pageno-1]
base_w, base_h = round(pg.rect.width), round(pg.rect.height)
pix = pg.get_pixmap(dpi=DPI)
png = os.path.join(OUTDIR, stem + ".png")
Image.open(io.BytesIO(pix.tobytes("png"))).save(png, dpi=(DPI, DPI))
doc.close()
print("page=%d  original_pt=%dx%d  png=%dx%d" % (pageno, base_w, base_h, pix.width, pix.height))

# --- 2) OCR（読み取り方式を2種類ためして比べる） ---
# psm 3 = 通常の段組み想定 / psm 11 = ばらばらに散った文字向け（図面はこちらが効くことが多い）
results = {}
for psm in (3, 11):
    out = os.path.join(OUTDIR, "%s_psm%d" % (stem, psm))
    cmd = [TESS, png, out, "-l", "jpn+eng", "--psm", str(psm), "--dpi", str(DPI), "pdf"]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print("psm%d FAILED: %s" % (psm, (r.stderr or "")[:200])); continue
    # --- 3) できたPDFから文字を取り出して精度を実測 ---
    with fitz.open(out + ".pdf") as d:
        p = d[0]
        words = p.get_text("words")
        txt = p.get_text().strip()
        results[psm] = (len(words), len(txt), round(p.rect.width), round(p.rect.height), txt)
    print("psm%-3d words=%-5d chars=%-6d page_pt=%dx%d  -> %s.pdf"
          % (psm, results[psm][0], results[psm][1], results[psm][2], results[psm][3], os.path.basename(out)))

# --- 4) 読み取れた文字を確認用に書き出す（目で精度を判断するため） ---
rep = os.path.join(OUTDIR, stem + "_result.txt")
with open(rep, "w", encoding="utf-8") as f:
    f.write("元PDF: %s\nページ: %d\n元の紙サイズ(pt): %dx%d\n\n" % (src, pageno, base_w, base_h))
    for psm, v in results.items():
        f.write("=== psm%d : 単語数=%d 文字数=%d 出力紙サイズ=%dx%d ===\n" % (psm, v[0], v[1], v[2], v[3]))
        f.write(v[4][:3000] + "\n\n")
print("report=%s" % rep)
