# export-canva — fonds 3D de la présentation, sans texte

Pour chacune des 7 slides, le fond 3D **seul** (sans texte, sans organigramme, sans compteur de slide) :

- `slide-N.png` : image 1920 × 1080
- `slide-N.mp4` : vidéo 1920 × 1080, 30 images/s, **8 secondes**, H.264, sans son. Elle **boucle sans à-coup** : l'image qui suivrait la dernière est exactement la première.

| N | Fond |
|---|------|
| 1 | Village provençal avec clocher sur sa colline, au bord du lac turquoise |
| 2 | Eau calme vue de dessus (floutée, comme dans la présentation) |
| 3 | Carte en relief du lac et des collines, avec les ronds qui partent du village |
| 4 | Petit bateau électrique qui tangue sur l'eau |
| 5 | Loupe au-dessus de barres en pierre, ocre et turquoise (loupe centrée) |
| 6 | Escalier en pierre en spirale vers une lumière douce (entièrement éclairé) |
| 7 | Coucher de soleil sur le lac, avec les reflets sur l'eau |

## Dans Canva

1. **Importer** (« Uploads ») → glisser les fichiers `.png` et/ou `.mp4`.
2. Cliquer sur le fichier pour l'ajouter à la page, puis **Remplacer par l'arrière-plan** (clic droit sur l'élément, ou « Définir comme arrière-plan »).
3. Ajouter le texte, les logos et le reste directement dans Canva.

Pour une page plus longue que 8 secondes, placer la vidéo plusieurs fois bout à bout : le raccord est invisible.

## Les régénérer

Les fichiers sont produits par le « mode export » de la présentation (`index.html?export`) et le script `tools/export-canva.mjs` :

```bash
node tools/export-canva.mjs               # les 7 slides (images + vidéos)
node tools/export-canva.mjs --slides 4    # une seule slide
node tools/export-canva.mjs --png-only    # seulement les images (quelques secondes)
```

Il faut Node 18+, Playwright (`npm i -g playwright && npx playwright install chromium`) et ffmpeg. Le détail des options est en tête du script.

Pour simplement **voir** un fond en boucle dans le navigateur : ouvrir `index.html?export=3` (remplacer 3 par le numéro de la slide).
