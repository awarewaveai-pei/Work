# rebuild-4cards-v2.ps1 -- all CJK/JSX content read from UTF-8 txt files, no PS string literal issues

$srcFile  = "D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\content\ContentStudio.tsx"
$wrapDir  = "D:\Work\scripts\cardwrappers"
$enc      = [System.Text.Encoding]::UTF8

$lines = [System.IO.File]::ReadAllLines($srcFile, $enc)
Write-Host "Source lines: $($lines.Length)"

# -- Read wrapper files (UTF-8) -----------------------------------------------
function RT([string]$name) {
    $path = Join-Path $wrapDir $name
    return [System.IO.File]::ReadAllLines($path, $enc)
}

$cA_open  = RT "card_a_open.txt"
$cB_open  = RT "card_b_open.txt"
$cC_open  = RT "card_c_open.txt"
$cD_open  = RT "card_d_open.txt"
$cC_body  = RT "card_c_content.tsx"

# Card close is pure ASCII - safe in PS
$card_close = @('            </div>', '          </div>')

# -- Section index map (0-indexed = file_line - 1) ----------------------------
# Format: [start, end] inclusive
$iStruct   = 2229, 2356   # Structure
$iOutline  = 2358, 2373   # outline editor
$iMkt      = 2375, 2467   # brand voice / precise marketing form
$iBv       = 2469, 2541   # brand voice analysis
$iAdv      = 2543, 2549   # brand advanced raw
$iRefUrl   = 2551, 2561   # reference URLs
$iMarket   = 2563, 2594   # competitive analysis
$iExtLink  = 2596, 2605   # external links
$iSeo      = 2607, 2651   # SEO / NLP keywords
$iCatTag   = 2653, 2712   # categories / tags
$iIntLink  = 2714, 2724   # internal links
$iMedia    = 2726, 3061   # media hub
$iKadence  = 3063, 3148   # Kadence funnel patterns
$iPublish  = 3150, 3172   # publish settings
$iGenBtn   = 3174, 3187   # generate button

# Output area (without social/newsletter, which move to Card C)
$iOutput   = 3189, 3479   # output area pre-social
$iOutClose = 3609, 3610   # </div> + )} closing tags
$iRest     = 3611          # rest of file

# -- Helper: extract section --------------------------------------------------
function Sec([int]$s, [int]$e) { return $lines[$s..$e] }

# -- Build result -------------------------------------------------------------
$result = [System.Collections.Generic.List[string]]::new()

# 1. Everything before form sections (unchanged)
$result.AddRange([string[]]$lines[0..2228])

# 2. Card A -- article / content settings
$result.AddRange([string[]]$cA_open)
$result.AddRange([string[]](Sec @iStruct))
$result.Add('')
$result.AddRange([string[]](Sec @iOutline))
$result.Add('')
$result.AddRange([string[]](Sec @iSeo))
$result.Add('')
$result.AddRange([string[]](Sec @iCatTag))
$result.Add('')
$result.AddRange([string[]](Sec @iIntLink))
$result.Add('')
$result.AddRange([string[]](Sec @iRefUrl))
$result.Add('')
$result.AddRange([string[]](Sec @iExtLink))
$result.Add('')
$result.AddRange([string[]](Sec @iMedia))
$result.Add('')
$result.AddRange([string[]](Sec @iKadence))
$result.AddRange([string[]]$card_close)

# 3. Card B -- brand data
$result.AddRange([string[]]$cB_open)
$result.AddRange([string[]](Sec @iBv))
$result.Add('')
$result.AddRange([string[]](Sec @iMarket))
$result.Add('')
$result.AddRange([string[]](Sec @iMkt))
$result.Add('')
$result.AddRange([string[]](Sec @iAdv))
$result.AddRange([string[]]$card_close)

# 4. Card C -- distribution (social + newsletter, moved from output area)
$result.AddRange([string[]]$cC_open)
$result.AddRange([string[]]$cC_body)
$result.AddRange([string[]]$card_close)

# 5. Card D -- publish settings
$result.AddRange([string[]]$cD_open)
$result.Add('')
$result.AddRange([string[]](Sec @iPublish))
$result.AddRange([string[]]$card_close)

# 6. Generate button (unchanged)
$result.Add('')
$result.AddRange([string[]](Sec @iGenBtn))

# 7. Output area (social/newsletter REMOVED from here - now in Card C)
$result.Add('')
$result.AddRange([string[]]$lines[$iOutput[0]..$iOutput[1]])
# Output block closing tags
$result.AddRange([string[]]$lines[$iOutClose[0]..$iOutClose[1]])

# 8. Rest of file (humanize tab, video tab, etc.)
$result.AddRange([string[]]$lines[$iRest..($lines.Length - 1)])

# -- Write back ---------------------------------------------------------------
$outEnc = [System.Text.UTF8Encoding]::new($false)  # no BOM
[System.IO.File]::WriteAllLines($srcFile, $result.ToArray(), $outEnc)
Write-Host "Done: $($result.Count) lines written to $srcFile"
