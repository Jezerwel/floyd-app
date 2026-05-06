/**
 * Client-side unique id for list keys and new entities.
 * (Not a UUID; good enough to avoid same-ms collisions from Date.now().)
 */
export function makeLocalId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
