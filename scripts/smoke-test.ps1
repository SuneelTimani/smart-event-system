param(
  [string]$BaseUrl = "http://localhost:5000",
  [string]$AdminEmail = "",
  [string]$AdminPassword = ""
)

$ErrorActionPreference = "Stop"

function Step([string]$name, [scriptblock]$action) {
  try {
    & $action
    Write-Host "[PASS] $name" -ForegroundColor Green
  } catch {
    $msg = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $msg = $_.ErrorDetails.Message }
    Write-Host "[FAIL] $name -> $msg" -ForegroundColor Red
  }
}

function JsonPost($url, $body, $headers = @{}) {
  Invoke-RestMethod -Uri $url -Method Post -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10)
}

function JsonPut($url, $body, $headers = @{}) {
  Invoke-RestMethod -Uri $url -Method Put -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10)
}

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$script:userEmail = "smoke_$ts@example.com"
$script:userPassword = "Test1234!"
$script:userToken = ""
$script:adminToken = ""
$script:createdEventId = ""

Write-Host "Running Smart Event smoke test against: $BaseUrl" -ForegroundColor Cyan
Write-Host "User test email: $script:userEmail" -ForegroundColor DarkCyan

Step "Register user" {
  $r = JsonPost "$BaseUrl/api/auth/register" @{ name="Smoke User"; email=$script:userEmail; password=$script:userPassword }
  if (-not $r.id) { throw "No user id returned" }
}

Step "Login user" {
  $l = JsonPost "$BaseUrl/api/auth/login" @{ email=$script:userEmail; password=$script:userPassword }
  if (-not $l.token) { throw "No token returned" }
  $script:userToken = $l.token
}

Step "Get profile (/me)" {
  $me = Invoke-RestMethod -Uri "$BaseUrl/api/auth/me" -Headers @{ Authorization = $script:userToken }
  if ($me.email -ne $script:userEmail) { throw "Email mismatch in /me" }
}

Step "Update profile name" {
  $u = JsonPut "$BaseUrl/api/auth/me" @{ name = "Smoke User Updated" } @{ Authorization = $script:userToken }
  if ($u.name -ne "Smoke User Updated") { throw "Name not updated" }
}

Step "List events" {
  $events = Invoke-RestMethod -Uri "$BaseUrl/api/events" -Method Get
  if ($null -eq $events) { throw "No events response" }
}

Step "User blocked from create event (403 expected)" {
  try {
    JsonPost "$BaseUrl/api/events/create" @{
      title="Blocked Event"
      description="Should fail for user"
      date=(Get-Date).ToString("o")
      location="Test"
      organizer="User"
    } @{ Authorization = $script:userToken } | Out-Null
    throw "User unexpectedly created event"
  } catch {
    $status = $_.Exception.Response.StatusCode.Value__
    if ($status -ne 403) { throw "Expected 403, got $status" }
  }
}

if ($AdminEmail -and $AdminPassword) {
  Step "Login admin" {
    $a = JsonPost "$BaseUrl/api/auth/login" @{ email=$AdminEmail; password=$AdminPassword }
    if (-not $a.token) { throw "No admin token" }
    $script:adminToken = $a.token
  }

  Step "Admin create event" {
    $ev = JsonPost "$BaseUrl/api/events/create" @{
      title="Smoke Admin Event $ts"
      description="Created by smoke test"
      date=(Get-Date).AddDays(5).ToString("o")
      location="Test City"
      organizer="Smoke Admin"
    } @{ Authorization = $script:adminToken }

    $script:createdEventId = $ev._id
    if (-not $script:createdEventId) { throw "No event id returned" }
  }

  Step "User book event" {
    if (-not $script:createdEventId) { throw "No event id to book" }
    $b = JsonPost "$BaseUrl/api/bookings/book" @{ eventId=$script:createdEventId } @{ Authorization = $script:userToken }
    if (-not $b._id) { throw "Booking not created" }
  }

  Step "User ticket registration" {
    if (-not $script:createdEventId) { throw "No event id for ticketing" }
    $t = JsonPost "$BaseUrl/api/bookings/register-ticket" @{
      eventId=$script:createdEventId
      attendeeName="Smoke User"
      attendeeEmail=$script:userEmail
      ticketType="Standard"
      quantity=2
      paymentMethod="card"
    } @{ Authorization = $script:userToken }

    if (-not $t._id) { throw "Ticket registration failed" }
    if ($t.totalAmount -ne 50) { throw "Unexpected totalAmount: $($t.totalAmount)" }
  }

  Step "User bookings list" {
    $list = Invoke-RestMethod -Uri "$BaseUrl/api/bookings" -Headers @{ Authorization = $script:userToken }
    if ($null -eq $list -or $list.Count -lt 1) { throw "No bookings returned" }
  }
}
else {
  Write-Host "[INFO] Admin tests skipped (pass -AdminEmail and -AdminPassword to include)." -ForegroundColor Yellow
}

Write-Host "Done." -ForegroundColor Cyan
