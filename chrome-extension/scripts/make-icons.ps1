Add-Type -AssemblyName System.Drawing

$src = Join-Path $PSScriptRoot "..\..\assets\icon128.png"
if (-not (Test-Path $src)) {
  $src = "C:\Users\rento\.cursor\projects\e-Documents-soundcloud-for-dj\assets\icon128.png"
}

$destDir = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

$img = [System.Drawing.Image]::FromFile($src)
foreach ($size in @(16, 32, 48, 128)) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $size, $size)
  $g.Dispose()
  $out = Join-Path $destDir ("icon{0}.png" -f $size)
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
$img.Dispose()

Get-ChildItem $destDir
