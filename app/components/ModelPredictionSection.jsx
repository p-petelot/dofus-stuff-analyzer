import PropTypes from "prop-types";
import { formatModelHex, getBreedName } from "../../lib/vision/breeds";

function SexLabel({ sex, labels }) {
  if (sex === 0) return <span>{labels.male}</span>;
  if (sex === 1) return <span>{labels.female}</span>;
  return <span>{labels.unknown}</span>;
}

SexLabel.propTypes = {
  sex: PropTypes.number,
  labels: PropTypes.shape({
    male: PropTypes.string.isRequired,
    female: PropTypes.string.isRequired,
    unknown: PropTypes.string.isRequired,
  }).isRequired,
};

export function ModelPredictionSection({
  result,
  isLoading,
  error,
  placeholder,
  labels,
}) {
  return (
    <section className="model-insights" aria-live="polite">
      <header className="model-insights__header">
        <h2>{labels.title}</h2>
        {isLoading ? <span className="badge badge--pulse">{labels.loading}</span> : null}
      </header>
      {error ? (
        <p className="model-insights__error" role="alert">
          {error}
        </p>
      ) : null}
      {!result && !isLoading && !error ? (
        <p className="model-insights__placeholder">{placeholder}</p>
      ) : null}
      {result ? (
        <div className="model-insights__content">
          <div className="model-insights__summary">
            <div className="model-insights__summary-badge">
              <span className="model-insights__summary-label">{labels.topClass}</span>
              <span className="model-insights__summary-value">
                {getBreedName(result.prediction.breed)} · <SexLabel sex={result.prediction.sex} labels={labels.sex} />
              </span>
            </div>
            <div className="model-insights__summary-confidence">
              <span className="model-insights__summary-label">{labels.confidence}</span>
              <span className="model-insights__summary-value">
                {(result.prediction.prob * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="model-insights__colors">
            <h3>{labels.colors}</h3>
            <ul className="model-insights__swatches">
              {result.colors.map((color) => {
                const hex = formatModelHex(color);
                return (
                  <li key={hex}>
                    <span className="model-insights__swatch" style={{ backgroundColor: hex }} aria-hidden="true" />
                    <span className="model-insights__swatch-label">{hex}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="model-insights__top5">
            <h3>{labels.top5}</h3>
            <ol>
              {result.top5.map((entry) => {
                const breedName = getBreedName(entry.breed);
                return (
                  <li key={`${entry.class_idx}-${entry.sex}`}>
                    <span className="model-insights__top5-label">
                      {breedName} · <SexLabel sex={entry.sex} labels={labels.sex} />
                    </span>
                    <span className="model-insights__top5-score">{(entry.prob * 100).toFixed(1)}%</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      ) : null}
    </section>
  );
}

ModelPredictionSection.propTypes = {
  result: PropTypes.shape({
    prediction: PropTypes.shape({
      breed: PropTypes.number.isRequired,
      sex: PropTypes.number.isRequired,
      prob: PropTypes.number.isRequired,
    }).isRequired,
    colors: PropTypes.arrayOf(PropTypes.number).isRequired,
    top5: PropTypes.arrayOf(
      PropTypes.shape({
        class_idx: PropTypes.number.isRequired,
        breed: PropTypes.number.isRequired,
        sex: PropTypes.number.isRequired,
        prob: PropTypes.number.isRequired,
      }),
    ).isRequired,
  }),
  isLoading: PropTypes.bool,
  error: PropTypes.string,
  placeholder: PropTypes.string.isRequired,
  labels: PropTypes.shape({
    title: PropTypes.string.isRequired,
    loading: PropTypes.string.isRequired,
    placeholder: PropTypes.string.isRequired,
    topClass: PropTypes.string.isRequired,
    confidence: PropTypes.string.isRequired,
    colors: PropTypes.string.isRequired,
    top5: PropTypes.string.isRequired,
    sex: PropTypes.shape({
      male: PropTypes.string.isRequired,
      female: PropTypes.string.isRequired,
      unknown: PropTypes.string.isRequired,
    }).isRequired,
  }).isRequired,
};

ModelPredictionSection.defaultProps = {
  result: null,
  isLoading: false,
  error: null,
};
