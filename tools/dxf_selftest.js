// DWP の PDF→DXF（extractVectors / exportDxf）の自己試験。
// 使い方：DWP（index.html）を開いた状態で、このファイルを <script> で読み込み、
//         await dxfSelfTest() を実行する。結果は [{名前, 判定, 期待, 結果}] の配列で返る。
// 試験用PDFは同梱の pdf-lib でその場で作る（外部ファイル・通信は不要）。
// 期待値は Codex と突き合わせて確定したもの（tools/prompts/dxf_clip_design.md の T1〜T10）＋追加分。
(function(){
  const { PDFDocument, PDFName, PDFNumber, StandardFonts } = PDFLib;

  // 生の描画命令でページを1枚作り、PDF.js のページとして返す
  async function makePage(opts){
    const doc = await PDFDocument.create();
    const page = doc.addPage([opts.w||500, opts.h||500]);
    const ctx = doc.context;
    if(opts.crop) page.setCropBox(...opts.crop);
    if(opts.userUnit) page.node.set(PDFName.of('UserUnit'), PDFNumber.of(opts.userUnit));
    if(opts.form){                                          // Form XObject を /Fm1 として登録
      const f = opts.form;
      const fs = ctx.stream(f.content, {Type:'XObject', Subtype:'Form', BBox:f.bbox, Matrix:f.matrix});
      page.node.setXObject(PDFName.of('Fm1'), ctx.register(fs));
    }
    if(opts.texts){                                         // 文字は pdf-lib の描画に任せる
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for(const t of opts.texts) page.drawText(t.s, {x:t.x, y:t.y, size:10, font});
    }else{
      page.node.set(PDFName.of('Contents'), ctx.register(ctx.stream(opts.content)));
    }
    const bytes = await doc.save();
    const pdf = await pdfjsLib.getDocument(Object.assign({data:bytes}, PDFJS_OPTS)).promise;
    return { pdf, page: await pdf.getPage(1), bytes };
  }
  const r2 = (v)=>Math.round(v*100)/100;
  // 線分の向きをそろえて並べ替え、比べやすい文字列にする
  const norm = (segs)=>segs.map(s=>{
    const a=[r2(s[0]),r2(s[1])], b=[r2(s[2]),r2(s[3])];
    return (a[0]<b[0] || (a[0]===b[0] && a[1]<=b[1])) ? [a,b] : [b,a];
  }).map(([a,b])=>'('+a+')-('+b+')').sort().join(' ');
  const OPT = {text:false, curve:true, fill:false, tolPt:0.5};

  async function lineCase(name, pageOpts, rot, expected){
    const { page } = await makePage(pageOpts);
    const v = await extractVectors(page, rot, OPT);
    const got = norm(v.segs), exp = norm(expected);
    return { 名前:name, 判定: got===exp ? '✅' : '❌', 期待:exp, 結果:got };
  }

  window.dxfSelfTest = async function(){
    const R = [];
    // --- Codex と確定した T1〜T10 ---
    R.push(await lineCase('T1 長方形の切り抜き', {content:'q 100 0 100 500 re W n 0 100 m 1000 100 l S Q'}, 0, [[100,100,200,100]]));
    R.push(await lineCase('T2 用紙の外へはみ出す線', {content:'-100 50 m 600 50 l S'}, 0, [[0,50,500,50]]));
    R.push(await lineCase('T3 restore で切り抜き解除', {content:'q 100 0 100 500 re W n Q 0 200 m 400 200 l S'}, 0, [[0,200,400,200]]));
    R.push(await lineCase('T4 re W S は自分では切られない', {content:'100 0 100 500 re W S 0 300 m 400 300 l S'}, 0,
      [[100,0,200,0],[200,0,200,500],[200,500,100,500],[100,500,100,0],[100,300,200,300]]));
    R.push(await lineCase('T5 切り抜きの重ね掛け', {content:'q 100 0 200 500 re W n 200 0 200 500 re W n 0 100 m 500 100 l S Q'}, 0, [[200,100,300,100]]));
    R.push(await lineCase('T6 三角形の切り抜き', {content:'0 0 m 400 0 l 0 400 l h W n 0 100 m 400 100 l S'}, 0, [[0,100,300,100]]));
    const holed = '0 0 m 400 0 l 400 400 l 0 400 l h 100 100 m 300 100 l 300 300 l 100 300 l h';
    R.push(await lineCase('T7 穴あき evenodd（W*）', {content: holed+' W* n 0 200 m 400 200 l S'}, 0, [[0,200,100,200],[300,200,400,200]]));
    R.push(await lineCase('T7b 同じ形を nonzero（W）', {content: holed+' W n 0 200 m 400 200 l S'}, 0, [[0,200,400,200]]));
    R.push(await lineCase('T8 Form の枠(BBox)で切る',
      {content:'/Fm1 Do', form:{bbox:[0,0,100,100], matrix:[1,0,0,1,50,50], content:'-50 50 m 200 50 l S'}}, 0, [[50,100,150,100]]));
    R.push(await lineCase('T9 DWPで90°回転＋切り抜き', {w:500, h:300, content:'q 100 0 100 300 re W n 0 100 m 500 100 l S Q'}, 90, [[100,400,100,300]]));
    R.push(await lineCase('T10 切り抜きの境界の上の線は残す', {content:'q 100 0 100 500 re W n 100 50 m 100 450 l S Q'}, 0, [[100,50,100,450]]));

    // --- 追加分 ---
    R.push(await lineCase('T11 表示範囲の原点がずれたPDF（CropBox）', {crop:[18,18,464,464], content:'0 100 m 500 100 l S'}, 0, [[0,82,464,82]]));
    R.push(await lineCase('T12 境界から0.01ptだけ外れた枠線も残す', {content:'q 100 0 100 500 re W n 99.99 50 m 99.99 450 l S Q'}, 0, [[99.99,50,99.99,450]]));
    R.push(await lineCase('T13 境界から1pt外れた線は消す', {content:'q 100 0 100 500 re W n 99 50 m 99 450 l S Q'}, 0, []));

    // T14 UserUnit=2：exportDxf の本番経路（mm換算・DXF組み立て）まで通す
    {
      const { pdf, bytes } = await makePage({w:300, h:300, userUnit:2, content:'0 10 m 72 10 l S'});
      const pg = await pdf.getPage(1);
      const id = -9001; docs.set(id, {id, name:'selftest', kind:'pdf', bytes, pdfjsDoc:pdf, mime:'application/pdf'});
      const p = {uid:-9001, docId:id, pageIndex:0, rotation:0, annots:[]};
      const vpW = pg.getViewport({scale:1}).width;
      const sz = await pagePtSize(p);
      const keep = {mode:cvScaleMode, dl:window.downloadBlob};
      let dxf = '';
      window.downloadBlob = async (b)=>{ dxf = await b.text(); };
      cvScaleMode = 'paper'; $('cvDxfText').checked=false;
      await exportDxf({pages:[p], name:'selftest'});
      await new Promise(r=>setTimeout(r,50));
      cvScaleMode = keep.mode; window.downloadBlob = keep.dl; $('cvDxfText').checked=true; docs.delete(id);
      const L = dxf.split('\r\n'); const i = L.indexOf('LINE');
      const val = (code)=>parseFloat(L[L.indexOf(code.padStart(3,' '), i)+1]);
      const len = r2(Math.abs(val('11') - val('10')));
      R.push({ 名前:'T14 UserUnit=2 の長さ（72単位＝紙の上で2インチ）', 判定: (len===50.8 && pg.userUnit===2 && vpW===300 && r2(sz.w)===600) ? '✅' : '❌',
               期待:'50.8mm / userUnit=2 / viewport幅300 / 紙の幅600pt', 結果: len+'mm / userUnit='+pg.userUnit+' / viewport幅'+vpW+' / 紙の幅'+r2(sz.w)+'pt' });
    }

    // T15 曲線の分割上限：巨大な曲線をとても細かい誤差で分けると上限に達し、件数が報告される
    {
      const { page } = await makePage({content:'0 0 m 0 5000 5000 5000 5000 0 c S'});
      const v = await extractVectors(page, 0, Object.assign({}, OPT, {tolPt:1e-4}));
      R.push({ 名前:'T15 曲線の分割上限に達したら報告', 判定: v.st.curveCapped===1 ? '✅' : '❌', 期待:'curveCapped=1', 結果:'curveCapped='+v.st.curveCapped });
    }

    // T16 用紙の外の文字は出さない。
    // 実測：PDF.js 3.11 の getTextContent 自体が用紙の外の文字を1文字単位で落とす（EDGE → ED、OUT は出てこない）。
    // DWP側の四隅による判定は、その二重の保険。
    {
      const { page } = await makePage({texts:[{s:'IN', x:100, y:100}, {s:'EDGE', x:490, y:200}, {s:'OUT', x:600, y:100}]});
      const v = await extractVectors(page, 0, Object.assign({}, OPT, {text:true}));
      const got = v.texts.map(t=>t.s).sort().join(',');
      const ok = v.texts.some(t=>t.s==='IN') && !v.texts.some(t=>/OUT/.test(t.s)) && v.texts.some(t=>/^ED/.test(t.s));
      R.push({ 名前:'T16 用紙の外の文字を除く', 判定: ok ? '✅' : '❌', 期待:'IN と ED…（用紙内の部分）があり、OUT が無い', 結果: got+'（DWP側で除外'+v.tst.out+'）' });
    }

    // T17 重い切り抜きの速さ：2000辺の円（半径200）の中に、横線2万本
    {
      let c = ''; const N=2000;
      for(let k=0;k<N;k++){ const a=2*Math.PI*k/N; c += (250+200*Math.cos(a)).toFixed(4)+' '+(250+200*Math.sin(a)).toFixed(4)+(k? ' l ':' m '); }
      c += 'h W n ';
      for(let k=0;k<20000;k++){ const y=(50+400*k/20000).toFixed(4); c += '0 '+y+' m 500 '+y+' l '; }
      c += 'S';
      const { page } = await makePage({content:c});
      const t0 = performance.now();
      const v = await extractVectors(page, 0, OPT);
      const ms = Math.round(performance.now()-t0);
      const mid = v.segs.find(s=>Math.abs(s[1]-250)<0.011);
      const ok = v.segs.length>=19990 && v.segs.length<=20000 && mid && Math.abs(mid[0]-50)<0.01 && Math.abs(mid[2]-450)<0.01;
      R.push({ 名前:'T17 2000辺の円×横線2万本', 判定: ok ? '✅' : '❌', 期待:'約2万本・中央の線は x=50〜450',
               結果: v.segs.length+'本 / 中央 '+(mid? '('+r2(mid[0])+')〜('+r2(mid[2])+')' : 'なし')+' / '+ms+'ms' });
    }
    // --- 実装レビュー（tools/prompts/dxf_fix_review.md）で Codex が示した反例 ---
    R.push(await lineCase('T18 面積ゼロの輪郭（行って戻る4点）で切り抜く→何も見えない',
      {content:'0 0 m 100 0 l 0 0 l 0 100 l h W n 10 10 m 50 50 l S'}, 0, []));
    R.push(await lineCase('T19 用紙の左端をまたぐ短い急角度の線は、枠ちょうどで切る',
      {content:'-0.01 100 m 0.01 110 l S'}, 0, [[0,105,0.01,110]]));

    // T20 長い斜めの辺だらけの切り抜き（星形 4001辺）：升目・帯への登録数が目安に収まり、すぐ作れる
    {
      const N=4001, a=2*Math.PI*2000/N, pts=[];
      for(let k=0;k<N;k++) pts.push([250+240*Math.cos(k*a), 250+240*Math.sin(k*a)]);
      const t0=performance.now();
      const c=cvMakeClip([pts], 'nonzero', null);
      const ms=Math.round(performance.now()-t0);
      const reg=c.cells.reduce((s,x)=>s+x.length,0) + c.bands.reduce((s,x)=>s+x.length,0);
      const ok = c.kind==='poly' && reg <= 6500000 && ms < 5000;
      R.push({ 名前:'T20 星形4001辺の切り抜きを作る', 判定: ok ? '✅' : '❌', 期待:'登録数 650万以下・5秒以内',
               結果:'登録数 '+reg.toLocaleString()+'（升目 '+c.G+'×'+c.G+'・帯 '+c.nb+'）/ '+ms+'ms' });
    }

    // T21 1本の線が切り抜きで細かく分かれても、線の上限（40万本）を超えない
    //     （上限を小さくはできないので、区間の数だけ確かめる：櫛形の切り抜きを横切る1本の線 → 区間ごとに出る）
    {
      let c=''; for(let k=0;k<200;k++){ const x=(1+2*k)*1.2; c+=x.toFixed(2)+' 0 1.2 500 re '; }
      const { page } = await makePage({content:'q '+c+'W n 0 250 m 500 250 l S Q'});
      const v = await extractVectors(page, 0, OPT);
      R.push({ 名前:'T21 櫛形の切り抜きで1本の線が200区間に分かれる', 判定: v.segs.length===200 ? '✅' : '❌', 期待:'200本', 結果: v.segs.length+'本' });
    }
    return R;
  };
})();
