# Anatomy kit (vendored)

From https://github.com/wheresryan22/anatomy, MIT licensed (see LICENSE). Used by `scripts/build-figures.mjs` to draw the 10MA and motor figures.

- `iso-kit.mjs`, `iso.css`: the core (camera, solids, SVG strings, tokens).
- `lathe.mjs`: turned parts on any axis (wheels, lidar, lenses, speaker).
- `tube.mjs`: cables and the braided encoder lead, cut into depth-sorted chunks.
- `audit.mjs`: proves the geometry (`node scripts/build-figures.mjs --audit`).

The files are copied unchanged from the kit's `kit/` folder.
