import { describe, expect, it } from "vitest";
import { extractCanvasPreviewCandidates } from "../pages/api/skin-preview";

describe("extractCanvasPreviewCandidates", () => {
  const baseUrl = "https://barbofus.com/skinator?s=example";

  it("captures preview URLs from hyphenated canvas data attributes", () => {
    const html = `
      <div>
        <canvas id="canvas0" data-preview-url="https://barbofus.com/assets/preview/canvas.png"></canvas>
      </div>
    `;

    const candidates = extractCanvasPreviewCandidates(html, baseUrl);
    expect(candidates).toEqual([
      {
        url: "https://barbofus.com/assets/preview/canvas.png",
        source: "canvas:attr",
        attribute: "data-preview-url",
      },
    ]);
  });

  it("captures preview URLs defined via inline styles", () => {
    const html = `
      <canvas
        id="canvas0"
        style="background-image: url('https://barbofus.com/assets/preview/canvas-style.png');"
      ></canvas>
    `;

    const candidates = extractCanvasPreviewCandidates(html, baseUrl);
    expect(candidates).toEqual([
      {
        url: "https://barbofus.com/assets/preview/canvas-style.png",
        source: "canvas:style",
        attribute: "style",
      },
    ]);
  });
});
