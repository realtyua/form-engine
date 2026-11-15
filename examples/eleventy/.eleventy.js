// Minimal Eleventy config for the Form Engine example.
//
// The adapter (lib/form-engine.js) bakes every src/_data/<name>.yml form at
// build time and registers the `{% formApp "<name>" %}` shortcode. This file
// only wires it up and copies the engine runtime to /assets/.
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function (eleventyConfig) {
  // src/assets/** -> dist/assets/** (the engine runtime is served from here).
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' });

  // Bakes the forms and registers {% formApp "demo" %}.
  const { default: registerForms } = await import('./lib/form-engine.js');
  await registerForms(eleventyConfig);

  return {
    dir: {
      input: 'src',
      output: 'dist',
      includes: '_includes',
      data: '_data',
    },
  };
}