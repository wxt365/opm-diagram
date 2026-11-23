import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { randomUuid, sha256Hex } from "./browserCrypto";

afterEach(() => vi.unstubAllGlobals());

describe("LAN HTTP browser crypto", () => {
  it("uses getRandomValues when randomUUID is unavailable", () => {
    const insecureCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } as Crypto;
    vi.stubGlobal("crypto", insecureCrypto);
    expect(randomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("computes SHA-256 when subtle is unavailable", async () => {
    const insecureCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } as Crypto;
    vi.stubGlobal("crypto", insecureCrypto);
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex("订单😀")).toBe("3ab670cfd79c845b1be4ada47e144e7f469aaeb3f5b1cd2efb3beef928170bbd");
  });
});
