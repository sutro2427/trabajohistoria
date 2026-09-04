/**
 * Genera el sitio autónomo del juego "Línea de Tiempo · Guerra de Vietnam".
 *
 * Fuente única: public/timeline.html (+ public/timeline-assets/).
 * Salida: dist-timeline/, una carpeta lista para publicar en Netlify sin build.
 *
 *   node scripts/build-timeline-site.mjs
 *   cd dist-timeline && npx netlify deploy --prod
 */
import { mkdir, copyFile, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist-timeline');
// Dominio de destino: define las URLs absolutas de la vista previa al compartir.
//   node scripts/build-timeline-site.mjs https://otro-dominio.netlify.app
const SITE_POR_DEFECTO = 'https://linea-tiempo-vietnam.netlify.app';
const SITE = (process.argv[2] || SITE_POR_DEFECTO).replace(/\/$/, '');

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'timeline-assets'), { recursive: true });

// El juego pasa a ser la portada del sitio, con las etiquetas Open Graph
// apuntando al dominio donde se va a publicar.
const html = (await readFile(join(ROOT, 'public/timeline.html'), 'utf-8'))
  .replaceAll(SITE_POR_DEFECTO, SITE);
await writeFile(join(OUT, 'index.html'), html);

const assetsDir = join(ROOT, 'public/timeline-assets');
for (const file of await readdir(assetsDir)) {
  await copyFile(join(assetsDir, file), join(OUT, 'timeline-assets', file));
}

// Manifiesto: permite "añadir a pantalla de inicio" y abrirlo a pantalla completa.
await writeFile(join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: 'Línea de Tiempo · Guerra de Vietnam',
  short_name: 'Vietnam 54-75',
  description: 'Juego de cartas: doce hechos de la Guerra de Vietnam y tú los pones en orden.',
  start_url: './',
  scope: './',
  display: 'fullscreen',
  orientation: 'landscape',
  background_color: '#0a0c08',
  theme_color: '#0a0c08',
  lang: 'es',
  icons: [
    { src: 'timeline-assets/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'timeline-assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
  ]
}, null, 2));

// Sitio estático puro: sin comando de build y sin dependencias.
await writeFile(join(OUT, 'netlify.toml'), `[build]
  publish = "."

# El HTML puede cambiar entre clases: nunca se cachea.
[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"

# Imágenes de la vista previa e iconos: estables, se cachean un día.
[[headers]]
  for = "/timeline-assets/*"
  [headers.values]
    Cache-Control = "public, max-age=86400"

# Enlaces cortos alternativos para dictar en clase.
[[redirects]]
  from = "/juego"
  to = "/"
  status = 301

[[redirects]]
  from = "/jugar"
  to = "/"
  status = 301
`);

// robots.txt: es material de clase, no necesita indexarse.
await writeFile(join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n');

console.log(`Sitio listo en dist-timeline/ → ${SITE}`);
