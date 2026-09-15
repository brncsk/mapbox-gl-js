import {describe, test, expect} from '../../util/vitest';
import Feature, {TargetFeature} from '../../../src/util/vectortile_to_geojson';

import type {VectorTileFeature} from '@mapbox/vector-tile';

describe('TargetFeature', () => {
    const target = {featuresetId: 'landmarks', importId: 'basemap'};

    test('keeps the properties of a feature that has no vector tile feature behind it', () => {
        // A feature of a model layer is built without a vector tile feature, the way the
        // feature index builds one for a node of a batched-model tile.
        const feature = new Feature({} as unknown as VectorTileFeature, 14, 9059, 5729, '23');
        feature.properties = {floor: '1', floorId: 954, storey: 1};

        const variant = new TargetFeature(feature, {target});

        expect(variant.properties).toEqual({floor: '1', floorId: 954, storey: 1});
        expect(variant.id).toBe('23');
    });

    test('takes the properties of the variant when the selector declares them', () => {
        const feature = new Feature({} as unknown as VectorTileFeature, 14, 9059, 5729, '23');
        feature.properties = {floor: '1'};

        const variant = new TargetFeature(feature, {target, properties: {name: 'x'}});

        expect(variant.properties).toEqual({name: 'x'});
    });
});
