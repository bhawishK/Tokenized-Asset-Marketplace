param(
    [Parameter(Mandatory=$true)][string]$Package,
    [Parameter(Mandatory=$true)][string]$Marketplace,
    [Parameter(Mandatory=$true)][string]$IssuerCap,
    [Parameter(Mandatory=$true)][string]$Buyer
)
$ErrorActionPreference = 'Stop'
foreach ($id in @($Package, $Marketplace, $IssuerCap, $Buyer)) {
    if ($id -notmatch '^0x[0-9a-fA-F]{64}$' -or $id -match '^0x0+$') { throw 'Use full nonzero Testnet IDs and addresses.' }
}
$network = (& sui client active-env | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $network -ne 'testnet') { throw 'Switch the Sui CLI to testnet before seeding.' }
$issuer = (& sui client active-address | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot determine issuer address.' }
if ($issuer -eq $Buyer) { throw 'Use a separate demo buyer account.' }
& sui client call --package $Package --module marketplace --function mint_inventory --args $IssuerCap $Marketplace 100000000 --gas-budget 100000000
if ($LASTEXITCODE -ne 0) { throw 'Inventory mint failed; buyer was not funded.' }
& sui client call --package $Package --module marketplace --function fund_buyer --args $IssuerCap 250000000 $Buyer --gas-budget 100000000
if ($LASTEXITCODE -ne 0) { throw 'Buyer funding failed; inventory mint already succeeded. Retry only fund_buyer.' }
Write-Output 'Seeded 100 DemoGold inventory and 250 MockUSD for the buyer. These are simulated assets.'
