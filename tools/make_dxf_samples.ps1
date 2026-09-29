[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# DWP の PDF→DXF が書き出すのと同じ書式で、文字コードだけ変えた見本を3つ作る。
# Jw_cad / NETEAGLE で開き、どれが正しく表示されるかを確かめるためのもの。
# DWP 側のバイト列が Windows の CP932 と一致することは、tools/dxf_selftest.js の T22 で確認済み。

$outDir = Join-Path $PSScriptRoot 'dxf_samples'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# 図面に出す文字（化けやすいものを集めた）
$texts = @(
  @{ y = 90; s = '通り芯 １階' },
  @{ y = 75; s = '柱 120角' },
  @{ y = 60; s = '表 記 ㈱ 髙' },
  @{ y = 45; s = '910 ～ 1820' },
  @{ y = 30; s = 'ABC 123 (mm)' }
)

function New-Dxf {
  param([string]$Mode)   # sjis / utf8 / esc

  $L = New-Object System.Collections.Generic.List[string]
  $g = { param($code, $val) $L.Add(("{0,3}" -f $code)); $L.Add([string]$val) }

  & $g 0 'SECTION'; & $g 2 'HEADER'
  if ($Mode -eq 'utf8') { & $g 9 '$ACADVER'; & $g 1 'AC1021' }
  & $g 9 '$INSUNITS'; & $g 70 '     4'
  & $g 9 '$EXTMIN'; & $g 10 '0.000'; & $g 20 '0.000'; & $g 30 '0.0'
  & $g 9 '$EXTMAX'; & $g 10 '200.000'; & $g 20 '100.000'; & $g 30 '0.0'
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
  # 枠線（表示位置の目安）
  & $g 0 'LINE'; & $g 8 '0'; & $g 6 'CONTINUOUS'; & $g 10 '0.000'; & $g 20 '0.000'; & $g 30 '0.0'; & $g 11 '200.000'; & $g 21 '0.000'; & $g 31 '0.0'
  foreach ($t in $texts) {
    $s = $t.s
    if ($Mode -eq 'esc') {
      $sb = New-Object System.Text.StringBuilder
      foreach ($ch in $s.ToCharArray()) {
        $cp = [int][char]$ch
        if ($cp -ge 0x20 -and $cp -le 0x7E) { [void]$sb.Append($ch) }
        else { [void]$sb.Append(('\U+{0:X4}' -f $cp)) }
      }
      $s = $sb.ToString()
    }
    & $g 0 'TEXT'; & $g 8 'TEXT'; & $g 7 'STANDARD'
    & $g 10 '10.000'; & $g 20 ("{0:F3}" -f $t.y); & $g 30 '0.0'
    & $g 40 '5.000'; & $g 1 $s
  }
  & $g 0 'ENDSEC'; & $g 0 'EOF'

  $text = ($L -join "`r`n") + "`r`n"
  $enc = if ($Mode -eq 'sjis') { [Text.Encoding]::GetEncoding(932) } else { New-Object Text.UTF8Encoding($false) }
  $path = Join-Path $outDir ("sample_" + $Mode + ".dxf")
  [IO.File]::WriteAllBytes($path, $enc.GetBytes($text))
  $info = Get-Item $path
  Write-Output ("{0,-10} {1,7} bytes  {2}" -f $Mode, $info.Length, $path)
}

foreach ($m in @('sjis', 'utf8', 'esc')) { New-Dxf -Mode $m }

Write-Output ''
Write-Output '3つとも Jw_cad / NETEAGLE で開いて、文字が正しく出るものを教えてください。'
Write-Output '（sjis が正しければ、DWP の既定の設定で直っています）'

