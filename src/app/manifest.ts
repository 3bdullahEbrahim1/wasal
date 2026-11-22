import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'وَصَل — منصة المفقودين والموجودين',
    short_name: 'وَصَل',
    description: 'بلّغ عن شخص أو غرض مفقود أو موجود في مصر، والموقع يوصّلك بصاحب الشأن.',
    start_url: '/',
    display: 'standalone',
    dir: 'rtl',
    lang: 'ar',
    background_color: '#fafaf9',
    theme_color: '#0d8758',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
