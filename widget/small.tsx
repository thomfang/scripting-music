import { VStack, Text, Image, Button, HStack, Spacer } from "scripting"
import { TogglePlaybackIntent, PreviousTrackIntent, NextTrackIntent } from "../app_intents"
import { NowPlayingData } from "./types"
import { CoverView } from "./cover_view"

export function SmallWidget({ data }: { data: NowPlayingData | null }) {
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding
      frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "leading" }}
    >
      <CoverView data={data} size={56} />
      <VStack alignment="leading" spacing={2} padding={{ top: 8 }}>
        <Text font="headline" foregroundStyle="systemPink" lineLimit={1} fontWeight="semibold">
          {data?.title ?? "未在播放"}
        </Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
          {data?.artist ?? "—"}
        </Text>
      </VStack>
      <Spacer />
      {data ? (
        <HStack  
          spacing={12}
          foregroundStyle="systemPink">
          <Spacer/>
          {data.can_prev ? (
            <Button intent={PreviousTrackIntent(undefined)} buttonStyle="plain">
              <Image systemName="backward.circle.fill" font={24} />
            </Button>
          ) : (
            <Image systemName="backward.circle.fill" font={24} foregroundStyle="tertiaryLabel" />
          )}
          <Button intent={TogglePlaybackIntent(undefined)} buttonStyle="plain">
            <Image systemName={data.is_playing ? "pause.circle.fill" : "play.circle.fill"} font={24} />
          </Button>
          {data.can_next ? (
            <Button intent={NextTrackIntent(undefined)} buttonStyle="plain">
              <Image systemName="forward.circle.fill" font={24} />
            </Button>
          ) : (
            <Image systemName="forward.fill" font={24} foregroundStyle="tertiaryLabel" />
          )}
        </HStack>
      ) : null}
    </VStack>
  )
}