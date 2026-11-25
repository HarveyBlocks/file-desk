import { test } from "node:test";
import assert from "node:assert/strict";
import { selectLanCandidates, type NetworkAddress } from "../src/server/network/selection";
import { parseNetworkAddresses } from "../src/server/network/windows";
import { readLanCandidates } from "../src/server/network";

function address(overrides: Partial<NetworkAddress> = {}): NetworkAddress {
  return {
    interfaceIndex: 7, interfaceType: 71, physical: true, up: true,
    address: "192.168.2.128", preferred: true, skipAsSource: false, manual: true,
    defaultRouteMetric: 35, networkName: "Office",
    ...overrides,
  };
}

test("manual addresses outrank DHCP even when DHCP has a better default route", () => {
  const manual = address({ address: "10.0.0.2", defaultRouteMetric: null });
  const dhcp = address({ address: "192.168.1.2", manual: false, defaultRouteMetric: 1 });
  const source = [dhcp, manual];
  assert.deepEqual(selectLanCandidates(source).map(candidate => candidate.address), ["10.0.0.2", "192.168.1.2"]);
  assert.equal(source[0], dhcp, "selection must not mutate the probe snapshot");
});

test("equal origins prefer a default route and then the combined Windows metric", () => {
  const addresses = [
    address({ address: "10.0.0.4", defaultRouteMetric: null }),
    address({ address: "10.0.0.3", defaultRouteMetric: 40 }),
    address({ address: "10.0.0.2", defaultRouteMetric: 5 }),
  ];
  assert.deepEqual(selectLanCandidates(addresses).map(candidate => candidate.address), ["10.0.0.2", "10.0.0.3", "10.0.0.4"]);
  assert.deepEqual(selectLanCandidates(addresses.map(record => ({ ...record, manual: false }))).map(candidate => candidate.address), ["10.0.0.2", "10.0.0.3", "10.0.0.4"]);
});

test("tied routes use interface index followed by numeric IPv4 ordering", () => {
  const addresses = [
    address({ interfaceIndex: 8, address: "10.0.0.1" }),
    address({ interfaceIndex: 7, address: "10.0.0.10" }),
    address({ interfaceIndex: 7, address: "10.0.0.2" }),
  ];
  const expected = ["7:10.0.0.2", "7:10.0.0.10", "8:10.0.0.1"];
  assert.deepEqual(selectLanCandidates(addresses).map(candidate => candidate.id), expected);
  assert.deepEqual(selectLanCandidates([...addresses].reverse()).map(candidate => candidate.id), expected);
});

test("excluded networks never reach the client candidate list", () => {
  const excluded = [
    address({ physical: false }),
    address({ up: false }),
    address({ interfaceType: 53 }),
    address({ interfaceType: 131 }),
    address({ interfaceType: 24, address: "127.0.0.1" }),
    address({ preferred: false }),
    address({ skipAsSource: true }),
    ...["127.0.0.1", "169.254.2.3", "8.8.8.8", "172.15.0.1", "172.32.0.1", "::1", "fd00::1", "192.168.2.999", "10.01.0.1"]
      .map(ip => address({ address: ip })),
  ];
  assert.deepEqual(selectLanCandidates(excluded), []);
  assert.equal(selectLanCandidates([address(), ...excluded]).length, 1);
});

test("private subnet boundaries and physical Ethernet are eligible", () => {
  const ips = ["10.0.0.1", "10.255.255.254", "172.16.0.1", "172.31.255.254", "192.168.0.1", "192.168.255.254"];
  assert.equal(selectLanCandidates(ips.map(ip => address({ address: ip, interfaceType: 6 }))).length, ips.length);
});

test("candidate labels retain only the network name matched to their interface", () => {
  assert.deepEqual(selectLanCandidates([
    address({ interfaceIndex: 3, networkName: "\u529e\u516c Wi-Fi" }),
    address({ interfaceIndex: 4, networkName: null }),
  ]), [
    { id: "3:192.168.2.128", address: "192.168.2.128", networkName: "\u529e\u516c Wi-Fi" },
    { id: "4:192.168.2.128", address: "192.168.2.128", networkName: null },
  ]);
});

test("Windows JSON handles empty, single and Unicode snapshots and rejects malformed output", () => {
  assert.deepEqual(parseNetworkAddresses("[]"), []);
  const snapshot = [address({ networkName: "\u529e\u516c\u7f51\u7edc" })];
  assert.deepEqual(parseNetworkAddresses("\uFEFF" + JSON.stringify(snapshot)), snapshot);
  for (const invalid of ["", "Access denied", "null", "{}", JSON.stringify([address(), {}]), JSON.stringify([{ ...address(), manual: "Manual" }])]) {
    assert.throws(() => parseNetworkAddresses(invalid));
  }
});

test("discovery fails safely for denied, timed-out, failed and unsupported hosts", async () => {
  for (const code of ["EACCES", "ETIMEDOUT", "ENOENT"]) {
    assert.deepEqual(await readLanCandidates(async () => { throw Object.assign(new Error("Probe failed."), { code }); }, "win32"), []);
  }
  let called = false;
  assert.deepEqual(await readLanCandidates(async () => { called = true; return [address()]; }, "linux"), []);
  assert.equal(called, false);
  assert.deepEqual(await readLanCandidates(async () => [], "win32"), []);
  assert.deepEqual(await readLanCandidates(async () => [address()], "win32"), [
    { id: "7:192.168.2.128", address: "192.168.2.128", networkName: "Office" },
  ]);
});
