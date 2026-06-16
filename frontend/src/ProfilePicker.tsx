import { useRef, useState, type ChangeEvent } from 'react'
import type { Address } from 'viem'
import { MemberAvatar } from './MemberAvatar'
import { GUEST_AVATAR_SEED } from './onboarding'
import {
  AVATAR_OPTIONS,
  GENERATED_AVATAR_VARIANTS,
  PROFILE_IMAGE_MAX_BYTES,
  type ProfileAvatar,
  avatarsMatch,
  generatedAvatarSeed,
} from './profile'

type ProfilePickerProps = {
  address?: Address
  displayName: string
  avatar: ProfileAvatar
  onDisplayNameChange: (value: string) => void
  onAvatarChange: (avatar: ProfileAvatar) => void
  inputId?: string
}

export function ProfilePicker({
  address,
  displayName,
  avatar,
  onDisplayNameChange,
  onAvatarChange,
  inputId = 'display-name',
}: ProfilePickerProps) {
  const avatarSeed = address ?? GUEST_AVATAR_SEED
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setUploadError('Choose an image file.')
      return
    }

    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      setUploadError('Image must be under 350 KB.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadError(null)
        onAvatarChange({ kind: 'image', value: reader.result })
      }
    }
    reader.onerror = () => setUploadError('Could not read that image.')
    reader.readAsDataURL(file)
  }

  return (
    <div className="profile-picker">
      <div className="profile-preview">
        <MemberAvatar address={address} avatar={avatar} size="lg" />
        <div>
          <p className="profile-preview-label">Preview</p>
          <p className="profile-preview-name">{displayName.trim() || 'No name yet'}</p>
        </div>
      </div>

      <div className="field">
        <label htmlFor={inputId}>Display name</label>
        <input
          id={inputId}
          type="text"
          placeholder="e.g. Naomi"
          value={displayName}
          onChange={event => onDisplayNameChange(event.target.value)}
        />
      </div>

      <div className="profile-picker-section">
        <p className="section-label">Emoji avatar</p>
        <div className="avatar-grid" aria-label="Choose emoji avatar">
          {AVATAR_OPTIONS.map(option => {
            const optionAvatar: ProfileAvatar = { kind: 'emoji', value: option }
            return (
              <button
                key={option}
                type="button"
                className={'avatar-option' + (avatarsMatch(avatar, optionAvatar) ? ' selected' : '')}
                onClick={() => onAvatarChange(optionAvatar)}
                aria-pressed={avatarsMatch(avatar, optionAvatar)}
                aria-label={'Use avatar ' + option}
              >
                {option}
              </button>
            )
          })}
        </div>
      </div>

      <div className="profile-picker-section">
        <p className="section-label">Generated avatar</p>
        <div className="generated-avatar-grid" aria-label="Choose generated avatar">
          {GENERATED_AVATAR_VARIANTS.map(variant => {
            const seed = generatedAvatarSeed(avatarSeed, variant)
            const optionAvatar: ProfileAvatar = { kind: 'generated', seed }
            const label = variant === 'wallet' ? 'Wallet' : variant.charAt(0).toUpperCase() + variant.slice(1)
            return (
              <button
                key={variant}
                type="button"
                className={'generated-avatar-option' + (avatarsMatch(avatar, optionAvatar) ? ' selected' : '')}
                onClick={() => onAvatarChange(optionAvatar)}
                aria-pressed={avatarsMatch(avatar, optionAvatar)}
                aria-label={'Use ' + label + ' generated avatar'}
              >
                <MemberAvatar address={address} avatar={optionAvatar} size="md" />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="profile-picker-section">
        <p className="section-label">Upload photo</p>
        <input
          ref={fileInputRef}
          className="profile-upload-input"
          type="file"
          accept="image/*"
          onChange={handleUpload}
        />
        <button type="button" className="btn-ghost full" onClick={() => fileInputRef.current?.click()}>
          Upload image
        </button>
        {uploadError && <p className="profile-upload-error">{uploadError}</p>}
      </div>
    </div>
  )
}
