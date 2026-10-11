param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
$project = 'ticketrush-week6-check-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$compose = @('compose', '-p', $project, '-f', 'docker-compose.yml', '-f', 'infrastructure/compose.week6-check.yml')
function New-Secret { return [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)) }
$env:POSTGRES_PASSWORD = New-Secret
$env:POSTGRES_USER = 'ticketrush'
$env:POSTGRES_DB = 'ticketrush'
$env:REDIS_PASSWORD = New-Secret
$env:RABBITMQ_PASSWORD = New-Secret
$env:JWT_SECRET = New-Secret
$env:PAYMENT_WEBHOOK_SECRET = New-Secret
$base = 'http://127.0.0.1:28086/api/v1'
function Api($method, $path, $body = $null, $token = $null, $extra = @{}) {
    $headers = @{} + $extra
    if ($token) { $headers.Authorization = "Bearer $token" }
    $args = @{ Method = $method; Uri = "$base$path"; Headers = $headers; SkipHttpErrorCheck = $true; TimeoutSec = 15 }
    if ($null -ne $body) { $args.ContentType = 'application/json'; $args.Body = ConvertTo-Json $body -Depth 8 -Compress }
    return Invoke-WebRequest @args
}
function Expect($response, $code) {
    if ([int]$response.StatusCode -ne $code) { throw "Expected $code, got $($response.StatusCode): $($response.Content)" }
}
try {
    $up = @('up', '-d', '--wait', '--wait-timeout', '180')
    if (!$SkipBuild) { $up += '--build' }
    & docker @compose @up
    if ($LASTEXITCODE -ne 0) { throw 'Compose startup failed' }
    $password = New-Secret
    $users = @()
    foreach ($name in @('admin','buyer1','buyer2')) {
        $email = "$name-$([guid]::NewGuid())@example.com"
        $registered = Api POST '/auth/register' @{ email=$email; password=$password }
        Expect $registered 201
        $users += @{ id=($registered.Content | ConvertFrom-Json).id; email=$email }
    }
    $adminId = $users[0].id
    "INSERT INTO user_roles(user_id,role_id) VALUES (:'admin_id'::uuid,2) ON CONFLICT DO NOTHING;" |
        & docker @compose exec -T postgres psql -U ticketrush -d ticketrush -v "admin_id=$adminId" | Out-Null
    foreach ($user in $users) {
        $login = Api POST '/auth/login' @{ email=$user.email; password=$password }
        Expect $login 200
        $user.token = ($login.Content | ConvertFrom-Json).accessToken
    }
    $admin = $users[0].token
    $now = [DateTimeOffset]::UtcNow
    $created = Api POST '/admin/events' @{ title='Week 6 smoke'; venueName='Local'; venueAddress='Test';
        startTime=$now.AddHours(2).ToString('o'); endTime=$now.AddHours(3).ToString('o');
        saleStartTime=$now.AddMinutes(-1).ToString('o'); saleEndTime=$now.AddHours(1).ToString('o') } $admin
    Expect $created 201
    $event = ($created.Content | ConvertFrom-Json).id
    $tierResponse = Api POST "/admin/events/$event/tiers" @{ name='VIP'; price=100; currency='USD'; totalQuantity=10; maxPerOrder=4 } $admin
    Expect $tierResponse 201
    $tier = ($tierResponse.Content | ConvertFrom-Json).id
    Expect (Api POST "/admin/events/$event/publish" $null $admin) 200
    $reservation = Api POST '/reservations' @{ tierId=$tier; quantity=1 } $users[1].token
    Expect $reservation 201
    $hold = ($reservation.Content | ConvertFrom-Json).id
    Expect (Api DELETE "/reservations/$hold" $null $users[1].token) 204
    Write-Output 'SMOKE gate create/cancel: PASS'
    Expect (Api PUT "/admin/events/$event/waiting-room" @{ enabled=$true; rate=1; mode='fifo' } $admin) 200
    Expect (Api POST '/reservations' @{ tierId=$tier; quantity=1 } $users[1].token) 403
    foreach ($user in $users[1..2]) { Expect (Api POST "/events/$event/waiting-room/join" $null $user.token) 200 }
    $admission = $null
    for ($i=0; $i -lt 20; $i++) {
        $poll = Api GET "/events/$event/waiting-room/status" $null $users[1].token
        Expect $poll 200
        $status = $poll.Content | ConvertFrom-Json
        if ($status.state -eq 'ADMITTED') { $admission=$status.token; break }
        Start-Sleep -Milliseconds 250
    }
    if (!$admission) { throw 'Admitter did not issue a token' }
    Expect (Api POST '/reservations' @{ tierId=$tier; quantity=1 } $users[2].token @{ 'X-Admission-Token'=$admission }) 403
    Expect (Api POST '/reservations' @{ tierId=$tier; quantity=1 } $users[1].token @{ 'X-Admission-Token'=$admission }) 201
    Write-Output 'SMOKE waiting room / user binding: PASS'
    Expect (Api PUT "/admin/events/$event/waiting-room" @{ enabled=$false; rate=1; mode='fifo' } $admin) 200
    & docker @compose stop redis | Out-Null
    Expect (Api POST '/reservations' @{ tierId=$tier; quantity=1 } $users[2].token) 201
    Write-Output 'SMOKE Redis stopped / SQL fallback sale: PASS'
    & docker @compose start redis | Out-Null
    $healed = $false
    for ($i=0; $i -lt 30; $i++) {
        $response = Api POST "/admin/events/$event/inventory/redis-reconcile" $null $admin
        if ([int]$response.StatusCode -eq 200) { $healed=$true; break }
        Start-Sleep -Milliseconds 250
    }
    if (!$healed) { throw 'Redis recovery failed' }
    $limited=0
    for ($i=0; $i -lt 20; $i++) {
        $response=Api POST '/auth/login' @{ email='missing@example.com'; password=$password }
        if ([int]$response.StatusCode -eq 429) { $limited++ }
    }
    if ($limited -lt 1) { throw 'Login was not throttled' }
    Write-Output "SMOKE recovery / login 429: PASS ($limited throttled)"
} finally {
    # This exact isolated project is the only cleanup target; no development volumes are touched.
    & docker @compose down -v | Out-Null
}
