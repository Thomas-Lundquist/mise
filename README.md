# Mise en Place Planner

A pre-lab planning tool for Culinary students at Skyline High School. Replaces
a paper mise en place sheet: students read the recipe, pull equipment, group
ingredients into bowls, and build a time plan by working backward from
plate-up, then print to PDF for the Canvas assignment.

Full spec: [`mise-planner-build-spec.md`](mise-planner-build-spec.md).

## Status

Static shell in progress — identity strip, sections 01–03 (Read / Pull /
Group), and print stylesheet. Time planner (section 04) not yet built.

## Running locally

No build step. Any static file server works, e.g.:

```
npx serve .
```

or

```
python -m http.server 8000
```

Note: opening `index.html` directly via `file://` will not work — the app
uses ES modules, which require `http://`.

## Deployment

Hosted on GitHub Pages. See the build spec for the fallback plan (Google Apps
Script) if a district content filter blocks `github.io`.
