# 作成した重ね合わせPDFを画像化して目視検品するための補助スクリプト
import os
import fitz

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_test")
for name in ("test1_overlay.pdf", "test1_vector_only.pdf"):
    with fitz.open(os.path.join(BASE, name)) as d:
        pix = d[0].get_pixmap(dpi=110)
        out = os.path.join(BASE, name.replace(".pdf", "_check.png"))
        pix.save(out)
        print("%s -> %dx%d" % (name, pix.width, pix.height))
