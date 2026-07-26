# スキャン図面PDFの全ページから横線・縦線を抽出し、DWP取り込み用の .lines.json を作る（線レイヤー第1段階）
# 使い方: python make_lines.py "<PDFのパス>" [しきい値(省略=ページごとに自動)]
# 出力: PDFと同じフォルダに <名前>.lines.json → DWPへドラッグ＆ドロップで取り込み
#
# 座標の決め事（DWP側 dispLines と対）:
#  ・回転0（PDFの/Rotate指示は無視。DWPの表示と同じ向き）で抽出する
#  ・0〜1の正規化座標。横線={p:y, a:x0, b:x1, t:太さpx} 縦線={p:x, a:y0, b:y1, t:太さpx}
import os, sys, json
import numpy as np
import fitz

DPI = 300
LMIN = 60      # これ以上つながった黒を「線」とみなす(px)≒紙上5mm
GAP = 2        # 隣の行とのつながり許容(px)

def runs(D, lmin):
    """各行の長い黒ランを (行, 開始, 終了) で返す"""
    out = []
    Hh, Ww = D.shape
    for y in range(Hh):
        row = D[y]
        d = np.diff(row.astype(np.int8))
        st = np.where(d == 1)[0] + 1
        en = np.where(d == -1)[0] + 1
        if row[0]:
            st = np.r_[0, st]
        if row[-1]:
            en = np.r_[en, Ww]
        L = en - st
        for s, e in zip(st[L >= lmin], en[L >= lmin]):
            out.append((y, int(s), int(e)))
    return out

def cluster(segs):
    """隣り合う行の重なるランをまとめて1本の線にする"""
    done, act = [], []          # act: [x0, x1, ylast, ysum, cnt]
    for y, s, e in segs:
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
    return [{"pos": ys / cnt, "a": x0, "b": x1, "th": cnt} for x0, x1, yl, ys, cnt in done]

def main():
    src = sys.argv[1]
    thr_fix = int(sys.argv[2]) if len(sys.argv) > 2 else None
    doc = fitz.open(src)
    pages_out = []
    for i in range(doc.page_count):
        pg = doc[i]
        pg.set_rotation(0)                       # DWPの表示（/Rotate無視）と向きを合わせる
        pix = pg.get_pixmap(dpi=DPI, colorspace=fitz.csGRAY)
        buf = np.frombuffer(pix.samples, np.uint8)
        a = buf.reshape(pix.height, pix.stride)[:, :pix.width]
        if thr_fix:
            thr = thr_fix
        else:
            # うすいスキャン対策：インクの割合が約2%になる濃さを自動で選ぶ
            cum = np.cumsum(np.bincount(a.ravel(), minlength=256)) / a.size
            thr = int(np.clip(np.searchsorted(cum, 0.02), 140, 235))
        dark = a < thr
        hs = runs(dark, LMIN)
        vs = runs(dark.T, LMIN)
        mask = np.zeros_like(dark)
        for y, s, e in hs:
            mask[y, s:e] = True
        for x, s, e in vs:
            mask[s:e, x] = True
        td = int(dark.sum())
        cov = round(100.0 * int((dark & mask).sum()) / max(1, td), 1)
        W, H = pix.width, pix.height
        hl = [{"p": round(L["pos"] / H, 4), "a": round(L["a"] / W, 4), "b": round(L["b"] / W, 4), "t": L["th"]}
              for L in cluster(hs)]
        vl = [{"p": round(L["pos"] / W, 4), "a": round(L["a"] / H, 4), "b": round(L["b"] / H, 4), "t": L["th"]}
              for L in cluster(vs)]
        pages_out.append({"page": i + 1, "thr": thr, "coverage": cov, "h": hl, "v": vl})
        print("page %d/%d thr=%d h=%d v=%d coverage=%.1f%%" % (i + 1, doc.page_count, thr, len(hl), len(vl), cov))
    out = {"type": "dwp-lines", "ver": 1, "src": os.path.basename(src), "dpi": DPI, "pages": pages_out}
    dst = os.path.join(os.path.dirname(os.path.abspath(src)),
                       os.path.splitext(os.path.basename(src))[0] + ".lines.json")
    json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
    print("saved bytes=%d pages=%d" % (os.path.getsize(dst), len(pages_out)))

if __name__ == "__main__":
    main()
