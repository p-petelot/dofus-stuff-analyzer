import { describe, expect, it } from "vitest";
import { mapCanvasSnapshotsToCandidates } from "../pages/api/site-images";

describe("mapCanvasSnapshotsToCandidates", () => {
  it("maps successful canvas captures to data URI candidates", () => {
    const { candidates, diagnostics } = mapCanvasSnapshotsToCandidates([
      {
        dataUrl: "data:image/png;base64,Zm9vYmFy",
        id: "canvas0",
        className: "preview",
        width: 512,
        height: 256,
      },
    ]);

    expect(candidates).toEqual([
      {
        url: "data:image/png;base64,Zm9vYmFy",
        source: "canvas:rendered",
        attribute: "toDataURL",
        element: "canvas",
        elementId: "canvas0",
        elementClass: "preview",
        descriptor: "toDataURL (512×256)",
      },
    ]);

    expect(diagnostics).toEqual([]);
  });

  it("collects diagnostics for canvases that cannot be exported", () => {
    const { candidates, diagnostics } = mapCanvasSnapshotsToCandidates([
      {
        dataUrl: null,
        error: "SecurityError",
        id: "canvas1",
        className: "", // ignored
        width: 128,
        height: 128,
      },
      {
        dataUrl: "https://example.com/not-data-uri.png",
        error: null,
        id: "",
        className: "result",
      },
    ]);

    expect(candidates).toEqual([]);

    expect(diagnostics).toEqual([
      {
        index: 0,
        elementId: "canvas1",
        elementClass: null,
        error: "SecurityError",
      },
      {
        index: 1,
        elementId: null,
        elementClass: "result",
        error: "Rendered canvas did not return a data URI",
      },
    ]);
  });
});
