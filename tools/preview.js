/* Renders the drafts in content/pages/ with the rest of the site into
   _preview/ (never deployed), then serves it on http://127.0.0.1:8181.
   Images fall back to build/. Drafts render with noindex. */
process.env.BUILD_DRAFTS = '1';
process.env.BUILD_OUT = '_preview';
require('./build.js');
process.env.SERVE_ROOTS = '_preview,build';
require('./serve.js');
