// Site data the 11ty adapter reads (src/_data/site.js -> the `site` global).
//
// The form config stays site-agnostic: it carries no submit URL, so the
// adapter maps the form id to an endpoint here.
module.exports = {
  title: 'Form Engine — Eleventy example',
  demoEndpoint: '/api/demo',
};
