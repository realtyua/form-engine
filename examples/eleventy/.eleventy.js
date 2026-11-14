// Minimal Eleventy config for the Form Engine example.
//
// The adapter (lib/form-engine.js) bakes every src/_data/<name>.yml form at
// build time and registers the `{% formApp "<name>" %}` shortcode. This file
// only wires it up and copies the engine runtime to /assets/.
const registerForms = require('./lib/form-engine.js');

module.exports = function (eleventyConfig) {
  // src/assets/** -> dist/assets/** (the engine runtime is served from here).
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' });

  // Bakes the forms and registers {% formApp "demo" %}.
  registerForms(eleventyConfig);

  return {
    dir: {
      input: 'src',
      output: 'dist',
      includes: '_includes',
      data: '_data',
    },
  };
};
