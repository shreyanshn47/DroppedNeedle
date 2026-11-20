import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import type { PlaylistTrack } from '$lib/api/playlists';
import { fakeApi } from '$lib/test/api';
import { renderWithQuery } from '$lib/test/render';

import MissingSongsBanner from './MissingSongsBanner.svelte';

const RECORDING_A = 'b6df9d04-2303-4ec7-a416-367b06a026cb';
const RECORDING_B = 'c1a2b3d4-2303-4ec7-a416-367b06a026cb';
const GROUP = '7f6b0669-a989-4fd5-94cf-2ee639ad4329';

function entry(id: string, fields: Partial<PlaylistTrack>): PlaylistTrack {
	return {
		id,
		position: 0,
		track_name: `Song ${id}`,
		artist_name: 'Artist',
		album_name: 'Album',
		album_id: GROUP,
		artist_id: null,
		available_sources: null,
		cover_url: null,
		created_at: '2026-11-19T00:00:00Z',
		disc_number: 1,
		duration: 183.4,
		format: null,
		library_file_id: null,
		plex_rating_key: null,
		recording_mbid: null,
		source_type: '',
		track_number: 1,
		track_source_id: null,
		...fields
	};
}

// A Spotify playlist: one song in the library, two missing songs matched to
// a recording, and one missing song MusicBrainz could not match.
const tracks = [
	entry('owned', { library_file_id: 'lt-1', available_sources: ['local'] }),
	entry('a', { recording_mbid: RECORDING_A }),
	entry('b', { recording_mbid: RECORDING_B, album_name: '' }),
	entry('unmatched', { album_id: null })
];

describe('MissingSongsBanner', () => {
	it('requests each matched missing song once, and says which are left out', async () => {
		const api = fakeApi({
			'POST /api/v3/requests/tracks/batches': {
				success: true,
				message: 'Songs requested: 2 started',
				requested: 2,
				skipped: 0,
				overflow: 0,
				status: 'pending'
			}
		});
		await renderWithQuery(MissingSongsBanner, { tracks });

		await expect.element(page.getByText('3 songs not in your library')).toBeVisible();
		await page.getByRole('button', { name: 'Request songs' }).click();
		const dialog = page.getByRole('dialog');
		await expect
			.element(dialog.getByText(/1 song isn't matched to a MusicBrainz recording yet/))
			.toBeVisible();
		await dialog.getByRole('button', { name: 'Request 2 songs' }).click();

		await expect.poll(() => api.calls('POST /api/v3/requests/tracks/batches').length).toBe(1);
		expect(api.calls('POST /api/v3/requests/tracks/batches')[0].body).toEqual({
			items: [
				{
					recording_mbid: RECORDING_A,
					artist_name: 'Artist',
					track_title: 'Song a',
					album_title: 'Album',
					duration_seconds: 183
				},
				{
					recording_mbid: RECORDING_B,
					artist_name: 'Artist',
					track_title: 'Song b',
					album_title: null,
					duration_seconds: 183
				}
			]
		});
	});

	it('offers nothing to confirm when no missing song has a recording', async () => {
		fakeApi({});
		await renderWithQuery(MissingSongsBanner, { tracks: [tracks[0], tracks[3]] });

		await page.getByRole('button', { name: 'Request song' }).click();
		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByText(/so it is left out/)).toBeVisible();
		await expect.element(dialog.getByRole('button', { name: /^Request/ })).not.toBeInTheDocument();
	});

	it('shows nothing when every song is in the library', async () => {
		fakeApi({});
		await renderWithQuery(MissingSongsBanner, { tracks: [tracks[0]] });

		await expect.element(page.getByRole('button', { name: /Request/ })).not.toBeInTheDocument();
	});
});
