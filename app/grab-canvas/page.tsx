import GrabCanvasTool from './GrabCanvasTool';

export default function GrabCanvasPage() {
  return (
    <main>
      <h1>Extraction de canvas Barbofus</h1>
      <p>
        Saisissez l&rsquo;URL Barbofus pour récupérer le rendu du plus grand
        canvas généré côté serveur.
      </p>
      <GrabCanvasTool />
    </main>
  );
}
