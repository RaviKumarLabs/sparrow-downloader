<#
.SYNOPSIS
    Generates all required icon files for Sparrow Downloader from icon.svg.

.DESCRIPTION
    Creates the following files in src-tauri/icons/:
      32x32.png        — used by Linux AppImage / taskbar
      128x128.png      — used by Linux packages
      128x128@2x.png   — 256px, used by macOS Retina / Linux HiDPI
      icon.icns        — macOS app bundle icon (macOS only)
      icon.ico         — Windows installer and taskbar icon

    Requires ONE of the following to be installed:
      • ImageMagick (recommended for Windows)  https://imagemagick.org
      • Inkscape                                https://inkscape.org

    After running this script, update tauri.conf.json bundle.icon to include
    the full set:
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"

.EXAMPLE
    .\scripts\generate-icons.ps1
    .\scripts\generate-icons.ps1 -Source .\src-tauri\icons\icon.svg
#>

param(
    [string]$Source = "$PSScriptRoot\..\src-tauri\icons\icon.svg",
    [string]$OutputDir = "$PSScriptRoot\..\src-tauri\icons"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Resolve paths ────────────────────────────────────────────────────────────
$Source     = Resolve-Path $Source
$OutputDir  = Resolve-Path $OutputDir

Write-Host ""
Write-Host "  Sparrow Downloader — Icon Generator" -ForegroundColor Cyan
Write-Host "  Source : $Source"
Write-Host "  Output : $OutputDir"
Write-Host ""

# ── Detect tool ─────────────────────────────────────────────────────────────
$magick    = Get-Command magick    -ErrorAction SilentlyContinue
$inkscape  = Get-Command inkscape  -ErrorAction SilentlyContinue

if (-not $magick -and -not $inkscape) {
    Write-Error @"
Neither ImageMagick nor Inkscape was found in PATH.

Install ImageMagick (recommended):
  winget install ImageMagick.ImageMagick
  -- or --
  https://imagemagick.org/script/download.php#windows

Install Inkscape:
  winget install Inkscape.Inkscape
  -- or --
  https://inkscape.org/release/
"@
    exit 1
}

$tool = if ($magick) { "ImageMagick" } else { "Inkscape" }
Write-Host "  Using  : $tool" -ForegroundColor Green
Write-Host ""

# ── Helper: export PNG via ImageMagick ───────────────────────────────────────
function Export-PngMagick {
    param([string]$Out, [int]$W, [int]$H)
    & magick -background none -density 300 $Source -resize "${W}x${H}" $Out
    if ($LASTEXITCODE -ne 0) { throw "magick failed for $Out" }
}

# ── Helper: export PNG via Inkscape ──────────────────────────────────────────
function Export-PngInkscape {
    param([string]$Out, [int]$W, [int]$H)
    & inkscape --export-filename="$Out" --export-width=$W --export-height=$H "$Source"
    if ($LASTEXITCODE -ne 0) { throw "inkscape failed for $Out" }
}

function Export-Png {
    param([string]$Name, [int]$W, [int]$H)
    $out = Join-Path $OutputDir $Name
    Write-Host "  Generating $Name ($W × $H)…" -NoNewline
    if ($magick) { Export-PngMagick  $out $W $H }
    else         { Export-PngInkscape $out $W $H }
    Write-Host " done" -ForegroundColor Green
}

# ── Generate PNGs ────────────────────────────────────────────────────────────
Export-Png "32x32.png"       32  32
Export-Png "128x128.png"    128 128
Export-Png "128x128@2x.png" 256 256    # @2x = double the logical pixel density

# ── Generate ICO (Windows) — multi-size embedded ─────────────────────────────
$icoPath = Join-Path $OutputDir "icon.ico"
Write-Host "  Generating icon.ico (multi-size: 16,24,32,48,64,128,256)…" -NoNewline

if ($magick) {
    & magick -background none -density 300 $Source `
        -define icon:auto-resize="256,128,64,48,32,24,16" `
        $icoPath
    if ($LASTEXITCODE -ne 0) { throw "magick failed for icon.ico" }
} else {
    # Inkscape cannot write ICO; generate 256px PNG then convert via .NET
    $tmp256 = Join-Path $env:TEMP "sparrow-tmp-256.png"
    Export-PngInkscape $tmp256 256 256

    # Use .NET System.Drawing to build a minimal ICO from the 256px PNG
    # (single-size ICO — run ImageMagick for proper multi-size output)
    Add-Type -AssemblyName System.Drawing
    $bmp256 = [System.Drawing.Bitmap]::new($tmp256)

    $ms = New-Object System.IO.MemoryStream

    # ICO header
    $writer = New-Object System.IO.BinaryWriter($ms)
    $writer.Write([uint16]0)   # reserved
    $writer.Write([uint16]1)   # type: ICO
    $writer.Write([uint16]1)   # image count

    # Image directory entry (256×256 PNG embedded — size 0 = 256)
    $pngMs = New-Object System.IO.MemoryStream
    $bmp256.Save($pngMs, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $pngMs.ToArray()

    $writer.Write([byte]0)           # width  (0 = 256)
    $writer.Write([byte]0)           # height (0 = 256)
    $writer.Write([byte]0)           # color count
    $writer.Write([byte]0)           # reserved
    $writer.Write([uint16]1)         # planes
    $writer.Write([uint16]32)        # bit count
    $writer.Write([uint32]$pngBytes.Length)
    $writer.Write([uint32]22)        # offset = header(6) + dir-entry(16)

    $writer.Write($pngBytes)
    $writer.Flush()

    [System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
    $bmp256.Dispose(); $pngMs.Dispose(); $ms.Dispose(); $writer.Dispose()
    Remove-Item $tmp256 -ErrorAction SilentlyContinue
}

Write-Host " done" -ForegroundColor Green

# ── Generate ICNS (macOS) — only if on macOS or iconutil is present ───────────
$icnsPath = Join-Path $OutputDir "icon.icns"
$iconutil  = Get-Command iconutil -ErrorAction SilentlyContinue

if ($iconutil) {
    Write-Host "  Generating icon.icns (macOS)…" -NoNewline
    $iconsetDir = Join-Path $env:TEMP "sparrow.iconset"
    New-Item -ItemType Directory -Force -Path $iconsetDir | Out-Null

    @(
        @{Name="icon_16x16.png";      W=16;  H=16  },
        @{Name="icon_16x16@2x.png";   W=32;  H=32  },
        @{Name="icon_32x32.png";      W=32;  H=32  },
        @{Name="icon_32x32@2x.png";   W=64;  H=64  },
        @{Name="icon_128x128.png";    W=128; H=128 },
        @{Name="icon_128x128@2x.png"; W=256; H=256 },
        @{Name="icon_256x256.png";    W=256; H=256 },
        @{Name="icon_256x256@2x.png"; W=512; H=512 },
        @{Name="icon_512x512.png";    W=512; H=512 }
    ) | ForEach-Object {
        $p = Join-Path $iconsetDir $_.Name
        if ($magick) { Export-PngMagick  $p $_.W $_.H }
        else         { Export-PngInkscape $p $_.W $_.H }
    }

    & iconutil -c icns -o $icnsPath $iconsetDir
    Remove-Item $iconsetDir -Recurse -Force
    Write-Host " done" -ForegroundColor Green
} else {
    Write-Host "  Skipping icon.icns (iconutil not found — run on macOS to generate)" -ForegroundColor DarkYellow
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ✓ Icon generation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Next step: if ALL files were generated, update bundle.icon in" -ForegroundColor DarkCyan
Write-Host "  src-tauri/tauri.conf.json to the full set:" -ForegroundColor DarkCyan
Write-Host @'
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
'@ -ForegroundColor DarkGray
Write-Host ""
