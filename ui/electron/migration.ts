import { app } from "electron";
import path from "path";
import fs from "fs";
import log from "electron-log";

const OLD_APP_NAME = "finderai";
const MIGRATION_FLAG = ".migration-complete";

function getOldUserDataPath(): string {
  const userDataPath = app.getPath("userData");
  const currentAppName = path.basename(userDataPath);
  return userDataPath.replace(currentAppName, OLD_APP_NAME);
}

function shouldMigrate(): boolean {
  const currentPath = app.getPath("userData");
  const migrationFlagPath = path.join(currentPath, MIGRATION_FLAG);

  if (fs.existsSync(migrationFlagPath)) {
    return false;
  }

  const oldPath = getOldUserDataPath();
  return (
    fs.existsSync(oldPath) && fs.existsSync(path.join(oldPath, "config.json"))
  );
}

function copyDirectoryRecursive(source: string, destination: string): void {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (fs.existsSync(destPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

export async function migrateUserData(): Promise<void> {
  if (!shouldMigrate()) {
    log.info("Migration: No migration needed");
    return;
  }

  const oldPath = getOldUserDataPath();
  const newPath = app.getPath("userData");

  log.info(`Migration: Starting migration from ${oldPath} to ${newPath}`);

  try {
    const oldConfigPath = path.join(oldPath, "config.json");
    const newConfigPath = path.join(newPath, "config.json");

    if (fs.existsSync(oldConfigPath)) {
      const shouldCopy =
        !fs.existsSync(newConfigPath) ||
        fs.readFileSync(newConfigPath, "utf8").trim() === "{}";

      if (shouldCopy) {
        fs.copyFileSync(oldConfigPath, newConfigPath);
        log.info("Migration: Copied config.json (chat history)");
      }
    }

    const oldPartitionPath = path.join(oldPath, "Partitions", "docora");
    const newPartitionPath = path.join(newPath, "Partitions", "docora");

    if (fs.existsSync(oldPartitionPath)) {
      copyDirectoryRecursive(oldPartitionPath, newPartitionPath);
      log.info("Migration: Copied Partitions/docora (auth session)");
    }

    fs.writeFileSync(
      path.join(newPath, MIGRATION_FLAG),
      new Date().toISOString(),
    );
    log.info("Migration: Complete");
  } catch (error) {
    log.error("Migration: Failed", error);
    throw error;
  }
}
