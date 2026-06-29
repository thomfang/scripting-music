import { Image, ZStack, Rectangle, useState, useEffect } from "scripting"
import { usePlayerState } from "../../class/player_state"

export function Cover() {
  const { currentMusic } = usePlayerState()
  const [coverError, setCoverError] = useState(false)

  useEffect(() => { setCoverError(false) }, [currentMusic?.id])

  const fallback = (
    <ZStack>
      <Rectangle fill={"secondarySystemBackground"} />
      <Image
        systemName="music.note"
        font={64}
        foregroundStyle={"tertiaryLabel"}
        symbolRenderingMode={"monochrome"}
      />
    </ZStack>
  )

  if (currentMusic?.cover_url && !coverError) {
    return (
      <Image
        imageUrl={currentMusic.cover_url}
        resizable={true}
        scaleToFill={true}
        onError={() => setCoverError(true)}
        placeholder={fallback}
      />
    )
  }

  return fallback
}