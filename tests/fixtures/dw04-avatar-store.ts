/** Controlled executable public-interface fixture for the DW-04 test-first journey. */
export interface AvatarStore {
  read(): string
  clear(): void
  write(value: string): void
}

/** Initial fixture deliberately loses the prior value if persistence fails after clear(). */
export function saveFilteredAvatar(store: AvatarStore, filtered: string): string {
  store.clear()
  store.write(filtered)
  return store.read()
}
