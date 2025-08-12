import { get, writable, type Writable } from 'svelte/store';

const location: Writable<string> = writable('terminal');

export default location;