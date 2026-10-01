# DXF を「線の本数」「文字だけ」で切り分けた試験用ファイルを作る。
# XSTAR の背景DXF読込が、どのくらいの量で止まるかを確かめるためのもの。
# 使い方: python split_dxf_for_test.py <元のDXF>
# 出力: tools/dxf_split/ に lines_2000.dxf などを作る（文字コードは元と同じ CP932 のまま）
import os
import sys

CRLF = chr(13) + chr(10)


def main(src):
    raw = open(src, 'rb').read()
    rows = raw.decode('cp932').split(CRLF)
    head_end = rows.index('ENTITIES') + 1          # ENTITIES の値の行まで（ヘッダとTABLESを含む）
    head = rows[:head_end]

    # ENTITIES を要素ごとに切り出す（各要素は「  0 / 種類」から次の「  0」の手前まで）
    ents = []
    cur = None
    i = head_end
    while i < len(rows) - 1:
        code, val = rows[i], rows[i + 1]
        if code.strip() == '0':
            if cur:
                ents.append(cur)
            if val == 'ENDSEC':
                break
            cur = {'type': val, 'rows': [code, val]}
        elif cur:
            cur['rows'] += [code, val]
        i += 2
    lines = [e for e in ents if e['type'] == 'LINE']
    texts = [e for e in ents if e['type'] == 'TEXT']
    print('元: LINE', len(lines), '本 / TEXT', len(texts), '個')

    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dxf_split')
    os.makedirs(out_dir, exist_ok=True)

    def write(name, items):
        body = []
        for e in items:
            body += e['rows']
        text = CRLF.join(head + body + ['  0', 'ENDSEC', '  0', 'EOF']) + CRLF
        path = os.path.join(out_dir, name)
        open(path, 'wb').write(text.encode('cp932'))
        print('{:<18} {:>6} 要素 {:>9,} バイト'.format(name, len(items), os.path.getsize(path)))

    for n in (1000, 3000, 10000, 20000):
        if n < len(lines):
            write('lines_{}.dxf'.format(n), lines[:n])
    write('texts_only.dxf', texts)


if __name__ == '__main__':
    main(sys.argv[1])
