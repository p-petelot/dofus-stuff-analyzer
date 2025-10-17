'use client';

import { FormEvent, useEffect, useState } from 'react';
import styles from './styles.module.css';

export default function GrabCanvasTool() {
  const [inputUrl, setInputUrl] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!inputUrl.trim()) {
      setError('Veuillez indiquer une URL.');
      return;
    }

    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      setImageUrl(null);
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch(
        `/api/grab-canvas?url=${encodeURIComponent(inputUrl.trim())}`
      );

      if (response.ok && response.headers.get('Content-Type')?.includes('image/png')) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      } else {
        let message = 'Une erreur est survenue.';
        try {
          const data = await response.json();
          if (data?.error) {
            message = data.error;
          }
        } catch (jsonError) {
          console.error('Failed to parse error response', jsonError);
        }
        setError(message);
      }
    } catch (fetchError) {
      console.error('Request failed', fetchError);
      setError('Impossible de joindre le service.');
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!imageUrl) {
      return;
    }
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'canvas.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <section className={styles.wrapper}>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}
      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          type="url"
          name="url"
          required
          value={inputUrl}
          onChange={(event) => {
            if (error) {
              setError(null);
            }
            setInputUrl(event.target.value);
          }}
          placeholder="https://barbofus.com/..."
          className={styles.input}
        />
        <button type="submit" className={styles.button} disabled={loading}>
          Récupérer
        </button>
      </form>
      <div className={styles.controls}>
        <button
          type="button"
          onClick={handleDownload}
          className={styles.button}
          disabled={!imageUrl}
        >
          Télécharger
        </button>
      </div>
      <div
        className={styles.loaderOverlay}
        data-loading={loading}
        aria-busy={loading}
        aria-live="polite"
      >
        {imageUrl && !loading ? (
          <img src={imageUrl} alt="Canvas Barbofus" className={styles.previewImage} />
        ) : null}
      </div>
    </section>
  );
}
