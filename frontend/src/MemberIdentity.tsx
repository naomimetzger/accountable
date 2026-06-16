import type { Address } from 'viem'
import { MemberAvatar } from './MemberAvatar'
import type { ResolvedMemberProfile } from './profile'

type MemberIdentityProps = {
  address: Address
  profile: ResolvedMemberProfile
  nameClassName?: string
  addressClassName?: string
  layout?: 'stack' | 'row'
}

export function MemberIdentity({
  address,
  profile,
  nameClassName = '',
  addressClassName = '',
  layout = 'stack',
}: MemberIdentityProps) {
  return (
    <div className={'member-identity ' + layout}>
      <MemberAvatar address={address} avatar={profile.avatar} size="md" />
      <div className="member-identity-copy">
        <div className={'member-identity-name ' + nameClassName}>{profile.displayName}</div>
        <div className={'member-identity-addr ' + addressClassName}>{profile.addressLabel}</div>
      </div>
    </div>
  )
}
