/** Two-character placeholder for an address with no usable avatar. Copied from apps/interface. */
export const getAvatarFallback = (address: string) => {
  if (!address || address.length < 4) return '??'
  return address.slice(2, 4).toUpperCase()
}
