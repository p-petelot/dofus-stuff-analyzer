"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AnalyzeResult } from "../../types";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const STORAGE_IMAGE_KEY = "analyzer:lastImage";
const STORAGE_RESULT_KEY = "analyzer:lastResult";

function formatHex(color: number): string {
  return `#${color.toString(16).padStart(6, "0").toUpperCase()}`;
}

function getSexEmoji(sex: string): string {
  if (!sex) return "";
  const normalized = sex.toLowerCase();
  if (normalized === "male" || normalized === "m" || normalized === "masculine") {
    return "♂️";
  }
  if (normalized === "female" || normalized === "f" || normalized === "feminine") {
    return "♀️";
  }
  return "❓";
}

export default function AnalyzePage(): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedImage = window.localStorage.getItem(STORAGE_IMAGE_KEY);
    const storedResult = window.localStorage.getItem(STORAGE_RESULT_KEY);

    if (storedImage) {
      setPreview(storedImage);
      fetch(storedImage)
        .then((response) => response.blob())
        .then((blob) => {
          const filename = "skin.png";
          const inferredType = blob.type || "image/png";
          const restoredFile = new File([blob], filename, { type: inferredType });
          setFile(restoredFile);
        })
        .catch(() => {
          /* ignore */
        });
    }

    if (storedResult) {
      try {
        const parsed = JSON.parse(storedResult) as AnalyzeResult;
        setResult(parsed);
      } catch (err) {
        console.error("Failed to parse cached result", err);
      }
    }
  }, []);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timeout);
  }, [copied]);

  const orderedItems = useMemo(() => {
    if (!result) {
      return [] as Array<[string, number | null]>;
    }
    return Object.entries(result.items).sort(([a], [b]) => a.localeCompare(b));
  }, [result]);

  const handleFile = useCallback((incoming: File) => {
    if (!ACCEPTED_TYPES.includes(incoming.type)) {
      setError("Seuls les fichiers PNG ou JPEG sont acceptés.");
      return;
    }
    if (incoming.size > MAX_FILE_SIZE) {
      setError("L'image dépasse la taille maximale de 5 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (dataUrl) {
        setPreview(dataUrl);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_IMAGE_KEY, dataUrl);
        }
      }
    };
    reader.readAsDataURL(incoming);

    setFile(incoming);
    const isSameFile =
      file &&
      file.name === incoming.name &&
      file.size === incoming.size &&
      file.lastModified === incoming.lastModified;
    if (!isSameFile) {
      setResult(null);
    }
    setError(null);
  }, [file]);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const dropped = event.dataTransfer.files?.[0];
      if (dropped) {
        handleFile(dropped);
      }
    },
    [handleFile],
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const analyze = useCallback(async () => {
    if (!file) {
      setError("Veuillez sélectionner une image à analyser.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setCopied(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message = payload?.error || "Impossible d'analyser ce fichier.";
        setError(message);
        if (payload?.colors && Array.isArray(payload.colors)) {
          setResult(payload as AnalyzeResult);
        }
        return;
      }

      setResult(payload as AnalyzeResult);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_RESULT_KEY, JSON.stringify(payload));
      }
    } catch (err) {
      setError("Erreur réseau inattendue. Réessayez dans un instant.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [file]);

  const copyJson = useCallback(() => {
    if (!result) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    const formatted = JSON.stringify(result, null, 2);
    navigator.clipboard
      .writeText(formatted)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }, [result]);

  return (
    <div className="py-12">
      <div className="container mx-auto px-4 space-y-8">
        <header className="space-y-4">
          <span className="badge-pill">Bêta interne</span>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">Analyseur de skin Dofus</h1>
            <p className="text-muted text-base mt-2 max-w-5xl">
              Déposez un rendu de skin pour extraire automatiquement les couleurs dominantes et obtenir une
              estimation des items équipés grâce à nos services métiers.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          <section className="bg-surface border border-muted rounded-3xl shadow-xl p-6 lg:p-8 space-y-6">
            <div className="space-y-4">
              <label
                htmlFor="skin-upload"
                className={`input-dropzone transition-colors duration-150 ease-out ${isDragging ? "dragging" : ""}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 badge">
                    <span role="img" aria-hidden="true">
                      🎯
                    </span>
                    <span>Étape 1</span>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-lg">Déposez votre skin ici</p>
                    <p className="text-muted text-sm">
                      Formats acceptés : PNG ou JPEG (5 Mo max). Vous pouvez aussi cliquer pour sélectionner un
                      fichier.
                    </p>
                  </div>
                  <button type="button" className="button-secondary">
                    Choisir un fichier
                  </button>
                </div>
                <input id="skin-upload" type="file" accept={ACCEPTED_TYPES.join(",")} className="hidden" onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) {
                    handleFile(selected);
                  }
                }} />
              </label>
              {error ? <div className="alert">{error}</div> : null}
            </div>

            {preview ? (
              <div className="bg-card border border-muted rounded-2xl shadow-lg p-4">
                <div className="flex items-start gap-4 lg:flex-row flex-col">
                  <div className="overflow-hidden rounded-2xl bg-muted flex-1">
                    <div className="relative" style={{ paddingBottom: "133%" }}>
                      <img
                        src={preview}
                        alt="Aperçu du skin"
                        className="absolute inset-0 h-full w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                  </div>
                  <div className="space-y-3 flex-1">
                    <h2 className="font-semibold text-lg">Prévisualisation</h2>
                    <p className="text-sm text-muted break-words">{file?.name ?? "skin.png"}</p>
                    <p className="tag">{Math.round((file?.size ?? 0) / 1024)} Ko</p>
                    <button type="button" className="button-secondary" onClick={() => file && handleFile(file)}>
                      Recharger l'image
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-muted rounded-2xl p-5 text-muted text-sm">
                Téléversez une image pour voir l'aperçu et lancer l'analyse.
              </div>
            )}

            <div className="flex items-center gap-4">
              <button type="button" className="button-primary" onClick={analyze} disabled={isLoading}>
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="spinner" aria-hidden="true" />
                    <span>Analyse en cours…</span>
                  </span>
                ) : (
                  "Analyser"
                )}
              </button>
              {result?.meta ? (
                <div className="text-sm text-muted">
                  Temps total : <span className="font-semibold">{result.meta.latencyMs} ms</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="bg-surface border border-muted rounded-3xl shadow-xl p-6 lg:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Résultats</h2>
              {result ? (
                <button type="button" className="button-secondary" onClick={copyJson} disabled={isLoading}>
                  {copied ? "JSON copié !" : "Copier le JSON"}
                </button>
              ) : null}
            </div>

            {!result && !isLoading ? (
              <p className="text-muted text-sm">
                Lancez une analyse pour visualiser la classe détectée, la répartition des couleurs et la liste des
                équipements identifiés.
              </p>
            ) : null}

            {result ? (
              <div className="space-y-6">
                <div className="bg-card border border-muted rounded-2xl p-5 shadow-lg space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1 space-y-2">
                      <p className="text-sm uppercase text-muted">Classe</p>
                      <p className="text-lg font-semibold">{result.breed || "Inconnue"}</p>
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-sm uppercase text-muted">Sexe</p>
                      <p className="text-lg font-semibold">
                        {result.sex || "Unknown"} <span aria-hidden="true">{getSexEmoji(result.sex)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="tag">Dimensions : {result.meta.imageWidth} × {result.meta.imageHeight} px</div>
                  {(() => {
                    const warnings = result.meta.upstreamErrors;
                    if (!warnings) {
                      return null;
                    }
                    const parts = [] as string[];
                    if (warnings.class) {
                      parts.push(`classe (${warnings.class})`);
                    }
                    if (warnings.items) {
                      parts.push(`items (${warnings.items})`);
                    }
                    if (!parts.length) {
                      return null;
                    }
                    return (
                      <p className="text-sm text-muted">
                        Certains services n'ont pas répondu : {parts.join(" et ")}.
                      </p>
                    );
                  })()}
                </div>

                <div className="space-y-4">
                  <h3 className="text-base font-semibold">Palette dominante</h3>
                  <div className="palette">
                    {result.colors.map((color, index) => (
                      <div key={`${color}-${index}`} className="palette-swatch">
                        <div
                          className="rounded-xl"
                          style={{ background: formatHex(color), height: "72px" }}
                          aria-hidden="true"
                        />
                        <p className="hex">{formatHex(color)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-base font-semibold">Équipements détectés</h3>
                  <div className="bg-card border border-muted rounded-2xl shadow-lg">
                    <table className="table text-sm">
                      <thead>
                        <tr className="text-muted">
                          <th>Slot</th>
                          <th>ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderedItems.map(([slot, id]) => (
                          <tr key={slot}>
                            <td className="font-medium text-foreground">{slot}</td>
                            <td>{id ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-base font-semibold">Réponse brute</h3>
                  <pre className="code-block">{JSON.stringify(result, null, 2)}</pre>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
