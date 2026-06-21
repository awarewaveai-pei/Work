# rebuild-4cards-v3.ps1 -- corrected boundaries (preamble=0..2301, sections from 2302+)

$srcFile  = "D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\content\ContentStudio.tsx"
$wrapDir  = "D:\Work\scripts\cardwrappers"
$enc      = [System.Text.Encoding]::UTF8

$lines = [System.IO.File]::ReadAllLines($srcFile, $enc)
Write-Host "Source lines: $($lines.Length)"

function RT([string]$name) {
    $path = Join-Path $wrapDir $name
    return [System.IO.File]::ReadAllLines($path, $enc)
}

$cA_open  = RT "card_a_open.txt"
$cB_open  = RT "card_b_open.txt"
$cC_open  = RT "card_c_open.txt"
$cD_open  = RT "card_d_open.txt"
$cC_body  = RT "card_c_content.tsx"

# Pure ASCII card close (12-space content div + 10-space outer div)
$card_close = @('            </div>', '          </div>')

# ----- 0-indexed boundaries (= file_line_number - 1) -------------------------
# Preamble: file lines 1-2302
$PREAMBLE_END = 2301

# Card A sections (all include preceding blank/comment line):
$iStruct   = 2302, 2429  # file 2303-2430  Structure incl comment
$iOutline  = 2430, 2446  # file 2431-2447  大綱 incl blank+comment
$iSeo      = 2679, 2722  # file 2680-2723  SEO/NLP incl blank+comment
$iCatTag   = 2723, 2783  # file 2724-2784  分類/標籤 incl blank (may have comment)
$iIntLink  = 2784, 2795  # file 2785-2796  内部連結 incl blank+comment
$iRefUrl   = 2623, 2634  # file 2624-2635  參考URL incl blank+comment
$iExtLink  = 2668, 2678  # file 2669-2679  外部連結 incl blank+comment
$iMedia    = 2796, 3065  # file 2797-3066  Media Hub incl blank+comment
$iKadence  = 3066, 3152  # file 3067-3153  Kadence incl blank+comment

# Card B sections:
$iBv       = 2541, 2614  # file 2542-2615  品牌聲音 incl blank+comment
$iMarket   = 2635, 2667  # file 2636-2668  競業與痛點 incl blank+comment
$iMkt      = 2447, 2540  # file 2448-2541  品牌語調/精準行銷 incl blank+comment
$iAdv      = 2615, 2622  # file 2616-2623  品牌語調/進階 incl blank+comment

# Card D:
$iPublish  = 3153, 3176  # file 3154-3177  發布設定 incl blank+comment

# Generate button:
$iGenBtn   = 3177, 3191  # file 3178-3192  incl blank+comment

# Output area (social/newsletter STRIPPED):
$iOutputPre = 3193, 3479 # file 3194-3480  up to blank before social comment
$iOutClose  = 3609, 3610 # file 3610-3611  </div> + )} closing output block

# Rest of file (humanize tab etc.):
$REST_START = 3611

# ----- Build result ----------------------------------------------------------
function Sec([int]$s, [int]$e) { return $lines[$s..$e] }

$result = [System.Collections.Generic.List[string]]::new()

# 1. Preamble (unchanged)
$result.AddRange([string[]]$lines[0..$PREAMBLE_END])

# 2. Card A
$result.AddRange([string[]]$cA_open)
$result.AddRange([string[]](Sec @iStruct))
$result.AddRange([string[]](Sec @iOutline))
$result.AddRange([string[]](Sec @iSeo))
$result.AddRange([string[]](Sec @iCatTag))
$result.AddRange([string[]](Sec @iIntLink))
$result.AddRange([string[]](Sec @iRefUrl))
$result.AddRange([string[]](Sec @iExtLink))
$result.AddRange([string[]](Sec @iMedia))
$result.AddRange([string[]](Sec @iKadence))
$result.AddRange([string[]]$card_close)

# 3. Card B
$result.AddRange([string[]]$cB_open)
$result.AddRange([string[]](Sec @iBv))
$result.AddRange([string[]](Sec @iMarket))
$result.AddRange([string[]](Sec @iMkt))
$result.AddRange([string[]](Sec @iAdv))
$result.AddRange([string[]]$card_close)

# 4. Card C
$result.AddRange([string[]]$cC_open)
$result.AddRange([string[]]$cC_body)
$result.AddRange([string[]]$card_close)

# 5. Card D
$result.AddRange([string[]]$cD_open)
$result.AddRange([string[]](Sec @iPublish))
$result.AddRange([string[]]$card_close)

# 6. Generate button
$result.AddRange([string[]](Sec @iGenBtn))

# 7. Output area (social/newsletter removed)
$result.AddRange([string[]]$lines[$iOutputPre[0]..$iOutputPre[1]])
$result.AddRange([string[]]$lines[$iOutClose[0]..$iOutClose[1]])

# 8. Rest of file
$result.AddRange([string[]]$lines[$REST_START..($lines.Length - 1)])

# ----- Write back (UTF-8 no BOM) --------------------------------------------
$outEnc = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllLines($srcFile, $result.ToArray(), $outEnc)
Write-Host "Done: $($result.Count) lines written."
