import { TestSuite } from "./test_runner"

import { suite as settingMigrationSuite } from "./test_setting_migration"
import { suite as databaseUpsertSuite } from "./test_database_upsert"
import { suite as idSuite } from "./test_id"
import { suite as safeRunSuite } from "./test_safe_run"
import { suite as playlistShareSuite } from "./test_playlist_share"
import { suite as lruCacheSuite } from "./test_lru_cache"
import { suite as resourceRepairMatchSuite } from "./test_resource_repair_match"
import { suite as playlistIntegritySuite } from "./test_playlist_integrity"
import { suite as asyncInitializerSuite } from "./test_async_initializer"
import { suite as homeScreenModelSuite } from "./test_home_screen_model"
import { suite as downloadSnapshotSuite } from "./test_download_snapshot"

export const ALL_SUITES: TestSuite[] = [
  settingMigrationSuite,
  databaseUpsertSuite,
  idSuite,
  safeRunSuite,
  playlistShareSuite,
  lruCacheSuite,
  resourceRepairMatchSuite,
  playlistIntegritySuite,
  asyncInitializerSuite,
  homeScreenModelSuite,
  downloadSnapshotSuite,
]
