import { useState } from 'react'
import type { Address } from 'viem'
import { ProfilePicker } from './ProfilePicker'
import { MemberAvatar } from './MemberAvatar'
import {
  DEFAULT_PROFILE_AVATAR,
  type ProfileAvatar,
  type UserProfile,
  saveUserProfile,
  shortAddr,
} from './profile'

type ProfileEditorProps = {
  address: Address
  profile: UserProfile | null
  onSave: (profile: UserProfile) => void
  onClose: () => void
}

export function ProfileEditor({ address, profile, onSave, onClose }: ProfileEditorProps) {
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [avatar, setAvatar] = useState<ProfileAvatar>(profile?.avatar ?? DEFAULT_PROFILE_AVATAR)

  const handleSave = () => {
    const nextProfile: UserProfile = {
      displayName: displayName.trim(),
      avatar,
      updatedAt: new Date().toISOString(),
    }
    saveUserProfile(address, nextProfile)
    onSave(nextProfile)
    onClose()
  }

  return (
    <div className="profile-editor-shell" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
      <div className="profile-editor-card">
        <div className="profile-editor-topline">
          <div>
            <p className="onboarding-progress">Profile</p>
            <h1 id="profile-editor-title" className="screen-title">Edit profile</h1>
          </div>
          <button className="nav-link-btn" type="button" onClick={onClose}>Close</button>
        </div>
        <p className="screen-sub">Stored on this device. Friends see your name and avatar in group lists.</p>
        <p className="profile-wallet-hint">{shortAddr(address)}</p>
        <ProfilePicker
          address={address}
          displayName={displayName}
          avatar={avatar}
          onDisplayNameChange={setDisplayName}
          onAvatarChange={setAvatar}
          inputId="profile-display-name"
        />
        <div className="onboarding-actions">
          <button className="btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-primary" type="button" onClick={handleSave}>Save profile</button>
        </div>
        <div className="profile-editor-preview-row">
          <MemberAvatar address={address} avatar={avatar} size="sm" />
          <span>{displayName.trim() || shortAddr(address)}</span>
        </div>
      </div>
    </div>
  )
}
