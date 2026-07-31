import { HomeScreenRoot } from "./page/home_screen"

/**
 * Scripting App Home Tab entry.
 * The host mounts this component directly; do not call Navigation.present or Script.exit here.
 */
export default function HomeScreenDefaultUI() {
  return <HomeScreenRoot />
}
