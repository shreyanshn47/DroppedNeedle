<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { Download, ListMusic } from 'lucide-svelte';
	import { requestMissingTracks, type PlaylistTrack } from '$lib/api/playlists';
	import {
		createRequestTrackBatchMutation,
		type TrackBatchItem
	} from '$lib/features/downloads/queries/DownloadMutations.svelte';
	import { toastStore } from '$lib/stores/toast';
	import Button from '$lib/ui/Button.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';

	let { tracks }: { tracks: PlaylistTrack[] } = $props();

	// The server takes at most this many songs per batch.
	const SONG_BATCH_LIMIT = 500;

	// Songs with no library copy and no other source to play from.
	let missingSongs = $derived(
		tracks.filter(
			(t) => !t.library_file_id && (!t.available_sources || t.available_sources.length === 0)
		)
	);
	let missingAlbumCount = $derived(
		new SvelteSet(missingSongs.flatMap((t) => (t.album_id ? [t.album_id] : []))).size
	);
	// A song is asked for by its MusicBrainz recording; one with none can't be.
	let matchedSongs = $derived(
		missingSongs.flatMap((t): TrackBatchItem[] =>
			t.recording_mbid
				? [
						{
							recording_mbid: t.recording_mbid,
							artist_name: t.artist_name,
							track_title: t.track_name,
							album_title: t.album_name || null,
							duration_seconds: t.duration ? Math.round(t.duration) : null
						}
					]
				: []
		)
	);
	let requestableSongs = $derived(matchedSongs.slice(0, SONG_BATCH_LIMIT));
	let unmatchedCount = $derived(missingSongs.length - matchedSongs.length);

	let requestingAlbums = $state(false);
	let songsOpen = $state(false);
	const songBatch = createRequestTrackBatchMutation();

	async function requestAlbums() {
		if (requestingAlbums) return;
		requestingAlbums = true;
		try {
			const result = await requestMissingTracks(tracks);
			toastStore.show({ message: result.message, type: 'success' });
		} catch {
			toastStore.show({ message: "Couldn't submit requests", type: 'error' });
		} finally {
			requestingAlbums = false;
		}
	}

	async function requestSongs() {
		await songBatch.mutateAsync(requestableSongs);
		songsOpen = false;
	}

	let songsMessage = $derived.by(() => {
		const parts: string[] = [];
		if (requestableSongs.length > 0) {
			parts.push('Each song is requested on its own and fetched without the rest of its album.');
		}
		if (matchedSongs.length > requestableSongs.length) {
			parts.push(`Only the first ${SONG_BATCH_LIMIT} are requested this time.`);
		}
		if (unmatchedCount === 1) {
			parts.push(
				"1 song isn't matched to a MusicBrainz recording yet, so it is left out. Importing a Spotify playlist again matches the songs it can."
			);
		} else if (unmatchedCount > 1) {
			parts.push(
				`${unmatchedCount} songs aren't matched to a MusicBrainz recording yet, so they are left out. Importing a Spotify playlist again matches the songs it can.`
			);
		}
		return parts.join(' ');
	});
</script>

{#if missingSongs.length > 0}
	<div
		class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-box border border-warning/60 bg-warning/8 px-4 py-3"
	>
		<Download class="size-5 shrink-0 text-warning" aria-hidden="true" />
		<p class="min-w-0 flex-1 basis-48 text-sm font-medium">
			{missingSongs.length}
			{missingSongs.length === 1 ? 'song' : 'songs'} not in your library
		</p>
		{#if missingAlbumCount > 0}
			<Button
				variant="outline"
				size="display-sm"
				icon={Download}
				loading={requestingAlbums}
				onclick={() => void requestAlbums()}
			>
				Request {missingAlbumCount === 1 ? 'album' : missingAlbumCount + ' albums'}
			</Button>
		{/if}
		<Button variant="outline" size="display-sm" icon={ListMusic} onclick={() => (songsOpen = true)}>
			Request {missingSongs.length === 1 ? 'song' : 'songs'}
		</Button>
	</div>
	<ConfirmDialog
		bind:open={songsOpen}
		title="Request songs"
		icon={ListMusic}
		confirmLabel={requestableSongs.length === 1
			? 'Request 1 song'
			: `Request ${requestableSongs.length} songs`}
		paper
		pending={songBatch.isPending}
		canConfirm={requestableSongs.length > 0}
		message={songsMessage}
		onconfirm={requestSongs}
	/>
{/if}
