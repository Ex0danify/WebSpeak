import { describe, expect, it } from "vitest";
import { isPlainSvg, sniffImage, sniffRaster, toDataUri } from "./imageSniff.js";

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);

describe("sniffRaster", () => {
  it.each([
    ["png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), "image/png"],
    ["jpeg", bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg"],
    ["gif87a", text("GIF87a.."), "image/gif"],
    ["gif89a", text("GIF89a.."), "image/gif"],
    ["webp", text("RIFF\0\0\0\0WEBPVP8 "), "image/webp"],
  ])("recognizes %s by its first bytes", (_name, data, mime) => {
    expect(sniffRaster(data)).toBe(mime);
  });

  it.each([
    ["html", text("<!doctype html><html></html>")],
    ["a wave file", text("RIFF\0\0\0\0WAVEfmt ")],
    ["empty", new Uint8Array()],
  ])("rejects %s", (_name, data) => {
    expect(sniffRaster(data)).toBeNull();
  });
});

describe("isPlainSvg", () => {
  it("accepts a plain drawing, also with a prolog and a comment", () => {
    expect(isPlainSvg(text('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" fill="red"/></svg>'))).toBe(true);
    expect(isPlainSvg(text('<?xml version="1.0"?>\n<!-- made by hand -->\n<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>'))).toBe(true);
    expect(isPlainSvg(text(String.fromCharCode(0xfeff) + '<svg><use href="#a"/><style>.a{fill:url(#g)}</style></svg>'))).toBe(true);
  });

  it.each([
    ["a script element", "<svg><script>alert(1)</script></svg>"],
    ["a script in mixed case", "<svg><ScRiPt>alert(1)</sCrIpT></svg>"],
    ["an event handler", '<svg onload="alert(1)"></svg>'],
    ["an event handler on a child", '<svg><circle onclick = "x()"/></svg>'],
    ["a foreignObject", "<svg><foreignObject><body/></foreignObject></svg>"],
    ["an entity declaration", '<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg>&a;</svg>'],
    ["a javascript link", '<svg><a href="javascript:alert(1)"><text/></a></svg>'],
    ["an external image", '<svg><image href="https://example.com/a.png"/></svg>'],
    ["an external xlink", '<svg><image xlink:href="//example.com/a.png"/></svg>'],
    ["a data image", '<svg><image href="data:image/png;base64,AAAA"/></svg>'],
    ["an external stylesheet", '<svg><style>@import url("https://example.com/a.css");</style></svg>'],
    ["an external url()", '<svg><rect style="fill:url(https://example.com/x)"/></svg>'],
    ["an iframe", "<svg><iframe src='x'/></svg>"],
    ["an animation that sets a link", '<svg><a><animate attributeName="href" to="javascript:x"/></a></svg>'],
    ["something that only mentions svg", "<html><svg></svg></html>"],
    ["plain text", "hello"],
  ])("rejects %s", (_name, source) => {
    expect(isPlainSvg(text(source))).toBe(false);
  });
});

describe("sniffImage", () => {
  it("falls back to svg only for a plain one", () => {
    expect(sniffImage(text("<svg></svg>"))).toBe("image/svg+xml");
    expect(sniffImage(text("<svg onload='x()'></svg>"))).toBeNull();
  });

  it("builds a data uri from the sniffed type", () => {
    expect(toDataUri("image/gif", text("GIF89a"))).toBe(`data:image/gif;base64,${Buffer.from("GIF89a").toString("base64")}`);
  });
});
