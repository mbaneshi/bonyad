import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

// Served from https://mbaneshi.github.io/bonyad/ — `base` must match the repo name.
// Hand-written Markdown/MDX links therefore start with /bonyad/.
export default defineConfig({
  site: 'https://mbaneshi.github.io',
  base: '/bonyad',
  integrations: [
    starlight({
      title: { en: 'Bonyad', fa: 'بنیاد' },
      description:
        'An open-source lab for a shared computational foundation under engineering software.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        fa: { label: 'فارسی', lang: 'fa', dir: 'rtl' },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/mbaneshi/bonyad' },
      ],
      customCss: ['@fontsource-variable/vazirmatn', './src/styles/custom.css'],
      plugins: [starlightLinksValidator()],
      sidebar: [
        {
          label: 'Principles',
          translations: { fa: 'اصول' },
          items: [{ slug: 'manifesto' }],
        },
        {
          label: 'Specifications (draft)',
          translations: { fa: 'مشخصات (پیش‌نویس)' },
          items: [{ slug: 'specs/first-slice-design' }],
        },
        {
          label: 'Decisions',
          translations: { fa: 'تصمیم‌ها' },
          items: [
            { slug: 'decisions/0001-first-slice-decisions' },
            { slug: 'decisions/0002-reduced-first-slice' },
          ],
        },
        {
          label: 'Project',
          translations: { fa: 'پروژه' },
          items: [{ slug: 'contributing' }, { slug: 'roadmap' }],
        },
      ],
    }),
  ],
});
