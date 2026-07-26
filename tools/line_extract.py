# スキャン図面から「長い横線・縦線」を抜き出す検証スクリプト（OpenCV不使用・numpy+PILのみ）。
# 出力: 1) lines.json（線の一覧＝ベクター化の素）
#       2) test1_clean.png（線を消した画像＝OCR前処理用）
#       3) line_stats.txt（カバレッジ・グリッド間隔・斜め線の有無）
import os, sys, json
import numpy as np
from PIL import Image

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_test")
PNG = os.path.join(BASE, "test1.png")
DPI = 300
LMIN = 60          # これ以上つながった黒を「線」とみなす(px)≒紙上5mm
GAP = 2            # 隣の行とのつながり許容(px)

img = Image.open(PNG).convert("L")
a = np.asarray(img)
H, W = a.shape
if len(sys.argv) > 1:
    thr = int(sys.argv[1])
else:
    # うすいスキャン対策：インク（黒）の割合が約2%になる濃さを自動で選ぶ（140〜235の範囲）
    hist = np.bincount(a.ravel(), minlength=256)
    cum = np.cumsum(hist) / a.size
    thr = int(np.clip(np.searchsorted(cum, 0.02), 140, 235))
dark = a < thr
total_dark = int(dark.sum())

def runs_along_axis(D, lmin):
    """各行の長い黒ランを (行, 開始, 終了) で返す（終了は含まない）"""
    out = []
    Hh, Ww = D.shape
    for y in range(Hh):
        row = D[y]
        d = np.diff(row.astype(np.int8))
        starts = np.where(d == 1)[0] + 1
        ends = np.where(d == -1)[0] + 1
        if row[0]:
            starts = np.r_[0, starts]
        if row[-1]:
            ends = np.r_[ends, Ww]
        L = ends - starts
        for s, e in zip(starts[L >= lmin], ends[L >= lmin]):
            out.append((y, int(s), int(e)))
    return out

def cluster(segs):
    """隣り合う行の重なるランをまとめて1本の線にする"""
    done, act = [], []          # act: [x0, x1, ylast, ysum, cnt]
    for y, s, e in segs:        # yは昇順
        hit = None
        for c in act:
            if y - c[2] <= GAP and not (e <= c[0] - 2 or s >= c[1] + 2):
                hit = c; break
        if hit:
            hit[0] = min(hit[0], s); hit[1] = max(hit[1], e)
            hit[2] = y; hit[3] += y; hit[4] += 1
        else:
            act.append([s, e, y, y, 1])
        act2 = []
        for c in act:
            (done if y - c[2] > GAP else act2).append(c)
        act = act2
    done.extend(act)
    return [{"pos": round(ys / cnt, 1), "a": x0, "b": x1, "th": cnt, "len": x1 - x0}
            for x0, x1, yl, ys, cnt in done]

hsegs = runs_along_axis(dark, LMIN)
vsegs = runs_along_axis(dark.T, LMIN)
mask = np.zeros_like(dark)
for y, s, e in hsegs:
    mask[y, s:e] = True
for x, s, e in vsegs:
    mask[s:e, x] = True
covered = int((dark & mask).sum())

clean = a.copy()
clean[mask] = 255
Image.fromarray(clean).save(os.path.join(BASE, "test1_clean.png"), dpi=(DPI, DPI))

hlines = cluster(hsegs)
vlines = cluster(vsegs)

# --- グリッド間隔（910モジュール照合） ---
# 壁線は開口や文字で途切れるので、「同じ位置に線分が集中する场所」を重み付きヒストグラムで拾う
LMIN2 = 30
hsegs2 = runs_along_axis(dark, LMIN2)
vsegs2 = runs_along_axis(dark.T, LMIN2)

def peaks_of(segs, n):
    w = np.zeros(n, np.float64)
    for p, s, e in segs:
        w[p] += (e - s)
    ws = np.convolve(w, np.ones(7), "same")
    th = max(ws.max() * 0.10, 900.0)
    ps = []
    for i in range(3, n - 3):
        if ws[i] >= th and ws[i] == ws[i - 3:i + 4].max():
            if not ps or i - ps[-1] >= 40:
                ps.append(i)
    return ps

vx = peaks_of(vsegs2, W)          # 縦線が集中するX位置（通り芯候補）
hy = peaks_of(hsegs2, H)          # 横線が集中するY位置
vdiffs = [round(b - a, 1) for a, b in zip(vx, vx[1:])]
hdiffs = [round(b - a, 1) for a, b in zip(hy, hy[1:])]

def grid_err(diffs, scale):
    """検出間隔が『実寸455mmの倍数』にどれだけ近いか（scale=図面の縮尺分母）"""
    errs = []
    for d in diffs:
        real = d / DPI * 25.4 * scale
        k = round(real / 455)
        if k >= 1:
            errs.append(abs(real - 455 * k))
    return (len(errs), round(float(np.mean(errs)), 1) if errs else -1)

# --- 斜め線（筋交い等）の気配を粗いハフ変換で見る ---
rem = dark & ~mask
H4, W4 = (H // 4) * 4, (W // 4) * 4
r4 = rem[:H4, :W4].reshape(H4 // 4, 4, W4 // 4, 4).any(axis=(1, 3))
ys, xs = np.nonzero(r4)
diag_top, med = [], 0
if ys.size:
    xs = xs.astype(np.float32); ys = ys.astype(np.float32)
    dmax = float(np.hypot(*r4.shape))
    peaks = []
    for adeg in list(range(10, 81)) + list(range(100, 171)):
        t = np.deg2rad(adeg)
        rho = xs * np.cos(t) + ys * np.sin(t)
        hist, _ = np.histogram(rho, bins=int(dmax), range=(-dmax, dmax))
        peaks.append((int(hist.max()), adeg))
    med = int(np.median([p[0] for p in peaks]))
    peaks.sort(reverse=True)
    diag_top = peaks[:8]

json.dump({"page_pt": [W * 72.0 / DPI, H * 72.0 / DPI], "h": hlines, "v": vlines},
          open(os.path.join(BASE, "lines.json"), "w", encoding="utf-8"))

with open(os.path.join(BASE, "line_stats.txt"), "w", encoding="utf-8") as f:
    f.write("画像: %dx%dpx  しきい値=%d  黒画素=%d（%.1f%%）\n" % (W, H, thr, total_dark, 100.0 * total_dark / (W * H)))
    f.write("長い線に属する黒画素: %d → カバレッジ %.1f%%\n" % (covered, 100.0 * covered / max(1, total_dark)))
    f.write("横線: %d本  縦線: %d本（クラスタ後・LMIN=%dpx）\n\n" % (len(hlines), len(vlines), LMIN))
    f.write("縦線が集中するX位置（通り芯候補）: %d本\n  間隔: %s\n" % (len(vx), vdiffs[:40]))
    f.write("横線が集中するY位置: %d本\n  間隔: %s\n\n" % (len(hy), hdiffs[:40]))
    for sc in (50, 100):
        n1, e1 = grid_err(vdiffs, sc); n2, e2 = grid_err(hdiffs, sc)
        f.write("縮尺1/%d と仮定 → 455mm倍数との平均ズレ: 縦%dか所 %.1fmm / 横%dか所 %.1fmm\n" % (sc, n1, e1, n2, e2))
    f.write("\n斜め線の気配（角度, 一直線上の点数）上位: %s  ノイズ基準(中央値)=%d\n" % (diag_top, med))

print("dark=%d covered_pct=%.1f h=%d v=%d clean_saved=1" % (total_dark, 100.0 * covered / max(1, total_dark), len(hlines), len(vlines)))
