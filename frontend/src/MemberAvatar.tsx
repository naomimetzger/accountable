import type { Address } from 'viem'
import { GUEST_AVATAR_SEED } from './onboarding'
import {
  generatedAvatarCells,
  generatedAvatarPalette,
  type ProfileAvatar,
} from './profile'

type MemberAvatarProps = {
  address?: Address
  avatar?: ProfileAvatar
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function MemberAvatar({
  address,
  avatar,
  size = 'md',
  className = '',
}: MemberAvatarProps) {
  const fallbackSeed = address ?? GUEST_AVATAR_SEED
  const resolved = avatar ?? { kind: 'generated', seed: fallbackSeed } as const

  if (resolved.kind === 'emoji') {
    return (
      <span className={'member-avatar emoji ' + size + ' ' + className} aria-hidden="true">
        {resolved.value}
      </span>
    )
  }

  if (resolved.kind === 'image') {
    return (
      <img
        className={'member-avatar image ' + size + ' ' + className}
        src={resolved.value}
        alt=""
        aria-hidden="true"
      />
    )
  }

  const palette = generatedAvatarPalette(resolved.seed)
  const cells = generatedAvatarCells(resolved.seed)

  return (
    <span className={'member-avatar generated ' + size + ' ' + className} aria-hidden="true">
      <svg viewBox="0 0 36 36" role="presentation">
        {cells.map((filled, index) => {
          if (!filled) return null
          const row = Math.floor(index / 3)
          const col = index % 3
          return (
            <rect
              key={index}
              x={col * 12}
              y={row * 12}
              width="12"
              height="12"
              fill={palette[(row + col) % palette.length]}
            />
          )
        })}
      </svg>
    </span>
  )
}
