import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { SLOTS } from "../lib/config/suggestions";

const SEX_OPTIONS = [
  { value: "male", label: "Masculin" },
  { value: "female", label: "Féminin" },
];

const SLOT_LABELS = {
  coiffe: "Coiffe",
  cape: "Cape",
  bouclier: "Bouclier",
  familier: "Familier",
  epauliere: "Épaulière",
  costume: "Costume",
  ailes: "Ailes",
};

const DEFAULT_COLORS = ["#6B7280", "#475569", "#0EA5E9"];

function ensureHex(value) {
  if (!value) return "#000000";
  const trimmed = String(value).trim().replace(/#/g, "");
  const match = trimmed.match(/[0-9a-fA-F]{6}/);
  if (match) {
    return `#${match[0].toUpperCase()}`;
  }
  return "#000000";
}

function toItemsState(items = {}) {
  const state = {};
  for (const slot of SLOTS) {
    const entry = items?.[slot] ?? null;
    state[slot] = {
      itemId: entry?.itemId ?? "",
      label: entry?.label ?? "",
    };
  }
  return state;
}

function toFormDescriptor(match, fallbackPalette = DEFAULT_COLORS) {
  if (!match) {
    return {
      classId: "",
      sex: "male",
      colors: [...fallbackPalette],
      items: toItemsState(),
      trainAfter: true,
      evaluationSamples: 2,
    };
  }
  return {
    classId: match.classId ?? "",
    sex: match.sex ?? "male",
    colors: (match.colors && match.colors.length ? match.colors : fallbackPalette).map(ensureHex).slice(0, 5),
    items: toItemsState(match.items),
    trainAfter: true,
    evaluationSamples: 2,
  };
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "0%";
  }
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value) {
  if (value === null || value === undefined) return "0";
  return value.toLocaleString("fr-FR");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SkinLabPage() {
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState(null);
  const [predictResult, setPredictResult] = useState(null);
  const [descriptorForm, setDescriptorForm] = useState(toFormDescriptor(null));
  const [uploadPreview, setUploadPreview] = useState(null);
  const [labeling, setLabeling] = useState(false);
  const [labelMessage, setLabelMessage] = useState(null);
  const [autoTrainConfig, setAutoTrainConfig] = useState({
    iterations: 2,
    samplesPerClass: 4,
    evaluationSamples: 2,
    includeLabeled: true,
  });
  const [autoTrainLoading, setAutoTrainLoading] = useState(false);
  const [autoTrainReports, setAutoTrainReports] = useState([]);
  const [trainMessage, setTrainMessage] = useState(null);

  const classOptions = useMemo(() => status?.model?.metadata?.classes ?? [], [status]);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const response = await fetch("/api/skin-recognizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Statut indisponible");
      }
      setStatus(payload);
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        setUploadPreview(dataUrl);
        await handlePredict(dataUrl);
      } catch (error) {
        setPredictError(error.message ?? "Lecture impossible");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handlePredict = useCallback(
    async (imageData) => {
      if (!imageData) return;
      setPredicting(true);
      setPredictError(null);
      try {
        const response = await fetch("/api/skin-recognizer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "predict", image: imageData, topK: 4 }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error ?? "Analyse impossible");
        }
        setPredictResult(payload);
        const candidate = payload?.prediction?.descriptor ?? payload?.topMatches?.[0]?.descriptor ?? null;
        setDescriptorForm(toFormDescriptor(candidate, payload?.palette?.input ?? DEFAULT_COLORS));
      } catch (error) {
        setPredictError(error.message);
        setPredictResult(null);
      } finally {
        setPredicting(false);
      }
    },
    [],
  );

  const handleSelectMatch = useCallback(
    (match) => {
      if (!match) return;
      setDescriptorForm((prev) => ({
        ...toFormDescriptor(match.descriptor ?? match),
        trainAfter: prev?.trainAfter ?? true,
        evaluationSamples: prev?.evaluationSamples ?? 2,
      }));
    },
    [],
  );

  const handleColorChange = useCallback((index, value) => {
    setDescriptorForm((prev) => {
      const colors = [...(prev?.colors ?? [])];
      colors[index] = ensureHex(value);
      return { ...prev, colors };
    });
  }, []);

  const handleAddColor = useCallback(() => {
    setDescriptorForm((prev) => {
      const colors = [...(prev?.colors ?? [])];
      if (colors.length >= 6) return prev;
      colors.push("#FFFFFF");
      return { ...prev, colors };
    });
  }, []);

  const handleRemoveColor = useCallback((index) => {
    setDescriptorForm((prev) => {
      const colors = [...(prev?.colors ?? [])];
      colors.splice(index, 1);
      return { ...prev, colors };
    });
  }, []);

  const handleItemChange = useCallback((slot, value) => {
    setDescriptorForm((prev) => {
      const items = { ...(prev?.items ?? {}) };
      items[slot] = { ...(items[slot] ?? {}), itemId: value, label: items[slot]?.label ?? "" };
      return { ...prev, items };
    });
  }, []);

  const toggleTrainAfter = useCallback(() => {
    setDescriptorForm((prev) => ({ ...prev, trainAfter: !prev?.trainAfter }));
  }, []);

  const handleEvaluationSamplesChange = useCallback((value) => {
    const numeric = Number.parseInt(value, 10);
    setDescriptorForm((prev) => ({ ...prev, evaluationSamples: Number.isFinite(numeric) ? Math.max(1, numeric) : 1 }));
  }, []);

  const handleLabelSubmit = useCallback(async () => {
    if (!uploadPreview) {
      setLabelMessage({ type: "error", text: "Importez d'abord une image." });
      return;
    }
    const payload = {
      action: "label",
      image: uploadPreview,
      descriptor: {
        classId: descriptorForm.classId,
        sex: descriptorForm.sex,
        colors: (descriptorForm.colors ?? []).map(ensureHex).filter(Boolean),
        items: Object.fromEntries(
          Object.entries(descriptorForm.items ?? {})
            .filter(([, entry]) => entry?.itemId)
            .map(([slot, entry]) => [slot, Number(entry.itemId)]),
        ),
      },
      trainAfter: descriptorForm.trainAfter,
      evaluationSamples: descriptorForm.trainAfter ? descriptorForm.evaluationSamples : undefined,
      includeLabeled: true,
    };
    setLabeling(true);
    setLabelMessage(null);
    try {
      const response = await fetch("/api/skin-recognizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Échec de l'enregistrement");
      }
      setLabelMessage({ type: "success", text: "Exemple ajouté au dataset." });
      setStatus((prev) => ({
        ...prev,
        dataset: {
          ...(prev?.dataset ?? {}),
          summary: data.dataset ?? prev?.dataset?.summary,
          recent: prev?.dataset?.recent,
        },
      }));
      fetchStatus();
    } catch (error) {
      setLabelMessage({ type: "error", text: error.message });
    } finally {
      setLabeling(false);
    }
  }, [descriptorForm, fetchStatus, uploadPreview]);

  const handleAutoTrainConfigChange = useCallback((key, value) => {
    setAutoTrainConfig((prev) => ({
      ...prev,
      [key]: key === "includeLabeled" ? Boolean(value) : Number.parseInt(value, 10) || 0,
    }));
  }, []);

  const handleAutoTrain = useCallback(async () => {
    setAutoTrainLoading(true);
    setAutoTrainReports([]);
    setTrainMessage(null);
    try {
      const response = await fetch("/api/skin-recognizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "autoTrain",
          iterations: Math.max(1, autoTrainConfig.iterations || 1),
          samplesPerClass: Math.max(1, autoTrainConfig.samplesPerClass || 1),
          evaluationSamples: Math.max(1, autoTrainConfig.evaluationSamples || 1),
          includeLabeled: autoTrainConfig.includeLabeled,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Entraînement automatique indisponible");
      }
      setAutoTrainReports(data.reports ?? []);
      setTrainMessage({ type: "success", text: "Session d'entraînement terminée." });
      fetchStatus();
    } catch (error) {
      setTrainMessage({ type: "error", text: error.message });
    } finally {
      setAutoTrainLoading(false);
    }
  }, [autoTrainConfig, fetchStatus]);

  const datasetSummary = status?.dataset?.summary ?? null;
  const recentSamples = status?.dataset?.recent ?? [];

  return (
    <div className="page lab-page">
      <Head>
        <title>Laboratoire IA — Dofus Stuff Analyzer</title>
      </Head>
      <div className="lab-page__header">
        <div>
          <Link href="/" className="lab-back">
            ← Retour
          </Link>
          <h1>Laboratoire d'entraînement IA</h1>
          <p>
            Importez une image de skin pour analyser les prédictions, valider la vérité terrain et déclencher des sessions
            d'entraînement automatiques.
          </p>
        </div>
        <div className="lab-header__status">
          <span className={`lab-dot${status?.model ? " lab-dot--active" : ""}`} aria-hidden="true" />
          <span>{status?.model ? "Modèle actif" : "Modèle non entraîné"}</span>
        </div>
      </div>

      <div className="lab-grid">
        <section className="lab-card">
          <header className="lab-card__header">
            <div>
              <h2>1. Analyse d'une image</h2>
              <p>Chargez une capture de skin pour obtenir les meilleures correspondances actuelles.</p>
            </div>
            <label className="lab-upload">
              <span>{predicting ? "Analyse…" : "Importer une image"}</span>
              <input type="file" accept="image/*" onChange={handleFileChange} disabled={predicting} />
            </label>
          </header>
          <div className="lab-card__content">
            {predictError ? <p className="lab-error">{predictError}</p> : null}
            {uploadPreview ? (
              <div className="lab-preview">
                <img src={uploadPreview} alt="Prévisualisation" />
              </div>
            ) : (
              <p className="lab-muted">Aucune image sélectionnée.</p>
            )}
            {predictResult?.topMatches?.length ? (
              <div className="lab-matches">
                {predictResult.topMatches.map((match, index) => {
                  const active = descriptorForm.classId === match.descriptor.classId && descriptorForm.sex === match.descriptor.sex;
                  return (
                    <button
                      key={match.descriptor.classId + match.score + index}
                      type="button"
                      className={`lab-match${active ? " is-active" : ""}`}
                      onClick={() => handleSelectMatch(match)}
                    >
                      <div className="lab-match__header">
                        <strong>
                          {match.descriptor.classId} • {match.descriptor.sex === "female" ? "F" : "M"}
                        </strong>
                        <span>{formatPercent(match.score)}</span>
                      </div>
                      <div className="lab-match__colors" aria-hidden="true">
                        {(match.descriptor.colors ?? []).slice(0, 4).map((hex) => (
                          <span key={hex} style={{ backgroundColor: hex }} />
                        ))}
                      </div>
                      <ul className="lab-match__items">
                        {SLOTS.map((slot) => {
                          const item = match.descriptor.items?.[slot];
                          if (!item) return null;
                          return <li key={slot}>{SLOT_LABELS[slot] ?? slot}: {item.label}</li>;
                        })}
                      </ul>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>

        <section className="lab-card">
          <header className="lab-card__header">
            <div>
              <h2>2. Valider la vérité terrain</h2>
              <p>Corrigez si nécessaire la classe, le sexe, les couleurs ou les items détectés.</p>
            </div>
          </header>
          <div className="lab-card__content">
            <div className="lab-form">
              <label className="lab-field">
                <span>Classe</span>
                <input
                  list="lab-class-options"
                  value={descriptorForm.classId}
                  onChange={(event) => setDescriptorForm((prev) => ({ ...prev, classId: event.target.value }))}
                />
                <datalist id="lab-class-options">
                  {classOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>
              <label className="lab-field">
                <span>Sexe</span>
                <select
                  value={descriptorForm.sex}
                  onChange={(event) => setDescriptorForm((prev) => ({ ...prev, sex: event.target.value }))}
                >
                  {SEX_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="lab-field">
                <div className="lab-field__label">
                  <span>Couleurs principales</span>
                  <button type="button" className="lab-inline" onClick={handleAddColor} disabled={(descriptorForm.colors ?? []).length >= 6}>
                    Ajouter
                  </button>
                </div>
                <div className="lab-colors">
                  {(descriptorForm.colors ?? []).map((color, index) => (
                    <div key={`${color}-${index}`} className="lab-color-input">
                      <input
                        type="color"
                        value={ensureHex(color)}
                        onChange={(event) => handleColorChange(index, event.target.value)}
                      />
                      <input
                        type="text"
                        value={ensureHex(color)}
                        onChange={(event) => handleColorChange(index, event.target.value)}
                      />
                      <button type="button" onClick={() => handleRemoveColor(index)} aria-label="Supprimer la couleur">
                        ×
                      </button>
                    </div>
                  ))}
                  {(descriptorForm.colors ?? []).length === 0 ? <p className="lab-muted">Aucune couleur définie.</p> : null}
                </div>
              </div>
              <div className="lab-items">
                <h3>Items</h3>
                <div className="lab-items__grid">
                  {SLOTS.map((slot) => {
                    const entry = descriptorForm.items?.[slot] ?? { itemId: "", label: "" };
                    return (
                      <label key={slot} className="lab-field">
                        <span>{SLOT_LABELS[slot] ?? slot}</span>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={entry.itemId}
                          onChange={(event) => handleItemChange(slot, event.target.value)}
                        />
                        {entry.label ? <small className="lab-muted">{entry.label}</small> : null}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="lab-field lab-field--inline">
                <label className="lab-checkbox">
                  <input type="checkbox" checked={descriptorForm.trainAfter} onChange={toggleTrainAfter} />
                  <span>Réentraîner automatiquement après l'ajout</span>
                </label>
                {descriptorForm.trainAfter ? (
                  <label className="lab-field lab-field--compact">
                    <span>Échantillons d'évaluation</span>
                    <input
                      type="number"
                      min="1"
                      value={descriptorForm.evaluationSamples}
                      onChange={(event) => handleEvaluationSamplesChange(event.target.value)}
                    />
                  </label>
                ) : null}
              </div>
              <button type="button" className="lab-primary" onClick={handleLabelSubmit} disabled={labeling}>
                {labeling ? "Enregistrement…" : "Ajouter au dataset"}
              </button>
              {labelMessage ? <p className={`lab-message lab-message--${labelMessage.type}`}>{labelMessage.text}</p> : null}
            </div>
          </div>
        </section>

        <section className="lab-card">
          <header className="lab-card__header">
            <div>
              <h2>3. État du dataset</h2>
              <p>Suivez la progression des exemples disponibles pour l'entraînement.</p>
            </div>
            <button type="button" className="lab-inline" onClick={fetchStatus} disabled={loadingStatus}>
              {loadingStatus ? "Actualisation…" : "Rafraîchir"}
            </button>
          </header>
          <div className="lab-card__content">
            {statusError ? <p className="lab-error">{statusError}</p> : null}
            {datasetSummary ? (
              <div className="lab-metrics">
                <div className="lab-metric">
                  <span>Total</span>
                  <strong>{formatNumber(datasetSummary.total)}</strong>
                </div>
                <div className="lab-metric">
                  <span>Vérités terrain</span>
                  <strong>{formatNumber(datasetSummary.labeled)}</strong>
                </div>
                <div className="lab-metric">
                  <span>Synthétiques</span>
                  <strong>{formatNumber(datasetSummary.synthetic)}</strong>
                </div>
              </div>
            ) : (
              <p className="lab-muted">Aucune statistique pour le moment.</p>
            )}
            {datasetSummary?.classes ? (
              <div className="lab-classes">
                <h3>Répartition par classe</h3>
                <ul>
                  {Object.entries(datasetSummary.classes)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([key, value]) => (
                      <li key={key}>
                        <span>{key}</span>
                        <strong>{formatNumber(value)}</strong>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
            {recentSamples?.length ? (
              <div className="lab-recent">
                <h3>Ajouts récents</h3>
                <ul>
                  {recentSamples.map((sample) => (
                    <li key={sample.id}>
                      <div>
                        <strong>{sample.descriptor.classId}</strong> • {sample.descriptor.sex === "female" ? "F" : "M"}
                        <span className="lab-muted"> {new Date(sample.createdAt).toLocaleString("fr-FR")}</span>
                      </div>
                      <div className="lab-recent__colors" aria-hidden="true">
                        {sample.descriptor.colors.slice(0, 4).map((hex) => (
                          <span key={hex} style={{ backgroundColor: hex }} />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <section className="lab-card">
          <header className="lab-card__header">
            <div>
              <h2>4. Entraînement automatique</h2>
              <p>Générez massivement des combinaisons synthétiques pour faire progresser le modèle.</p>
            </div>
          </header>
          <div className="lab-card__content">
            <div className="lab-form lab-form--row">
              <label className="lab-field">
                <span>Itérations</span>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={autoTrainConfig.iterations}
                  onChange={(event) => handleAutoTrainConfigChange("iterations", event.target.value)}
                />
              </label>
              <label className="lab-field">
                <span>Échantillons / classe</span>
                <input
                  type="number"
                  min="1"
                  value={autoTrainConfig.samplesPerClass}
                  onChange={(event) => handleAutoTrainConfigChange("samplesPerClass", event.target.value)}
                />
              </label>
              <label className="lab-field">
                <span>Tests / classe</span>
                <input
                  type="number"
                  min="1"
                  value={autoTrainConfig.evaluationSamples}
                  onChange={(event) => handleAutoTrainConfigChange("evaluationSamples", event.target.value)}
                />
              </label>
              <label className="lab-checkbox">
                <input
                  type="checkbox"
                  checked={autoTrainConfig.includeLabeled}
                  onChange={(event) => handleAutoTrainConfigChange("includeLabeled", event.target.checked)}
                />
                <span>Inclure le dataset labellisé</span>
              </label>
            </div>
            <button type="button" className="lab-primary" onClick={handleAutoTrain} disabled={autoTrainLoading}>
              {autoTrainLoading ? "Entraînement…" : "Lancer l'auto-train"}
            </button>
            {trainMessage ? <p className={`lab-message lab-message--${trainMessage.type}`}>{trainMessage.text}</p> : null}
            {autoTrainReports?.length ? (
              <div className="lab-reports">
                {autoTrainReports.map((report) => (
                  <article key={report.iteration}>
                    <header>
                      <h3>Itération {report.iteration}</h3>
                      <span>{formatNumber(report.trained)} échantillons</span>
                    </header>
                    {report.metadata ? (
                      <ul>
                        <li>Classes : {report.metadata.classes.join(", ")}</li>
                        <li>Sexes : {report.metadata.sexes.join(" / ")}</li>
                        <li>Items utilisés : {formatNumber(report.metadata.itemsUsed)}</li>
                      </ul>
                    ) : null}
                    {report.evaluation ? (
                      <div className="lab-metrics lab-metrics--inline">
                        <div className="lab-metric">
                          <span>Classe</span>
                          <strong>{formatPercent(report.evaluation.metrics.classAccuracy)}</strong>
                        </div>
                        <div className="lab-metric">
                          <span>Sexe</span>
                          <strong>{formatPercent(report.evaluation.metrics.sexAccuracy)}</strong>
                        </div>
                        <div className="lab-metric">
                          <span>Exact</span>
                          <strong>{formatPercent(report.evaluation.metrics.exactMatch)}</strong>
                        </div>
                        <div className="lab-metric">
                          <span>Score moyen</span>
                          <strong>{report.evaluation.metrics.averageScore.toFixed(2)}</strong>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
