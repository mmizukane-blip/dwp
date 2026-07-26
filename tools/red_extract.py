# カラー情報を使う検証：赤いマーキング（筋違符号・手書き寸法など）だけを分離した画像を作る。
# 図面の黒線と混ざらないため、OCRの読み取り対象を絞り込める。
import os
import numpy as np
from PIL import Image

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_test")
img = Image.open(os.path.join(BASE, "test1.png")).convert("RGB")
a = np.asarray(img).astype(np.int16)
R, G, B = a[..., 0], a[..., 1], a[..., 2]

# 赤の条件：R成分が強く、G/Bより明確に大きい（朱書き・赤ペンを想定）
red = (R > 120) & (R - G > 45) & (R - B > 45)
n = int(red.sum())

out = np.full(a.shape[:2], 255, np.uint8)
out[red] = 0                     # 赤い部分だけを黒として白紙に写す（OCRしやすい形）
Image.fromarray(out).save(os.path.join(BASE, "test1_red.png"), dpi=(300, 300))

ys, xs = np.nonzero(red)
print("red_px=%d bbox=(%d,%d)-(%d,%d)" % (n, xs.min() if n else -1, ys.min() if n else -1,
                                          xs.max() if n else -1, ys.max() if n else -1))
