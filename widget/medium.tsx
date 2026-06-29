import { HStack, VStack, Text, Image, Button } from "scripting"
import { TogglePlaybackIntent, PreviousTrackIntent, NextTrackIntent } from "../app_intents"
import { NowPlayingData } from "./types"
import { CoverView } from "./cover_view"

export function MediumWidget({ data }: { data: NowPlayingData | null }) {
  return (
    <HStack
      spacing={14}
      padding={14}
      frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "leading" }}
    >
      <CoverView data={data} size={88} />
      <VStack
        alignment="leading"
        spacing={6}
        frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "leading" }}
      >
        <Text font="headline" foregroundStyle="systemPink" lineLimit={2} fontWeight="semibold">
          {data?.title ?? "未在播放"}
        </Text>
        <Text font="subheadline" foregroundStyle="label" lineLimit={1}>
          {data?.artist ?? "—"}
        </Text>
        <HStack spacing={5}>
          <Image
            systemName={data?.is_playing ? "waveform" : "music.note"}
            font={11}
            foregroundStyle="systemPink"
          />
          <Text font="caption2" foregroundStyle="systemPink">
            {data?.is_playing ? "正在播放" : "未在播放"}
          </Text>
        </HStack>{data ? (
          <HStack spacing={12} foregroundStyle="systemPink">
            {data.can_prev ? (
              <Button intent={PreviousTrackIntent(undefined)} buttonStyle="plain">
                <Image systemName="backward.fill" font={16} />
              </Button>
            ) : (
              <Image systemName="backward.fill" font={16} foregroundStyle="tertiaryLabel" />
            )}
            <Button intent={TogglePlaybackIntent(undefined)} buttonStyle="plain">
              <Image systemName={data.is_playing ? "pause.fill" : "play.fill"} font={22} />
            </Button>
            {data.can_next ? (
              <Button intent={NextTrackIntent(undefined)} buttonStyle="plain">
                <Image systemName="forward.fill" font={16} />
              </Button>
            ) : (
              <Image systemName="forward.fill" font={16} foregroundStyle="tertiaryLabel" />
            )}
          </HStack>
        ) : null}
      </VStack>
    </HStack>
  )
}