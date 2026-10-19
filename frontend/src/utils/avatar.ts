import defaultAvatar from '../assets/images/default-avatar.png'

export function avatarOrDefault(avatar?: string | null) {
  return avatar && avatar.trim() ? avatar : defaultAvatar
}
