import {mat4, vec3, vec4} from 'gl-matrix';
import Point from '@mapbox/point-geometry';
import {calculateModelMatrix} from '../../data/model';
import LngLat from '../../../src/geo/lng_lat';
import {latFromMercatorY, lngFromMercatorX, tileToMeter} from '../../../src/geo/mercator_coordinate';
import {pointInFootprint} from '../../source/replacement_source';
import EXTENT from '../../../src/style-spec/data/extent';
import {convertModelMatrixForGlobe, queryGeometryIntersectsProjectedAabb} from '../../util/model_util';
import Feature from '../../../src/util/vectortile_to_geojson';
import ModelBucket from '../../data/bucket/model_bucket';

import type ModelSource from '../../source/model_source';
import type Tiled3dModelBucket from '../../data/bucket/tiled_3d_model_bucket';
import type ModelStyleLayer from './model_style_layer';
import type Transform from '../../../src/geo/transform';
import type SourceCache from '../../../src/source/source_cache';
import type {QueryGeometry, TilespaceQueryGeometry} from '../../../src/style/query_geometry';
import type {QueryResult} from '../../../src/source/query_features';
import type {Feature as ExpressionEvalFeature, FeatureState} from '../../../src/style-spec/expression/index';
import type {EvaluationFeature} from '../../../src/data/evaluation_feature';
import type {ModelNode} from '../../data/model';
import type {VectorTileFeature} from '@mapbox/vector-tile';
import type {CanonicalTileID} from '../../../src/source/tile_id';

export function tileToLngLat(id: CanonicalTileID, position: LngLat, pointX: number, pointY: number) {
    const tileCount = 1 << id.z;
    position.lat = latFromMercatorY((pointY / EXTENT + id.y) / tileCount);
    position.lng = lngFromMercatorX((pointX / EXTENT + id.x) / tileCount);
}

export function queryModelLayerRendered(
    layer: ModelStyleLayer,
    queryGeometry: QueryGeometry,
    sourceCache: SourceCache,
    transform: Transform
): QueryResult {
    const source = sourceCache.getSource<ModelSource>();
    if (!source || source.type !== 'model') return {};
    const modelSource = source;

    const result: QueryResult = {};
    result[layer.id] = [];
    const layerResult = result[layer.id];

    let modelFeatureIndex = 0;
    for (const model of modelSource.models) {
        const modelFeatureState = sourceCache.getFeatureState(layer.sourceLayer, model.id);

        const modelFeatureForEval: ExpressionEvalFeature = {
            type: 'Unknown',
            id: model.id,
            properties: model.featureProperties
        };
        const rotation = layer.paint.get('model-rotation').evaluate(modelFeatureForEval, modelFeatureState);
        const scale = layer.paint.get('model-scale').evaluate(modelFeatureForEval, modelFeatureState);
        const translation = layer.paint.get('model-translation').evaluate(modelFeatureForEval, modelFeatureState);
        const elevationReference = layer.paint.get('model-elevation-reference');
        const shouldFollowTerrainSlope = elevationReference === 'ground';
        const shouldApplyElevation = elevationReference === 'ground';

        let matrix: mat4 = [];
        calculateModelMatrix(matrix,
                                     model,
                                     transform,
                                     model.position,
                                     rotation,
                                     scale,
                                     translation,
                                     shouldApplyElevation,
                                     shouldFollowTerrainSlope,
                                     false);

        if (transform.projection.name === 'globe') {
            matrix = convertModelMatrixForGlobe(matrix, transform);
        }
        const worldViewProjection = mat4.multiply([], transform.projMatrix, matrix);

        const projectedQueryGeometry = queryGeometry.isPointQuery() ? queryGeometry.screenBounds : queryGeometry.screenGeometry;

        const depth = queryGeometryIntersectsProjectedAabb(projectedQueryGeometry, transform, worldViewProjection, model.aabb);
        if (depth != null) {
            const modelFeature: Feature = new Feature(undefined, 0, 0, 0, model.id);
            modelFeature.layer = layer.layer;
            // Use unsafe assignment for now, due to restriction of GeoJSON/Feature properties to number, string and boolean.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            modelFeature.properties = structuredClone(model.featureProperties) as any;
            modelFeature.properties['layer'] = layer.id;
            modelFeature.properties['uri'] = model.uri;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            modelFeature.properties['orientation'] = model.orientation as any;
            modelFeature.sourceLayer = layer.sourceLayer;
            modelFeature.geometry = {
                type: 'Point',
                coordinates: [model.position.lng, model.position.lat]
            };
            modelFeature.state = modelFeatureState;
            modelFeature.source = layer.source;
            layerResult.push({featureIndex: modelFeatureIndex, feature: modelFeature, intersectionZ: depth});
        }

        ++modelFeatureIndex;
    }

    return result;
}

export function queryModelLayerIntersectsFeature(
    layer: ModelStyleLayer,
    queryGeometry: TilespaceQueryGeometry,
    feature: VectorTileFeature,
    featureState: FeatureState,
    transform: Transform,
    scope: string | undefined
): number | boolean {
    if (!layer.modelManager) return false;
    const modelManager = layer.modelManager;
    const bucket = queryGeometry.tile.getBucket(layer);
    if (!bucket || !(bucket instanceof ModelBucket)) return false;

    for (const modelId in bucket.instancesPerModel) {
        const instances = bucket.instancesPerModel[modelId];
        const featureId = feature.id !== undefined ? feature.id :
            (feature.properties && Object.hasOwn(feature.properties, "id")) ? (feature.properties["id"] as string | number) : undefined;
        if (Object.hasOwn(instances.idToFeaturesIndex, featureId)) {
            const modelFeature = instances.features[instances.idToFeaturesIndex[featureId]];
            const model = modelManager.getModel(modelId, scope || layer.scope);
            if (!model) return false;

            let matrix: mat4 = [];
            const position = new LngLat(0, 0);
            const id = bucket.canonical;
            let minDepth = Number.MAX_VALUE;
            for (let i = 0; i < modelFeature.instancedDataCount; ++i) {
                const instanceOffset = modelFeature.instancedDataOffset + i;
                const offset = instanceOffset * 16;

                const va = instances.instancedDataArray.float32;
                const translation: [number, number, number] = [va[offset + 4], va[offset + 5], va[offset + 6]];
                const pointX = Math.floor(va[offset]); // point.x stored in integer part
                const pointY = Math.floor(va[offset + 1]); // point.y stored in integer part

                tileToLngLat(id, position, pointX, pointY);

                calculateModelMatrix(matrix,
                                     model,
                                     transform,
                                     position,
                                     modelFeature.rotation,
                                     modelFeature.scale,
                                     translation,
                                     false,
                                     false,
                                     false);
                if (transform.projection.name === 'globe') {
                    matrix = convertModelMatrixForGlobe(matrix, transform);
                }
                const worldViewProjection = mat4.multiply([], transform.projMatrix, matrix);
                // Collision checks are performed in screen space. Corners are in ndc space.
                const screenQuery = queryGeometry.queryGeometry;
                const projectedQueryGeometry = screenQuery.isPointQuery() ? screenQuery.screenBounds : screenQuery.screenGeometry;
                const depth = queryGeometryIntersectsProjectedAabb(projectedQueryGeometry, transform, worldViewProjection, model.aabb);
                if (depth != null) {
                    minDepth = Math.min(depth, minDepth);
                }
            }
            if (minDepth !== Number.MAX_VALUE) {
                return minDepth;
            }
            return false;
        }
    }
    return false;
}

// How many steps the ray is followed between the top and the base of a node when it
// enters through a wall rather than the top; the hit is placed at the first step inside
// the footprint, so a storey is resolved to about a thirtieth of its height.
const PRISM_WALL_STEPS = 32;

/**
 * Where the ray of a point query enters the prism a node stands in: its footprint
 * raised between the lowest and the highest point of its meshes, as the node is drawn.
 *
 * The bounding box of a mesh is a poor stand-in for a building: the box of an L-shaped
 * block covers its courtyard, and the boxes of a building delivered as one node per
 * storey cover the same screen area, so a query that took the nearest box corner picked
 * the highest storey wherever the boxes overlapped. The footprint is what the tile
 * gives for the outline, so the ray is tested against the footprint between the node's
 * base and top: it enters through the top when its point at that height lies in the
 * footprint, else through a wall where it first lies in the footprint on its way down.
 *
 * @param placement Takes the node's own coordinates (after its global matrix) to tile
 * space: the translation and the scale the layer draws the node with.
 * @param tileMatrix Takes tile space to world space.
 * @returns The depth of the entry point in clip space, or `undefined` for a miss.
 */
function rayEntersNodePrism(node: ModelNode, placement: mat4, tileMatrix: mat4, screenPoint: Point, transform: Transform): number | undefined {
    if (!node.footprint) return;

    // The z range of the node in tile space, where z is metres above the ground.
    let zMin = Number.MAX_VALUE;
    let zMax = -Number.MAX_VALUE;
    const corner: vec3 = [0, 0, 0];
    const visit = (n: ModelNode) => {
        const m = mat4.multiply([], placement, n.globalMatrix);
        for (let i = 0; i < n.meshes.length; ++i) {
            if (i === n.lightMeshIndex) continue;
            const aabb = n.meshes[i].aabb;
            for (let c = 0; c < 8; ++c) {
                corner[0] = c & 1 ? aabb.max[0] : aabb.min[0];
                corner[1] = c & 2 ? aabb.max[1] : aabb.min[1];
                corner[2] = c & 4 ? aabb.max[2] : aabb.min[2];
                vec3.transformMat4(corner, corner, m);
                zMin = Math.min(zMin, corner[2]);
                zMax = Math.max(zMax, corner[2]);
            }
        }
        if (n.children) {
            for (const child of n.children) visit(child);
        }
    };
    visit(node);
    if (zMin === Number.MAX_VALUE || zMax <= zMin) return;

    // The ray of the query in tile space: the screen point unprojected at the near and
    // the far end of the clip volume.
    const worldViewProjection = mat4.multiply([], transform.expandedFarZProjMatrix, tileMatrix);
    const inverse = mat4.invert([], worldViewProjection);
    if (!inverse) return;
    const ndcX = 2 * screenPoint.x / transform.width - 1;
    const ndcY = 1 - 2 * screenPoint.y / transform.height;
    const unproject = (ndcZ: number): vec3 | undefined => {
        const v = vec4.transformMat4([], [ndcX, ndcY, ndcZ, 1], inverse);
        if (v[3] === 0) return;
        return [v[0] / v[3], v[1] / v[3], v[2] / v[3]];
    };
    const near = unproject(-1);
    const far = unproject(1);
    if (!near || !far || far[2] >= near[2]) return;

    const at = (z: number): vec3 => {
        const t = (z - near[2]) / (far[2] - near[2]);
        return [near[0] + t * (far[0] - near[0]), near[1] + t * (far[1] - near[1]), z];
    };
    const inside = (p: vec3) => pointInFootprint(new Point(p[0], p[1]), node.footprint);

    // Through the top, or through a wall on the way down; a ray that starts below the
    // top of the node (the camera inside the building) is followed from where it is.
    let entry: vec3 | undefined;
    const top = at(Math.min(zMax, near[2]));
    if (inside(top)) {
        entry = top;
    } else {
        for (let i = 1; i <= PRISM_WALL_STEPS; ++i) {
            const p = at(top[2] + (zMin - top[2]) * (i / PRISM_WALL_STEPS));
            if (inside(p)) {
                entry = p;
                break;
            }
        }
    }
    if (!entry) return;

    const clip = vec4.transformMat4([], [entry[0], entry[1], entry[2], 1], worldViewProjection);
    return clip[2] / clip[3];
}

/**
 * Where the ray of a point query first meets the triangles of a node, which the loader
 * keeps for picking (`pickPositions`, `pickIndices`); exact where the prism of the
 * footprint is not, which is every building with an annex, a tower or a courtyard.
 *
 * @param placement Takes the node's coordinates after its global matrix to tile space.
 * @param tileMatrix Takes tile space to world space.
 * @returns The depth of the hit in clip space, `undefined` for a miss, and `null` when
 * the node keeps no triangles, so that the caller falls back.
 */
function rayHitsNodeTriangles(node: ModelNode, placement: mat4, tileMatrix: mat4, screenPoint: Point, transform: Transform): number | null | undefined {
    const ndcX = 2 * screenPoint.x / transform.width - 1;
    const ndcY = 1 - 2 * screenPoint.y / transform.height;
    let kept = false;
    let nearest = Number.MAX_VALUE;

    const visit = (n: ModelNode) => {
        // Node local coordinates to clip space, and the ray of the query in node local
        // coordinates: the screen point at the near and the far end of the clip volume.
        const local = mat4.multiply([], placement, n.globalMatrix);
        mat4.multiply(local, tileMatrix, local);
        const clip = mat4.multiply([], transform.expandedFarZProjMatrix, local);
        const inverse = mat4.invert([], clip);
        if (inverse) {
            const unproject = (ndcZ: number): vec3 | undefined => {
                const v = vec4.transformMat4([], [ndcX, ndcY, ndcZ, 1], inverse);
                if (v[3] === 0) return;
                return [v[0] / v[3], v[1] / v[3], v[2] / v[3]];
            };
            const origin = unproject(-1);
            const end = unproject(1);
            if (origin && end) {
                const direction = vec3.subtract([], end, origin);
                for (let i = 0; i < n.meshes.length; ++i) {
                    if (i === n.lightMeshIndex) continue;
                    const mesh = n.meshes[i];
                    if (!mesh.pickPositions || !mesh.pickIndices) continue;
                    kept = true;
                    // The triangles are visited only where the box of the mesh is under the
                    // point at all, which is what keeps a query on a tall building cheap.
                    if (queryGeometryIntersectsProjectedAabb([screenPoint], transform, clip, mesh.aabb) == null) continue;
                    const t = rayTrianglesParameter(origin, direction, mesh.pickPositions, mesh.pickIndices);
                    if (t === undefined) continue;
                    const hit = vec4.transformMat4([], [origin[0] + t * direction[0], origin[1] + t * direction[1], origin[2] + t * direction[2], 1], clip);
                    nearest = Math.min(nearest, hit[2] / hit[3]);
                }
            }
        }
        if (n.children) {
            for (const child of n.children) visit(child);
        }
    };
    visit(node);

    if (!kept) return null;
    return nearest === Number.MAX_VALUE ? undefined : nearest;
}

// The smallest parameter along the ray, between 0 and 1, at which it meets one of the
// triangles, or `undefined` when it meets none; the test is Möller and Trumbore's.
function rayTrianglesParameter(origin: vec3, direction: vec3, positions: Float32Array, indices: Uint16Array | Uint32Array): number | undefined {
    let nearest: number | undefined;
    const e1 = [0, 0, 0];
    const e2 = [0, 0, 0];
    const p = [0, 0, 0];
    const s = [0, 0, 0];
    const q = [0, 0, 0];
    for (let i = 0; i + 2 < indices.length; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        e1[0] = positions[b] - positions[a]; e1[1] = positions[b + 1] - positions[a + 1]; e1[2] = positions[b + 2] - positions[a + 2];
        e2[0] = positions[c] - positions[a]; e2[1] = positions[c + 1] - positions[a + 1]; e2[2] = positions[c + 2] - positions[a + 2];
        p[0] = direction[1] * e2[2] - direction[2] * e2[1];
        p[1] = direction[2] * e2[0] - direction[0] * e2[2];
        p[2] = direction[0] * e2[1] - direction[1] * e2[0];
        const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
        if (det > -1e-12 && det < 1e-12) continue;
        const inv = 1 / det;
        s[0] = origin[0] - positions[a]; s[1] = origin[1] - positions[a + 1]; s[2] = origin[2] - positions[a + 2];
        const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv;
        if (u < 0 || u > 1) continue;
        q[0] = s[1] * e1[2] - s[2] * e1[1];
        q[1] = s[2] * e1[0] - s[0] * e1[2];
        q[2] = s[0] * e1[1] - s[1] * e1[0];
        const v = (direction[0] * q[0] + direction[1] * q[1] + direction[2] * q[2]) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
        if (t < 0 || t > 1) continue;
        if (nearest === undefined || t < nearest) nearest = t;
    }
    return nearest;
}

export function loadMatchingModelFeature(bucket: Tiled3dModelBucket, featureIndex: number, tilespaceGeometry: TilespaceQueryGeometry, transform: Transform): {feature: EvaluationFeature, intersectionZ: number, position: LngLat} | undefined {
    const nodeInfo = bucket.getNodesInfo()[featureIndex];

    if (!nodeInfo || nodeInfo.hiddenByReplacement || !nodeInfo.node.meshes) return;

    let intersectionZ = Number.MAX_VALUE;

    const node = nodeInfo.node;
    const tile = tilespaceGeometry.tile;
    const tileMatrix = transform.calculatePosMatrix(tile.tileID.toUnwrapped(), transform.worldSize);
    const scale = nodeInfo.evaluatedScale;
    let elevation = 0;
    if (transform.elevation && node.elevation) {
        elevation = node.elevation * transform.elevation.exaggeration();
    }
    const anchorX = node.anchor ? node.anchor[0] : 0;
    const anchorY = node.anchor ? node.anchor[1] : 0;

    // The node is tested where it is drawn: with the translation of the layer, which
    // `draw_model` applies the same way, and not only with its scale.
    const tileUnitsPerMeter = 1.0 / tileToMeter(tile.tileID.canonical);
    const translation = nodeInfo.evaluatedTranslation;
    const tileTranslation: vec3 = [
        anchorX * (scale[0] - 1) + translation[0] * tileUnitsPerMeter,
        anchorY * (scale[1] - 1) + translation[1] * tileUnitsPerMeter,
        elevation + translation[2]];
    const placement = mat4.translate([], mat4.identity([]), tileTranslation);
    mat4.scale(placement, placement, scale);
    const modelMatrix = mat4.multiply([], tileMatrix, placement);

    const screenQuery = tilespaceGeometry.queryGeometry;

    // A point query is answered by the triangles of the node where the loader kept them,
    // else by the prism the node stands in when it has a footprint; the bounding boxes
    // below stay for area queries and for nodes with neither.
    if (screenQuery.isPointQuery()) {
        const screenPoint = screenQuery.screenBounds[0];
        const exact = rayHitsNodeTriangles(node, placement, tileMatrix, screenPoint, transform);
        if (exact !== null) {
            if (exact === undefined) return;
            intersectionZ = exact;
        } else {
            const depth = rayEntersNodePrism(node, placement, tileMatrix, screenPoint, transform);
            if (depth !== undefined) {
                intersectionZ = depth;
            } else if (node.footprint) {
                return;
            }
        }
    }

    // Collision checks are performed in screen space. Corners are in ndc space.
    const projectedQueryGeometry = screenQuery.isPointQuery() ? screenQuery.screenBounds : screenQuery.screenGeometry;

    const checkNode = function (n: ModelNode) {
        const worldViewProjectionForNode = mat4.multiply([], modelMatrix, n.globalMatrix);
        mat4.multiply(worldViewProjectionForNode, transform.expandedFarZProjMatrix, worldViewProjectionForNode);
        for (let i = 0; i < n.meshes.length; ++i) {
            const mesh = n.meshes[i];
            if (i === n.lightMeshIndex) {
                continue;
            }
            const depth = queryGeometryIntersectsProjectedAabb(projectedQueryGeometry, transform, worldViewProjectionForNode, mesh.aabb);
            if (depth != null) {
                intersectionZ = Math.min(depth, intersectionZ);
            }
        }
        if (n.children) {
            for (const child of n.children) {
                checkNode(child);
            }
        }
    };

    if (intersectionZ === Number.MAX_VALUE) checkNode(node);
    if (intersectionZ === Number.MAX_VALUE) return;

    const position = new LngLat(0, 0);
    tileToLngLat(tile.tileID.canonical, position, nodeInfo.node.anchor[0], nodeInfo.node.anchor[1]);

    return {intersectionZ, position, feature: nodeInfo.feature};
}
