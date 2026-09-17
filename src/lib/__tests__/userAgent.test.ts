import { describe, it, expect } from "vitest";
import { parseUserAgent } from "../userAgent";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const EDGE_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
const FIREFOX_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

describe("parseUserAgent", () => {
  it("detecta Chrome en macOS y lo marca como escritorio", () => {
    expect(parseUserAgent(CHROME_MAC)).toEqual({
      browser: "Chrome",
      os: "macOS",
      isMobile: false,
    });
  });

  it("detecta Safari en iOS y lo marca como móvil", () => {
    expect(parseUserAgent(SAFARI_IOS)).toEqual({
      browser: "Safari",
      os: "iOS",
      isMobile: true,
    });
  });

  it("no confunde Edge con Chrome: Edge se anuncia como Chrome en su UA", () => {
    expect(parseUserAgent(EDGE_WIN).browser).toBe("Edge");
    expect(parseUserAgent(EDGE_WIN).os).toBe("Windows");
  });

  it("no confunde Chrome con Safari: Chrome también incluye 'Safari' en su UA", () => {
    expect(parseUserAgent(CHROME_MAC).browser).toBe("Chrome");
  });

  it("detecta Firefox en Linux", () => {
    expect(parseUserAgent(FIREFOX_LINUX)).toEqual({
      browser: "Firefox",
      os: "Linux",
      isMobile: false,
    });
  });

  it("detecta Android como móvil", () => {
    expect(parseUserAgent(CHROME_ANDROID)).toEqual({
      browser: "Chrome",
      os: "Android",
      isMobile: true,
    });
  });

  it("degrada a 'Desconocido' con entradas vacías o basura", () => {
    for (const input of [null, undefined, "", "   ", "no-soy-un-user-agent"]) {
      expect(parseUserAgent(input)).toEqual({
        browser: "Desconocido",
        os: "Desconocido",
        isMobile: false,
      });
    }
  });
});
