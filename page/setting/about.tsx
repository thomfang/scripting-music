import { HStack, Image, List, Script, Section, Spacer, Text, VStack, Link } from "scripting"

interface ServiceItem {
  name: string
  usage: string
  url: string
}

const THEME_COLOR = "systemPink"

const SERVICES: ServiceItem[] = [
  {
    name: "MP3Juice",
    usage: "音乐搜索与音频下载",
    url: "https://mp3juice3.ninja",
  },
  {
    name: "iTunes Search API",
    usage: "曲目元数据富化、排行榜、在线艺人 / 专辑浏览",
    url: "https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html",
  },
  {
    name: "TheAudioDB",
    usage: "艺人图片与简介",
    url: "https://www.theaudiodb.com",
  },
  {
    name: "LRCLIB",
    usage: "歌词搜索与获取",
    url: "https://lrclib.net",
  },
]

export function AboutPage() {
  const version = Script.metadata.version
  const appName = Script.metadata.localizedName ?? "Scripting Music"

  return (
    <List navigationTitle={"关于"} navigationBarTitleDisplayMode="inline">

      {/* App 信息 */}
      <Section>
        <VStack
          alignment="center"
          spacing={8}
          frame={{ maxWidth: "infinity" }}
          padding={{ top: 16, bottom: 16 }}
        >
          <Image
            systemName="music.note"
            font={{ name: "system", size: 60 }}
            foregroundStyle={THEME_COLOR}
          />
          <VStack alignment="center" spacing={4}>
            <Text font="title2" fontWeight="bold">{appName}</Text>
            <Text font="subheadline" foregroundStyle="secondaryLabel">
              {"版本 " + version}
            </Text>
          </VStack>
        </VStack>
      </Section>

      {/* 免责声明 */}
      <Section header={<Text>{"声明"}</Text>}>
        <VStack alignment="leading" spacing={8} padding={{ top: 6, bottom: 6 }}>
          <Text font="subheadline" foregroundStyle="secondaryLabel">
            {"本脚本仅供脚本开发学习与个人研究使用，不得用于任何商业用途。"}
          </Text>
          <Text font="subheadline" foregroundStyle="secondaryLabel">
            {"所有音乐内容版权归原权利方所有，请在合规范围内使用。"}
          </Text>
        </VStack>
      </Section>

      {/* 使用的接口与服务 */}
      <Section header={<Text>{"使用的接口与服务"}</Text>}>
        {SERVICES.map(svc => (
          <Link url={svc.url} key={svc.name}>
            <VStack alignment="leading" spacing={3} padding={{ top: 4, bottom: 4 }}>
              <HStack>
                <Text font="body" fontWeight="medium">{svc.name}</Text>
                <Spacer />
                <Image systemName="arrow.up.right" font="caption" foregroundStyle="tertiaryLabel" />
              </HStack>
              <Text font="caption" foregroundStyle="secondaryLabel">{svc.usage}</Text>
            </VStack>
          </Link>
        ))}
      </Section>

    </List>
  )
}
