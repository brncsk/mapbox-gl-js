// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {describe, test, expect, waitFor, createMap} from '../../../util/vitest';
import {createStyle} from './util';

describe('Map#refreshTiles', () => {
    test('throws for a source that the style does not hold', async () => {
        const map = createMap();
        await waitFor(map, 'style.load');

        expect(() => map.refreshTiles('nowhere')).toThrowError('There is no source with the ID "nowhere" to refresh.');
    });

    test('returns the map for a source of the style, with or without tile ids', async () => {
        const map = createMap({
            style: createStyle({
                sources: {rooms: {type: 'vector', tiles: ['http://example.com/{z}/{x}/{y}.pbf']}}
            })
        });
        await waitFor(map, 'style.load');

        expect(map.refreshTiles('rooms')).toBe(map);
        expect(map.refreshTiles('rooms', [{x: 0, y: 0, z: 0}])).toBe(map);
    });
});
