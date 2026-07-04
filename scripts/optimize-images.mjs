import sharp from 'sharp';

const photographs = [
  {
    source: 'dark-hedges.jpg.jpg',
    output: 'dark-hedges-750',
  },
  {
    source: 'carrick-a-rede-turquoise.jpg',
    output: 'carrick-a-rede-turquoise-750',
  },
];

for (const photograph of photographs) {
  const image = sharp(photograph.source).rotate();
  await Promise.all([
    image.clone().webp({ quality: 70, effort: 6 }).toFile(`${photograph.output}.webp`),
    image.clone().avif({ quality: 42, effort: 6 }).toFile(`${photograph.output}.avif`),
  ]);
}
