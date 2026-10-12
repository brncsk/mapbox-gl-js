# Diorama's changes to mapbox-gl-js

Each change is **upstreamable** (a general fix or feature that any mapbox-gl user could use, and that stands on its own) or **not upstreamable** (the line says why).

This file lists the commits that the `main` branch of Diorama's fork adds to upstream mapbox-gl-js, under the build that first carried them, newest build first. Diorama's apps install a build as `mapbox-gl-3.30.0-diorama.<n>.tgz`: the package version inside the tarball stays `3.30.0`, and the suffix tells the builds apart. Upstream's own changes are in [CHANGELOG.md](CHANGELOG.md).

## diorama.14

Upstream v3.30.0. The first build from `main`, which holds every commit of the earlier `diorama` branch and the branch merged below.

- **Upstreamable.** `Map#refreshTiles(sourceId, tileIds?)` fetches the tiles of a source anew and draws each tile until its new data arrives, so a map shows a change of the data behind its tile URLs without a blank frame; the `reload`, `setTiles` and `setUrl` methods of a source clear its tiles first (`f9c707386`). It answers mapbox/mapbox-gl-js#2633 and #5879, and MapLibre has a method of the same shape.
- **Upstreamable.** `cameraForBounds`, and so `fitBounds`, takes `minAltitude` and `maxAltitude`, the altitude range of the bounds to fit; without them, the terrain's elevations at the corners count, as upstream (`2f2ec955e`, `00e424c40`, fixed in `974b07333`, since as merged the box had no height, a call without options threw, and the caller's options were written to).
- **Upstreamable.** `formatted` is a type of a config option, beside upstream's `object`, and a config value that a `format` expression made keeps its sections when it is coerced to `formatted` (`fcf373fe2`).
- **Upstreamable.** A compound expression keeps the overload that it was parsed with across a thread transfer, because the index of the overload counts every overload, also the ones passed over for their param count (`6d9337613`). In the value of a config option, `["all", a]`, `["-", a]`, `["get", key, object]` and some others came out of a transfer with the wrong overload. `16d459a80` on the merged branch is the same fix from April 2025, and resolves to this one.
- **Upstreamable, together with `15bfa03f1`, which it completes.** The `anchor` extra on the landmark nodes of Mapbox's tiles, which the loader computes from the meshes itself, stays out of the properties of the node's feature (`293c524bf`). From diorama.4 to diorama.13 it showed in the query result of every landmark.
- **Upstreamable, together with `a832b0e91` and `ec3727478`.** Four of upstream's landmark query tests expect what a point query answers when it meets a node's triangles, at the depth where the ray enters them (`6ba98c5a6`). Two no longer list the Ferry Building at a pixel where none of its triangles is drawn, and two list building 35, a fill-extrusion that the Rincon Center landmark conflates, before the landmark.
- **Not upstreamable: upstream has them.** The six commits of the config PR, `2eb2f66f1` to `a1f8ba056` (feature-dependent `config` expressions, `typeEquals`, the FQID refactor), which upstream took as #13453 (`ff7842c94`). They merge as no change.
- **Not upstreamable: formatting only.** `5338555b4` reformats `is_constant.ts` and changes no logic. The merge keeps upstream's later version of the file.

Merged branch: `more-expression-fixes`, expression, config and camera work from April 2025 on upstream `87938fb28`, merged in `10e3d42fe`. Its first six commits are the branch `fix-feature-dependent-config`, which was the config PR (#13453), so that branch came with it.

## diorama.13

Upstream v3.30.0.

- **Upstreamable, together with `bd3bf8325`, which it completes.** The first evaluation of a batched-model bucket, on the worker, visits every node, so a tile arrives with a feature array per mesh, as upstream; and the upload pass creates the paint buffer of a mesh that holds an array and has none. Without it, a tile whose nodes all kept their state evaluated no node, and the buildings stood grey for good (`d04bed672`).

## diorama.12

Upstream v3.30.0.

- **Upstreamable.** A batched-model node is drawn at the `model-opacity` evaluated for it, with its feature state, so a style can fade one building of a tile. At zero the node is not drawn in any pass, the shadow pass included, and translucent nodes sort back to front (`bfa9a430c`).
- **Upstreamable, together with `ec3727478`.** A point query passes over a batched-model node that the last draw left out (faded out by its opacity, or cut off in front of the camera), so the ray reaches the building behind it (`8beb69e22`).

## diorama.11

Upstream v3.30.0.

- **Upstreamable, together with `bd3bf8325`, which it completes.** The feature array of a batched-model node is uploaded only while the node holds one. An upload pass handed the GPU an array destroyed after the previous upload, and `bufferSubData` threw (`72350479a`).

## diorama.10

Upstream v3.30.0.

- **Upstreamable, unsure.** A point query on a batched-model node is answered by the triangles of its meshes, which the loader keeps for picking in a tile without a BVH (`ec3727478`). Upstream may not want the cost of a triangle test per node on every query.

## diorama.9

Upstream v3.30.0.

- **Upstreamable.** A feature state write keeps the state of the batched-model nodes that it does not name. Upstream took every node absent from a write as having no state, so a write to one building dropped the state of every other node of the tile (`bd3bf8325`).

## diorama.8

Upstream v3.30.0.

- **Not upstreamable: it depends on Diorama's tiler.** `plate`, part 7 of a batched model, is the face that Diorama's tiler adds across a cut when it delivers a building as one node per storey; the Mapbox format has no such part (`3d1714f23`).

## diorama.7

Upstream v3.30.0.

- **Upstreamable.** A batched-model node keeps its feature state through a zoom change and a change of the light or the projection. Upstream evaluated the translation and the scale with no state on every zoom change (`57de2b4d3`).

## diorama.6

Upstream v3.30.0.

- **Upstreamable, unsure: `ec3727478` replaced most of it.** A point query on a batched-model tile tests the prism that a node stands in, translation included, and reports the depth where the ray enters it. Upstream tests the projected bounding box without the translation (`a832b0e91`).

## diorama.5

Upstream v3.30.0.

- **Upstreamable.** A featureset query keeps the properties of a feature of a `model` layer. Upstream rebuilt each hit from its vector tile feature, which a model feature does not have (`fa2c23a83`).

## diorama.4

Upstream v3.30.0.

- **Upstreamable, unsure: upstream may keep only `height` and `part` on purpose.** The glTF extras of a batched-model node that the loader does not read become the properties of the node's feature, so a tiler can tag a node for expressions, filters and `queryRenderedFeatures` (`15bfa03f1`). Through diorama.13 it also made the `anchor` extra of Mapbox's own tiles a property; diorama.14 keeps that out (`293c524bf`).

## diorama.3

Upstream v3.30.0.

- **Upstreamable.** An import that loads after its own error settled the wait is merged all the same. Upstream merges at the first error or the load, so a failed sprite request while the Standard import was in flight left the basemap out for good (`8f1184ac8`).

## diorama.2

Upstream v3.30.0.

- **Upstreamable, unsure: upstream may want an explicit option rather than the `.pbf` suffix.** A sprite URL that ends in `.pbf` loads a self-hosted vector iconset. Upstream loads vector icons for Mapbox-hosted styles only (`393719fc2`).

## diorama.1

Upstream v3.30.0.

- **Upstreamable.** The collision circles of a line label are placed at the height that the label is drawn at, so a label on a raised floor reserves the space where it stands (`c3642924d`).

## Not on main

`feat/raster-blend-mode`: 16 commits from April 2026, on upstream `6509837c0` (before v3.23.0). They add the `raster-blend-mode` and `fill-blend-mode` paint properties (multiply, screen, darken, lighten, overlay, hard-light and soft-light), drawn through a framebuffer, with a debug page. The branch stays on its own and no build carried it.

## Test notes

Four of upstream's own tests fail on some test machines, with upstream v3.30.0 as well, and the fork leaves them as they are. The expression test `number-format/default` and the unit test `ScaleControl should change unit of distance after calling setUnit` expect English number and unit formatting, so they fail in a browser with another locale. The two GeolocateControl tests of the device orientation listener time out in the Chromium that the unit tests start on macOS.

## Count

19 upstreamable, 4 of them marked unsure; 3 not upstreamable.
