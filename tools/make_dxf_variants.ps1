[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# DXFの容量を減らす案のうち、CADで開けるか確かめが必要なものの見本を作る。
# 4つとも「まったく同じ図形（四角形＋ジグザグ20本＋文字）」で、書き方だけが違う。
# Jw_cad と NETEAGLE で開いて、図形が同じに見えるか・開けるかを確かめる。

$outDir = Join-Path $PSScriptRoot 'dxf_variants'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# --- 図形（すべての見本で共通） -------------------------------------------
# 1本の折れ線としてつながった点の列。四角形（閉じる）とジグザグ（開いたまま）。
$rect = @(@(20,20), @(180,20), @(180,80), @(20,80))          # 閉じた輪郭
$zig  = @()
for ($k = 0; $k -le 20; $k++) { $zig += ,@((20 + ($k * 8)), (100 + (($k % 2) * 30))) }   # 開いた折れ線（20区間）
$texts = @(@{ x = 20; y = 150; s = '通り芯 １階' })

function Fmt([double]$v) { $t = $v.ToString('0.###'); if ($t -notlike '*.*') { $t += '.0' }; return $t }

function Write-Dxf {
  param([string]$Name, [scriptblock]$Entities)

  $L = New-Object System.Collections.Generic.List[string]
  $g = { param($c, $v) $L.Add(("{0,3}" -f $c)); $L.Add([string]$v) }

  & $g 0 'SECTION'; & $g 2 'HEADER'
  & $g 9 '$INSUNITS'; & $g 70 '     4'
  & $g 9 '$EXTMIN'; & $g 10 '0.0'; & $g 20 '0.0'; & $g 30 '0.0'
  & $g 9 '$EXTMAX'; & $g 10 '200.0'; & $g 20 '200.0'; & $g 30 '0.0'
  & $g 0 'ENDSEC'
  & $g 0 'SECTION'; & $g 2 'TABLES'
  & $g 0 'TABLE'; & $g 2 'LTYPE'; & $g 70 '     1'
  & $g 0 'LTYPE'; & $g 2 'CONTINUOUS'; & $g 70 '     0'; & $g 3 'Solid line'; & $g 72 '    65'; & $g 73 '     0'; & $g 40 '0.0'
  & $g 0 'ENDTAB'
  & $g 0 'TABLE'; & $g 2 'LAYER'; & $g 70 '     2'
  & $g 0 'LAYER'; & $g 2 '0';    & $g 70 '     0'; & $g 62 '     7'; & $g 6 'CONTINUOUS'
  & $g 0 'LAYER'; & $g 2 'TEXT'; & $g 70 '     0'; & $g 62 '     3'; & $g 6 'CONTINUOUS'
  & $g 0 'ENDTAB'
  & $g 0 'TABLE'; & $g 2 'STYLE'; & $g 70 '     1'
  & $g 0 'STYLE'; & $g 2 'STANDARD'; & $g 70 '     0'; & $g 40 '0.0'; & $g 41 '1.0'; & $g 50 '0.0'; & $g 71 '     0'; & $g 42 '2.5'; & $g 3 'txt'; & $g 4 ''
  & $g 0 'ENDTAB'
  & $g 0 'ENDSEC'
  & $g 0 'SECTION'; & $g 2 'ENTITIES'
  & $Entities $g
  foreach ($t in $texts) {
    & $g 0 'TEXT'; & $g 8 'TEXT'; & $g 7 'STANDARD'
    & $g 10 (Fmt $t.x); & $g 20 (Fmt $t.y); & $g 30 '0.0'; & $g 40 '8.0'; & $g 1 $t.s
  }
  & $g 0 'ENDSEC'; & $g 0 'EOF'

  $bytes = [Text.Encoding]::GetEncoding(932).GetBytes(($L -join "`r`n") + "`r`n")
  $path = Join-Path $outDir ("variant_" + $Name + ".dxf")
  [IO.File]::WriteAllBytes($path, $bytes)
  Write-Output ("{0,-10} {1,7} bytes  {2}" -f $Name, $bytes.Length, (Split-Path $path -Leaf))
}

# 点の列を「線分の並び」に変える
function Segs([object[]]$pts, [bool]$close) {
  $o = @()
  for ($i = 0; $i -lt $pts.Count - 1; $i++) { $o += ,@($pts[$i], $pts[$i+1]) }
  if ($close) { $o += ,@($pts[$pts.Count-1], $pts[0]) }
  return $o
}

# ① いまのDWP（線種は省略済み・Z座標あり）＝比較のもと
Write-Dxf -Name 'line' -Entities {
  param($g)
  foreach ($set in @((Segs $rect $true), (Segs $zig $false))) {
    foreach ($s in $set) {
      & $g 0 'LINE'; & $g 8 '0'
      & $g 10 (Fmt $s[0][0]); & $g 20 (Fmt $s[0][1]); & $g 30 '0.0'
      & $g 11 (Fmt $s[1][0]); & $g 21 (Fmt $s[1][1]); & $g 31 '0.0'
    }
  }
}

# ② Z座標を書かない（−22バイト/線）
Write-Dxf -Name 'noz' -Entities {
  param($g)
  foreach ($set in @((Segs $rect $true), (Segs $zig $false))) {
    foreach ($s in $set) {
      & $g 0 'LINE'; & $g 8 '0'
      & $g 10 (Fmt $s[0][0]); & $g 20 (Fmt $s[0][1])
      & $g 11 (Fmt $s[1][0]); & $g 21 (Fmt $s[1][1])
    }
  }
}

# ③ 軽いポリライン（LWPOLYLINE）＝いちばん小さい。R14以降の形式
Write-Dxf -Name 'lwpolyline' -Entities {
  param($g)
  foreach ($p in @(@{ pts = $rect; closed = 1 }, @{ pts = $zig; closed = 0 })) {
    & $g 0 'LWPOLYLINE'; & $g 8 '0'; & $g 100 'AcDbPolyline'
    & $g 90 $p.pts.Count; & $g 70 $p.closed
    foreach ($q in $p.pts) { & $g 10 (Fmt $q[0]); & $g 20 (Fmt $q[1]) }
  }
}

# ④ 古いポリライン（POLYLINE＋VERTEX＋SEQEND）＝R12から使える形式
Write-Dxf -Name 'polyline' -Entities {
  param($g)
  foreach ($p in @(@{ pts = $rect; closed = 1 }, @{ pts = $zig; closed = 0 })) {
    & $g 0 'POLYLINE'; & $g 8 '0'; & $g 66 '     1'
    & $g 10 '0.0'; & $g 20 '0.0'; & $g 30 '0.0'; & $g 70 ("{0,6}" -f $p.closed)
    foreach ($q in $p.pts) {
      & $g 0 'VERTEX'; & $g 8 '0'
      & $g 10 (Fmt $q[0]); & $g 20 (Fmt $q[1]); & $g 30 '0.0'
    }
    & $g 0 'SEQEND'; & $g 8 '0'
  }
}

Write-Output ''
Write-Output '4つとも Jw_cad と NETEAGLE で開いて、次を教えてください。'
Write-Output '  ・開けるか（エラーにならないか）'
Write-Output '  ・四角形とジグザグが同じ形で出るか、文字が読めるか'

