import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { PROJECT_ROOT } from "../config";
import type { NetworkAddress } from "./selection";

const executeFile = promisify(execFile);
const PROBE_TIMEOUT_MS = 8000;

// PowerShell emits a fixed JSON contract, never localized command-table text.
// Match profiles and routes by interface index so a Wi-Fi name cannot label Ethernet.
const NETWORK_QUERY = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$adapters = @(Get-NetAdapter -Physical)
$addresses = @(Get-NetIPAddress -AddressFamily IPv4 -PolicyStore ActiveStore)
$routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -PolicyStore ActiveStore)
$interfaces = @(Get-NetIPInterface -AddressFamily IPv4)
try { $profiles = @(Get-NetConnectionProfile) } catch { $profiles = @() }
$records = @(
  foreach ($adapter in $adapters) {
    $index = $adapter.ifIndex
    $interface = $interfaces | Where-Object InterfaceIndex -eq $index | Select-Object -First 1
    $route = $routes | Where-Object InterfaceIndex -eq $index | Sort-Object RouteMetric | Select-Object -First 1
    $names = @($profiles | Where-Object InterfaceIndex -eq $index | Select-Object -ExpandProperty Name -Unique)
    foreach ($address in ($addresses | Where-Object InterfaceIndex -eq $index)) {
      [pscustomobject]@{
        interfaceIndex = [int]$index
        interfaceType = [int]$adapter.InterfaceType
        physical = [bool]($adapter.HardwareInterface -and -not $adapter.Virtual)
        up = [bool]($adapter.ifOperStatus -eq 1)
        address = [string]$address.IPAddress
        preferred = [bool]($address.AddressState -eq 'Preferred')
        skipAsSource = [bool]$address.SkipAsSource
        manual = [bool]($address.PrefixOrigin -eq 'Manual' -and $address.SuffixOrigin -eq 'Manual')
        defaultRouteMetric = $(if ($route -and $interface) { [int]$route.RouteMetric + [int]$interface.InterfaceMetric } else { $null })
        networkName = $(if ($names.Count -eq 1 -and $names[0]) { [string]$names[0] } else { $null })
      }
    }
  }
)
ConvertTo-Json -InputObject $records -Depth 3 -Compress
`;

/** Parse only the structured probe contract, failing closed on unexpected output. */
export function parseNetworkAddresses(output: string): NetworkAddress[] {
  const records: unknown = JSON.parse(output.replace(/^\uFEFF/, ""));
  if (!Array.isArray(records) || !records.every(isNetworkAddress)) {
    throw new TypeError("Invalid Windows network configuration.");
  }
  return records;
}

function isNetworkAddress(value: unknown): value is NetworkAddress {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return Number.isInteger(record.interfaceIndex) && Number.isInteger(record.interfaceType) &&
    typeof record.address === "string" && typeof record.physical === "boolean" &&
    typeof record.up === "boolean" && typeof record.preferred === "boolean" &&
    typeof record.skipAsSource === "boolean" && typeof record.manual === "boolean" &&
    (record.defaultRouteMetric === null || (typeof record.defaultRouteMetric === "number" && Number.isFinite(record.defaultRouteMetric) && record.defaultRouteMetric >= 0)) &&
    (record.networkName === null || typeof record.networkName === "string");
}

/** Query the running Windows host without a shell, profile scripts or interactive windows. */
export async function queryWindowsNetwork(): Promise<NetworkAddress[]> {
  const executable = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  // Bound both duration and output. A failed probe must not prevent file access.
  // execFile terminates the owned PowerShell process when its timeout expires.
  const { stdout } = await executeFile(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", NETWORK_QUERY], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    windowsHide: true,
    timeout: PROBE_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });
  return parseNetworkAddresses(stdout);
}
