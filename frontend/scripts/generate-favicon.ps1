# Regenerate raster favicon fallbacks from the existing Lucide piggy-bank SVG.
# Run on Windows with: pwsh -NoProfile -STA -File scripts/generate-favicon.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore, WindowsBase
$assetDirectory = Join-Path $PSScriptRoot '../public'
[xml]$svg = [IO.File]::ReadAllText((Join-Path $assetDirectory 'favicon.svg'))
$background = [Windows.Media.BrushConverter]::new().ConvertFromString('#17452f')
$foreground = [Windows.Media.BrushConverter]::new().ConvertFromString('#eaf7f0')

foreach ($size in @(32, 180)) {
    $visual = [Windows.Media.DrawingVisual]::new()
    $drawing = $visual.RenderOpen()
    $drawing.PushTransform([Windows.Media.ScaleTransform]::new($size / 64.0, $size / 64.0))
    $drawing.DrawRoundedRectangle($background, $null, [Windows.Rect]::new(0, 0, 64, 64), 14, 14)
    $drawing.PushTransform([Windows.Media.MatrixTransform]::new(2, 0, 0, 2, 8, 8))
    $pen = [Windows.Media.Pen]::new($foreground, 1.8)
    $pen.StartLineCap = $pen.EndLineCap = [Windows.Media.PenLineCap]::Round
    $pen.LineJoin = [Windows.Media.PenLineJoin]::Round
    foreach ($path in $svg.svg.g.path) {
        $drawing.DrawGeometry($null, $pen, [Windows.Media.Geometry]::Parse($path.d))
    }
    $drawing.Pop()
    $drawing.Pop()
    $drawing.Close()
    $bitmap = [Windows.Media.Imaging.RenderTargetBitmap]::new($size, $size, 96, 96, [Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($visual)
    $encoder = [Windows.Media.Imaging.PngBitmapEncoder]::new()
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $filename = if ($size -eq 180) { 'apple-touch-icon.png' } else { 'favicon-32x32.png' }
    $stream = [IO.File]::Create((Join-Path $assetDirectory $filename))
    try { $encoder.Save($stream) } finally { $stream.Dispose() }
}

$png = [IO.File]::ReadAllBytes((Join-Path $assetDirectory 'favicon-32x32.png'))
$ico = [IO.BinaryWriter]::new([IO.File]::Create((Join-Path $assetDirectory 'favicon.ico')))
try {
    $ico.Write([uint16]0); $ico.Write([uint16]1); $ico.Write([uint16]1)
    $ico.Write([byte]32); $ico.Write([byte]32); $ico.Write([byte]0); $ico.Write([byte]0)
    $ico.Write([uint16]1); $ico.Write([uint16]32)
    $ico.Write([uint32]$png.Length); $ico.Write([uint32]22); $ico.Write($png)
} finally { $ico.Dispose() }
Write-Output 'Generated SVG-matching PNG, ICO, and Apple touch icons.'
