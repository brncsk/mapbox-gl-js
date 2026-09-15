// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {describe, test, expect} from '../../util/vitest';
import convertModel from '../../../3d-style/source/model_loader';
import {Tiled3dModelFeature} from '../../../3d-style/data/bucket/tiled_3d_model_bucket';

import type {GLTF} from '../../../3d-style/util/loaders';

// A document with no meshes: the nodes are read for their extras alone.
function gltfWithNodes(nodes: Array<{name: string, extras: Record<string, unknown>}>): GLTF {
    return {
        json: {
            scenes: [{name: 'Default Scene', nodes: nodes.map((_, i) => i)}],
            scene: 0,
            nodes
        },
        images: []
    };
}

describe('convertModel node extras', () => {
    test('keeps the extras the loader does not read as the properties of the node', () => {
        const [node] = convertModel(gltfWithNodes([{
            name: 'floor',
            extras: {
                id: '24',
                floor: 2,
                wing: 'north',
                open: true,
                'MAPBOX_zoom_min': 14
            }
        }]));

        expect(node.id).toEqual('24');
        expect(node.minZoom).toEqual(14);
        expect(node.properties).toEqual({floor: 2, wing: 'north', open: true});
    });

    test('leaves the properties undefined for a node whose extras are all reserved', () => {
        const [node] = convertModel(gltfWithNodes([
            {name: 'building', extras: {id: '24', 'MAPBOX_zoom_min': 14, 'MAPBOX_zoom_max': 18}}
        ]));

        expect(node.properties).toBeUndefined();
    });

    test('gives the properties to the feature of the node, under its computed height', () => {
        const [node] = convertModel(gltfWithNodes([{
            name: 'floor',
            extras: {id: '24', floor: 2, height: 'not the height'}
        }]));

        const feature = new Tiled3dModelFeature(node).feature;

        expect(feature.id).toEqual('24');
        expect(feature.properties).toEqual({floor: 2, height: 0});
    });
});
