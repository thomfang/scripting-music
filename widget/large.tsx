import { VStack, Text, Image, Button, ZStack, Spacer, HStack } from "scripting"
import { TogglePlaybackIntent, PreviousTrackIntent, NextTrackIntent } from "../app_intents"
import { NowPlayingData } from "./types"
import { CoverView } from "./cover_view"

export function LargeWidget({ data }: { data: NowPlayingData | null }) {
  return (
    <ZStack frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <VStack
        spacing={0}
        frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "center" }}
        padding={20}
      >
        <CoverView data={data} size={180} />
        <VStack alignment="center" spacing={6} padding={{ top: 16 }}>
          <Text font="title3" foregroundStyle="systemPink" lineLimit={1} fontWeight="semibold">
            {data?.title ?? "未在播放"}
          </Text>
          <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>
            {data?.artist ?? "—"}
          </Text>
        </VStack>
        <Spacer />
        {data ? (
          <HStack spacing={32} foregroundStyle="systemPink" padding={{ top: 16 }}>
            {data.can_prev ? (
              <Button intent={PreviousTrackIntent(undefined)} buttonStyle="plain">
                <Image systemName="backward.fill" font={24} />
              </Button>
            ) : (
              <Image systemName="backward.fill" font={24} foregroundStyle="tertiaryLabel" />
            )}
            <Button intent={TogglePlaybackIntent(undefined)} buttonStyle="plain">
              <Image systemName={data.is_playing ? "pause.fill" : "play.fill"} font={48} />
            </Button>
            {data.can_next ? (
              <Button intent={NextTrackIntent(undefined)} buttonStyle="plain">
                <Image systemName="forward.fill" font={24} />
              </Button>
            ) : (
              <Image systemName="forward.fill" font={24} foregroundStyle="tertiaryLabel" />
            )}
          </HStack>
        ) : (
          <HStack spacing={8} padding={{ top: 16 }}>
            <Image systemName="music.note" font={16} foregroundStyle="tertiaryLabel" />
            <Text font="caption" foregroundStyle="tertiaryLabel">暂无播放内容</Text>
          </HStack>
        )}
      </VStack>
    </ZStack>
  )
}