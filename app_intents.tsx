import { AppIntentManager, AppIntentProtocol, Navigation, Notification, Script, Widget } from "scripting"
import { player } from "./class/player"
import { downloadManager } from "./class/download_manager"
import { HomePage } from "./page"

let presented = false

Script.onResume(async () => {
  if (presented) {
    return
  }

  presented = true

  try {
    await player.init()
    await downloadManager.init()
    await Navigation.present({
      element: <HomePage />,
      modalPresentationStyle: "overFullScreen"
    })
    if (player.getState() === "playing") {
      await player.pause()
    }
    Script.exit()
  } catch (e) {
    console.present().then(Script.exit)
    console.error(e)
  }
})

export const TogglePlaybackIntent = AppIntentManager.register({
  name: "TogglePlaybackIntent",
  protocol: AppIntentProtocol.AudioPlaybackIntent,
  perform: async (_params: undefined) => {
    if (!Script.hasFullAccess()) {
      Notification.schedule({
        title: "No PRO Access"
      })
    }
    await player.init()
    if (player.getState() === "playing") {
      await player.pause()
    } else {
      await player.play()
    }
    Widget.reloadUserWidgets()
  }
})

export const PreviousTrackIntent = AppIntentManager.register({
  name: "PreviousTrackIntent",
  protocol: AppIntentProtocol.AudioPlaybackIntent,
  perform: async (_params: undefined) => {
    await player.init()
    await player.previous()
    Widget.reloadUserWidgets()
  }
})

export const NextTrackIntent = AppIntentManager.register({
  name: "NextTrackIntent",
  protocol: AppIntentProtocol.AudioPlaybackIntent,
  perform: async (_params: undefined) => {
    await player.init()
    await player.next()
    Widget.reloadUserWidgets()
  }
})