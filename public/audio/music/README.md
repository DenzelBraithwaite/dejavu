# Music assets

Place background music files here, preferably as `.mp3` or `.ogg` files.

Reference a track from a story scene with a public path such as:

```js
music: '/audio/music/vespas-night.mp3'
```

Use `music: null` on a later scene to stop the current track. Omitting the
property keeps the currently playing music.
