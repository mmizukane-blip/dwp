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
    // --- 文字コード（Shift-JIS / CP932）。期待値は Windows の .NET Encoding 932 で実測した値 ---
    {
      const hex=(u8)=>[...u8].map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join(' ');
      const cases=[['通り芯','92 CA 82 E8 90 63'],['１階','82 50 8A 4B'],['柱','92 8C'],['表','95 5C'],
                   ['～','81 60'],['①','87 40'],['㈱','87 8A'],['髙','FB FC'],['Ⅳ','87 57'],['ｱ','B1'],['A\\B','41 5C 42']];
      const bad=[];
      for(const [s,exp] of cases){ const got=hex(cvToSjis(s).bytes); if(got!==exp) bad.push(s+': 期待 '+exp+' / 結果 '+got); }
      R.push({ 名前:'T22 CP932のバイト列（重複マッピング・2バイト目が5Cの文字を含む）', 判定: bad.length? '❌' : '✅',
               期待:'Windowsと同じバイト列', 結果: bad.length? bad.join(' / ') : cases.length+'種すべて一致' });
    }
    {
      // 出せない文字は ? にして数え、形の同じ文字に置き換えられるものは置き換える
      const r1=cvToSjis('〜');                      // U+301C 波ダッシュ → ～(U+FF5E) 81 60
      const r2=cvToSjis('あ😀い');                  // 絵文字はCP932に無い → ?（サロゲートペアを1文字として扱えているか）
      const ok = [...r1.bytes].join()==='129,96' && r1.alt===1 && r1.miss.size===0
              && [...r2.bytes].join()==='130,160,63,130,162' && r2.miss.get('😀')===1 && r2.miss.size===1;
      R.push({ 名前:'T23 出せない文字の扱い（置き換え・?・絵文字）', 判定: ok ? '✅' : '❌',
               期待:'〜→81 60（置換1件）／あ😀い→82 A0 3F 82 A2（?1件）',
               結果:'〜→'+[...r1.bytes].map(b=>b.toString(16))+'（置換'+r1.alt+'件・不可'+r1.miss.size+'）／あ😀い→'+[...r2.bytes].map(b=>b.toString(16))+'（不可'+r2.miss.size+'）' });
    }
    {
      // DXF全体を Shift-JIS で組み立てたとき、TEXT の値が正しいバイト列になっているか
      const v={segs:[], pageW:100, pageH:100, texts:[{x:0,y:0,h:10,ang:0,wf:1,s:'表通り芯'}]};
      const txt=buildDxf(v, 1, 'sjis');
      const bytes=cvToSjis(txt).bytes;
      const dec=new TextDecoder('shift_jis').decode(bytes);
      const L=dec.split('\r\n'); const val=L[L.lastIndexOf('  1')+1];
      const ok = val==='表通り芯' && !txt.includes('\\U+') && !dec.includes('AC1021');
      R.push({ 名前:'T24 Shift-JISのDXFを読み戻すと元の文字になる', 判定: ok ? '✅' : '❌',
               期待:'表通り芯（\\U+変換なし・$ACADVERなし）', 結果: val });
    }
    // T25 容量：線種の行を書かず、数値の末尾ゼロを落とす（値と見た目は変えない）
    {
      const CRLF = String.fromCharCode(13,10);
      const v={segs:[[0,0,100,0],[150,50,200,50]], pageW:200, pageH:100, texts:[{x:10,y:10,h:5,ang:0,wf:1,s:'A'}]};
      const txt=buildDxf(v, 1, 'sjis');
      const rows=txt.split(CRLF);
      const i=rows.indexOf('LINE');
      const rec=rows.slice(i-1, i+10).join('|');
      const v10=rows[rows.indexOf(' 10', i)+1];
      const a=txt.indexOf(CRLF+'  0'+CRLF+'LINE');
      const b=txt.indexOf(CRLF+'  0'+CRLF, a+8);
      const per=(a>=0 && b>a) ? (b-a) : -1;
      const ok = rec.indexOf('CONTINUOUS')<0 && rec.indexOf(' 30')<0 && v10==='0.0' && txt.indexOf('.000')<0 && per>0 && per<=100;
      R.push({ 名前:'T25 1本あたりの容量を削る（線種の省略・末尾ゼロ）', 判定: ok ? '✅' : '❌',
               期待:'線種の行なし・Z座標なし・0.000→0.0・1本100バイト以下',
               結果:'1本'+per+'バイト / 最初の座標「'+v10+'」/ 線種行'+(rec.indexOf('CONTINUOUS')<0?'なし':'あり') });
    }
    // --- 線をまとめる（LWPOLYLINE）。DXFを読み戻して、元の線分と1本残らず一致するかで確かめる ---
    const parseDxf=(txt)=>{
      const rows=txt.split(String.fromCharCode(13,10));
      const ents=[]; let cur=null;
      for(let i=rows.indexOf('ENTITIES')+1; i<rows.length-1; i+=2){
        const code=rows[i].trim(), val=rows[i+1];
        if(code==='0'){ if(cur) ents.push(cur); if(val==='ENDSEC'){ cur=null; break; } cur={type:val, g:[]}; continue; }
        if(cur) cur.g.push([code,val]);
      }
      const segs=[]; let nLine=0, nPoly=0; const closed=[];
      for(const e of ents){
        if(e.type==='LINE'){ nLine++; const m={}; for(const [c,v] of e.g) m[c]=v;
          segs.push([+m['10'],+m['20'],+m['11'],+m['21']]); }
        if(e.type==='LWPOLYLINE'){ nPoly++; const pts=[]; let cl=0, x=null;
          for(const [c,v] of e.g){ if(c==='70') cl=+v; if(c==='10') x=+v; if(c==='20') pts.push([x,+v]); }
          closed.push(cl);
          for(let k=0;k<pts.length-1;k++) segs.push([pts[k][0],pts[k][1],pts[k+1][0],pts[k+1][1]]);
          if(cl) segs.push([pts[pts.length-1][0],pts[pts.length-1][1],pts[0][0],pts[0][1]]); }
      }
      return {segs, nLine, nPoly, closed, hasZ: rows.slice(rows.indexOf('ENTITIES')).some(r=>r===' 30'||r===' 31')};
    };
    const key=(a)=>a.map(s=>s.map(v=>(+v).toFixed(3)).join(',')).join(' | ');
    {
      const zig=[]; for(let k=0;k<10;k++) zig.push([k*10,(k%2)*5,(k+1)*10,((k+1)%2)*5]);        // 10本つながった折れ線
      const rect=[[120,0,170,0],[170,0,170,30],[170,30,120,30],[120,30,120,0]];                // 閉じた四角形（折れ線の終点(100,0)とはつながらない位置）
      const two=[[300,0,310,0],[310,0,310,10]];                                                 // 2本だけのつながり
      const lone=[[400,0,450,0],[400,50,450,60]];                                               // 離れた線
      const src=[...zig, ...rect, ...two, ...lone];
      const txt=buildDxf({segs:src, texts:[], pageW:500, pageH:100}, 1, 'sjis');
      const r=parseDxf(txt);
      const same = key(r.segs)===key(src);
      const ok = same && r.nPoly===2 && r.closed.join()==='0,1' && r.nLine===4 && !r.hasZ;
      R.push({ 名前:'T26 つながった線をポリラインにまとめても、読み戻すと元の線分と一致', 判定: ok ? '✅' : '❌',
               期待:'線分が完全一致・ポリライン2個（開1・閉1）・LINE4本（2本のつながり＋離れた2本）・Zなし',
               結果:(same?'一致':'不一致')+' / ポリライン'+r.nPoly+'個（閉じ '+r.closed.join()+'）/ LINE'+r.nLine+'本 / Z'+(r.hasZ?'あり':'なし') });
    }
    {
      // 丸めて -0.0 になる点でもつながる（-0.0 と 0.0 をそろえる）
      const src=[[10,0,-0.0004,0],[0.0003,0,0,10],[0,10,10,10],[10,10,20,10]];
      const txt=buildDxf({segs:src, texts:[], pageW:100, pageH:100}, 1, 'sjis');
      const r=parseDxf(txt);
      const ok = r.nPoly===1 && r.nLine===0 && txt.indexOf('-0.0')<0;
      R.push({ 名前:'T27 丸めて -0.0 になる点も同じ点としてつながる', 判定: ok ? '✅' : '❌',
               期待:'ポリライン1個・「-0.0」なし', 結果:'ポリライン'+r.nPoly+'個・LINE'+r.nLine+'本・「-0.0」'+(txt.indexOf('-0.0')<0?'なし':'あり') });
    }
    {
      // 丸めた後に長さがゼロになる線は出さない
      const src=[[5.0001,5,5.0004,5],[0,0,10,0]];
      const r=parseDxf(buildDxf({segs:src, texts:[], pageW:100, pageH:100}, 1, 'sjis'));
      const ok = r.nLine===1 && r.nPoly===0 && key(r.segs)===key([[0,0,10,0]]);
      R.push({ 名前:'T28 丸めると長さゼロになる線は出さない', 判定: ok ? '✅' : '❌', 期待:'LINE1本だけ', 結果:'LINE'+r.nLine+'本・ポリライン'+r.nPoly+'個' });
    }
    // --- 塗りの輪郭は、ほかの線と重なる区間を除いて足す（tools/prompts/dxf_fill_dedupe.md） ---
    const FILL=Object.assign({}, OPT, {fill:true});
    const setOf=(segs)=>segs.map(q=>{ const a=q[0].toFixed(2)+','+q[1].toFixed(2), b=q[2].toFixed(2)+','+q[3].toFixed(2); return a<b?a+'|'+b:b+'|'+a; }).sort().join(' ');
    const fillCase=async (name, content, expected, check)=>{
      const { page } = await makePage({content});
      const v = await extractVectors(page, 0, FILL);
      const got=setOf(v.segs), exp=setOf(expected);
      const ok = got===exp && (!check || check(v));
      R.push({ 名前:name, 判定: ok?'✅':'❌', 期待:exp+(check?'（＋件数の条件）':''), 結果:got+' / 追加'+v.st.fillAdded+'・重複'+v.st.fillDup });
      return v;
    };
    await fillCase('T29 線で描いた四角と同じ塗りは省き、塗りだけの四角は出す（Codexの入力例）',
      '100 100 50 50 re S 100 100 50 50 re f 300 300 10 10 re f',
      [[100,100,150,100],[150,100,150,150],[150,150,100,150],[100,150,100,100],
       [300,300,310,300],[310,300,310,310],[310,310,300,310],[300,310,300,300]],
      v=>v.st.fillDup===4 && v.st.fillAdded===4);
    await fillCase('T30 一部だけ重なる辺は、重ならない区間だけ出す',
      '0 100 m 100 100 l S 50 100 100 20 re f',
      [[0,100,100,100],[100,100,150,100],[150,100,150,120],[150,120,50,120],[50,120,50,100]]);
    await fillCase('T31 隣り合う塗りの共有辺は1回だけ',
      '10 10 10 10 re f 20 10 10 10 re f',
      [[10,10,20,10],[20,10,20,20],[20,20,10,20],[10,20,10,10],[20,10,30,10],[30,10,30,20],[30,20,20,20]]);
    await fillCase('T32 丸めの境目をまたぐほぼ同じ位置（0.0002pt差）は重なりとみなす',
      '100.0049 50 m 100.0049 150 l S 100.0051 50 50 100 re f',
      [[100.0049,50,100.0049,150],[100.0051,50,150.0051,50],[150.0051,50,150.0051,150],[150.0051,150,100.0051,150]]);
    {
      // 線と塗りの境目ではポリラインにつながない（線の終点＝塗りの始点でも別にする）
      const { page } = await makePage({content:'10 300 m 60 300 l S 60 300 m 110 300 l 110 350 l 60 350 l h f'});
      const v = await extractVectors(page, 0, FILL);
      const r = parseDxf(buildDxf(v, 1, 'sjis'));
      const lone = r.segs.some(q=>q[0]===10 && q[1]===300 && q[2]===60 && q[3]===300) && r.nLine>=1;
      const ok = v.breakAt===1 && lone && key(r.segs)===key(v.segs);
      R.push({ 名前:'T33 線と塗りの境目ではポリラインにつながない', 判定: ok?'✅':'❌', 期待:'境目=1・線は単独のLINE・読み戻して一致',
               結果:'境目='+v.breakAt+'・線'+(lone?'単独':'つながった')+'・LINE'+r.nLine+'本／ポリライン'+r.nPoly+'個' });
    }
    // --- 範囲を選んで出す（tools/prompts/dxf_crop.md） ---
    const cropCase=async (name, pageOpts, crop, expected, extra)=>{
      const { page } = await makePage(pageOpts);
      const v = await extractVectors(page, 0, Object.assign({}, OPT, {crop}, extra||{}));
      const got=norm(v.segs), exp=norm(expected);
      R.push({ 名前:name, 判定: got===exp ? '✅' : '❌', 期待:exp, 結果:got });
    };
    await cropCase('T34 範囲をまたぐ線は範囲の辺で切り、外の線は出さない',
      {content:'0 100 m 500 100 l S 0 400 m 500 400 l S'}, [100,50,300,150], [[100,100,300,100]]);
    await cropCase('T35 restore の後も範囲は効いたまま',
      {content:'q 0 0 500 500 re W n Q 0 100 m 500 100 l S'}, [100,50,300,150], [[100,100,300,100]]);
    await cropCase('T36 塗りの形も範囲で切ってから重なりを除く',
      {content:'100 100 m 300 100 l S 250 100 100 50 re f'}, [0,0,300,500],
      [[100,100,300,100],[300,150,250,150],[250,150,250,100]], {fill:true});   // 範囲で切っても切り口に辺は生まれない
    {
      // 文字：範囲に掛かるものだけ残す
      const { page } = await makePage({texts:[{s:'IN', x:120, y:100}, {s:'OUT', x:400, y:300}]});
      const v = await extractVectors(page, 0, Object.assign({}, OPT, {text:true, crop:[100,50,300,150]}));
      const got=v.texts.map(t=>t.s).sort().join(',');
      R.push({ 名前:'T37 文字は範囲に掛かるものだけ残す', 判定: (got==='IN' && v.tst.out===1) ? '✅' : '❌', 期待:'IN（除外1）', 結果:got+'（除外'+v.tst.out+'）' });
    }
    {
      // 回転した細長い文字：外接四角形は範囲に掛かるが、文字の四角形そのものは掛からない → 残さない
      const q=[[0,10],[10,0],[11,1],[1,11]];                  // 45°に傾いた細い四角（原点のそばを斜めに通る）
      const out=cvQuadHitsRect(q, [0,0,3,3]);                 // 外接四角形 [0,0,11,11] は範囲 [0,0,3,3] に掛かる
      const inn=cvQuadHitsRect(q, [4,4,8,8]);                 // こちらは文字の四角形に掛かる
      R.push({ 名前:'T38 回転した文字は文字の四角形そのもので範囲と比べる', 判定: (!out && inn) ? '✅' : '❌', 期待:'外れ・掛かる', 結果:(out?'掛かる':'外れ')+'・'+(inn?'掛かる':'外れ') });
    }
    // --- 1文字ずつの文字を、同じ行の文字列にまとめる（tools/prompts/dxf_text_merge.md） ---
    // 文字を1つずつ、ちょうど字送りの位置に置いたPDFを作る（CADから出たPDFと同じ形）
    const charPage=async (runs)=>{
      const doc=await PDFDocument.create(); const page=doc.addPage([500,500]);
      const fonts={H:await doc.embedFont(StandardFonts.Helvetica), T:await doc.embedFont(StandardFonts.TimesRoman)};
      for(const r of runs){ let x=r.x; const f=fonts[r.f||'H'];
        for(const ch of r.s){ page.drawText(ch,{x, y:r.y, size:10, font:f}); x+=f.widthOfTextAtSize(ch,10); } }
      const pdf=await pdfjsLib.getDocument(Object.assign({data:await doc.save()}, PDFJS_OPTS)).promise;
      return pdf.getPage(1);
    };
    const TXT=Object.assign({}, OPT, {text:true, textMerge:true});
    const textCase=async (name, runs, extra, expected, check)=>{
      const page=await charPage(runs);
      const v=await extractVectors(page, 0, Object.assign({}, TXT, extra||{}));
      const got=v.texts.map(t=>t.s).sort().join(' | ');
      const ok = got===expected.slice().sort().join(' | ') && (!check || check(v));
      R.push({ 名前:name, 判定: ok?'✅':'❌', 期待:expected.join(' | '), 結果:got+'（まとめ'+v.tst.merged+'・除外'+v.tst.out+'）' });
    };
    await textCase('T39 1文字ずつ置いた文字は文字列にまとめ、離れた文字は別にする',
      [{s:'ABC', x:100, y:100}, {s:'X', x:200, y:100}], null, ['ABC','X'], v=>v.texts.find(t=>t.s==='ABC').x===100);
    await textCase('T40 範囲の外の文字はつながらない（範囲の中の文字だけでまとめる）',
      [{s:'ABC', x:90, y:100}], {crop:[100,50,300,150]}, ['BC'], v=>v.tst.out===1);
    await textCase('T41 文字の間の空白は残す',
      [{s:'A B', x:100, y:100}], null, ['A B']);
    await textCase('T42 フォントが違う文字はつながない',
      [{s:'A', x:100, y:100, f:'H'}, {s:'B', x:100+6.67, y:100, f:'T'}], null, ['A','B']);
    return R;
  };
})();
