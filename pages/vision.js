import { useCallback, useMemo, useState } from "react";
import Head from "next/head";
import { ModelPredictionSection } from "../app/components/ModelPredictionSection";
import { useLanguage } from "../lib/i18n";
import { usePredictionLabels } from "../lib/vision/usePredictionLabels";

const DEFAULT_RENDERER = "https://skin.souff.fr/renderer/";

function useStatusMessages(t, prefix) {
  return useMemo(() => ({
    idle: typeof t(`${prefix}.status.idle`) === "string" ? t(`${prefix}.status.idle`) : "",
    running:
      typeof t(`${prefix}.status.running`) === "string" ? t(`${prefix}.status.running`) : "Processing…",
    success:
      typeof t(`${prefix}.status.success`) === "string" ? t(`${prefix}.status.success`) : "Completed",
    error:
      typeof t(`${prefix}.status.error`) === "string" ? t(`${prefix}.status.error`) : "An error occurred",
  }), [t, prefix]);
}

export default function VisionLab() {
  const { t } = useLanguage();
  const predictionLabels = usePredictionLabels(t);
  const generateStatusText = useStatusMessages(t, "vision.lab.generate");
  const trainStatusText = useStatusMessages(t, "vision.lab.train");

  const [per, setPer] = useState(5);
  const [rendererUrl, setRendererUrl] = useState(DEFAULT_RENDERER);
  const [generateStatus, setGenerateStatus] = useState("idle");

  const [epochs, setEpochs] = useState(1);
  const [batchSize, setBatchSize] = useState(32);
  const [imgSize, setImgSize] = useState(128);
  const [learningRate, setLearningRate] = useState(0.0002);
  const [trainStatus, setTrainStatus] = useState("idle");
  const [trainHistory, setTrainHistory] = useState([]);

  const [predictionResult, setPredictionResult] = useState(null);
  const [predictionError, setPredictionError] = useState(null);
  const [isPredicting, setIsPredicting] = useState(false);

  const metaTitle = typeof t("vision.lab.title") === "string" ? t("vision.lab.title") : "Vision Lab";
  const metaDescription =
    typeof t("vision.lab.subtitle") === "string"
      ? t("vision.lab.subtitle")
      : "Gestion du modèle Dofus Vision";

  const handleGenerate = useCallback(async () => {
    setGenerateStatus("running");
    try {
      const response = await fetch("/api/vision/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ per: Number(per), renderer: rendererUrl }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Generation failed");
      }
      setGenerateStatus("success");
    } catch (error) {
      console.error(error);
      setGenerateStatus("error");
    }
  }, [per, rendererUrl]);

  const handleTrain = useCallback(async () => {
    setTrainStatus("running");
    setTrainHistory([]);
    try {
      const response = await fetch("/api/vision/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          epochs: Number(epochs),
          batchSize: Number(batchSize),
          imgSize: Number(imgSize),
          learningRate: Number(learningRate),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Training failed");
      }
      const payload = await response.json();
      setTrainHistory(Array.isArray(payload?.history) ? payload.history : []);
      setTrainStatus("success");
    } catch (error) {
      console.error(error);
      setTrainStatus("error");
    }
  }, [batchSize, epochs, imgSize, learningRate]);

  const handlePredictFile = useCallback(
    (file) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = event.target?.result;
        if (typeof result !== "string") return;
        setIsPredicting(true);
        setPredictionResult(null);
        setPredictionError(null);
        try {
          const response = await fetch("/api/vision/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: result, renderer: rendererUrl }),
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload?.error || "Prediction failed");
          }
          const payload = await response.json();
          setPredictionResult(payload);
        } catch (error) {
          console.error(error);
          const fallback = t("vision.lab.predict.error");
          setPredictionError(error?.message || (typeof fallback === "string" ? fallback : "Prediction failed"));
        } finally {
          setIsPredicting(false);
        }
      };
      reader.readAsDataURL(file);
    },
    [rendererUrl, t],
  );

  const handlePredictChange = useCallback(
    (event) => {
      const file = event.target?.files?.[0];
      if (file) {
        handlePredictFile(file);
        event.target.value = "";
      }
    },
    [handlePredictFile],
  );

  const generateStatusMessage = generateStatusText[generateStatus] ?? "";
  const trainStatusMessage = trainStatusText[trainStatus] ?? "";

  return (
    <>
      <Head>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
      </Head>
      <main className="vision-lab">
        <div className="vision-lab__intro">
          <h1>{metaTitle}</h1>
          <p>{metaDescription}</p>
        </div>
        <div className="vision-lab__grid">
          <section className="vision-lab__card">
            <header>
              <h2>{t("vision.lab.generate.title")}</h2>
              <p>{t("vision.lab.generate.description")}</p>
            </header>
            <div className="vision-lab__form">
              <label>
                <span>{t("vision.lab.generate.per")}</span>
                <input
                  type="number"
                  min="1"
                  value={per}
                  onChange={(event) => setPer(Number(event.target.value) || 1)}
                />
              </label>
              <label>
                <span>{t("vision.lab.generate.renderer")}</span>
                <input value={rendererUrl} onChange={(event) => setRendererUrl(event.target.value)} />
              </label>
              <button
                type="button"
                className="vision-lab__button vision-lab__button--primary"
                onClick={handleGenerate}
                disabled={generateStatus === "running"}
              >
                {t("vision.lab.generate.button")}
              </button>
              {generateStatusMessage ? (
                <p className={`vision-lab__status vision-lab__status--${generateStatus}`} aria-live="polite">
                  {generateStatusMessage}
                </p>
              ) : null}
            </div>
          </section>

          <section className="vision-lab__card">
            <header>
              <h2>{t("vision.lab.train.title")}</h2>
              <p>{t("vision.lab.train.description")}</p>
            </header>
            <div className="vision-lab__form vision-lab__form--grid">
              <label>
                <span>{t("vision.lab.train.epochs")}</span>
                <input
                  type="number"
                  min="1"
                  value={epochs}
                  onChange={(event) => setEpochs(Number(event.target.value) || 1)}
                />
              </label>
              <label>
                <span>{t("vision.lab.train.batch")}</span>
                <input
                  type="number"
                  min="1"
                  value={batchSize}
                  onChange={(event) => setBatchSize(Number(event.target.value) || 1)}
                />
              </label>
              <label>
                <span>{t("vision.lab.train.imgSize")}</span>
                <input
                  type="number"
                  min="32"
                  step="16"
                  value={imgSize}
                  onChange={(event) => setImgSize(Number(event.target.value) || 32)}
                />
              </label>
              <label>
                <span>{t("vision.lab.train.learningRate")}</span>
                <input
                  type="number"
                  step="0.0001"
                  value={learningRate}
                  onChange={(event) => setLearningRate(Number(event.target.value) || 0.0002)}
                />
              </label>
            </div>
            <button
              type="button"
              className="vision-lab__button vision-lab__button--primary"
              onClick={handleTrain}
              disabled={trainStatus === "running"}
            >
              {t("vision.lab.train.button")}
            </button>
            {trainStatusMessage ? (
              <p className={`vision-lab__status vision-lab__status--${trainStatus}`} aria-live="polite">
                {trainStatusMessage}
              </p>
            ) : null}
            {trainHistory.length ? (
              <div className="vision-lab__history" role="table">
                <div className="vision-lab__history-row vision-lab__history-row--head" role="row">
                  <span role="columnheader">#</span>
                  <span role="columnheader">acc</span>
                  <span role="columnheader">val</span>
                  <span role="columnheader">loss</span>
                  <span role="columnheader">val loss</span>
                </div>
                {trainHistory.map((entry) => (
                  <div key={entry.epoch} className="vision-lab__history-row" role="row">
                    <span role="cell">{entry.epoch}</span>
                    <span role="cell">{(entry.trainAcc * 100).toFixed(1)}%</span>
                    <span role="cell">{(entry.valAcc * 100).toFixed(1)}%</span>
                    <span role="cell">{entry.trainLoss.toFixed(4)}</span>
                    <span role="cell">{entry.valLoss.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="vision-lab__card vision-lab__card--prediction">
            <header>
              <h2>{t("vision.lab.predict.title")}</h2>
              <p>{t("vision.lab.predict.description")}</p>
            </header>
            <div className="vision-lab__upload">
              <label className="vision-lab__upload-label">
                <input type="file" accept="image/*" onChange={handlePredictChange} />
                <span className="vision-lab__upload-content">
                  <span className="vision-lab__upload-icon" aria-hidden="true">📤</span>
                  <span>{t("vision.lab.predict.upload")}</span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setPredictionResult(null);
                  setPredictionError(null);
                }}
                className="vision-lab__button vision-lab__button--ghost"
              >
                {t("actions.clear") ?? "Effacer"}
              </button>
            </div>
            <ModelPredictionSection
              result={predictionResult}
              isLoading={isPredicting}
              error={predictionError}
              placeholder={predictionLabels.placeholder}
              labels={predictionLabels}
            />
          </section>
        </div>
      </main>
    </>
  );
}
