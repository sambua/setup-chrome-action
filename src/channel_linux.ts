import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as tc from "@actions/tool-cache";
import * as cache from "./cache";
import type { DownloadResult, InstallResult, Installer } from "./installer";
import type { Platform } from "./platform";
import { isReleaseChannelName } from "./version";

export class LinuxChannelInstaller implements Installer {
  constructor(private readonly platform: Platform) {}

  async checkInstalled(version: string): Promise<InstallResult | undefined> {
    const root = await cache.find("chromium", version);
    if (root) {
      return { root, bin: "chrome" };
    }
  }

  async download(version: string): Promise<DownloadResult> {
    if (!isReleaseChannelName(version)) {
      throw new Error(`Unexpected version: ${version}`);
    }
    if (version === "canary") {
      throw new Error(
        `Chrome ${version} not supported for platform ${this.platform.os} ${this.platform.arch}`,
      );
    }

    const url = (() => {
      switch (version) {
        case "stable":
          return "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb";
        case "beta":
          return "https://dl.google.com/linux/direct/google-chrome-beta_current_amd64.deb";
        case "dev":
          return "https://dl.google.com/linux/direct/google-chrome-unstable_current_amd64.deb";
      }
    })();

    core.info(`Acquiring ${version} from ${url}`);
    const archive = await tc.downloadTool(url);
    return { archive };
  }

  async install(version: string, archive: string): Promise<InstallResult> {
    if (!isReleaseChannelName(version)) {
      throw new Error(`Unexpected version: ${version}`);
    }
    if (version === "canary") {
      throw new Error(`Chrome ${version} not supported for Linux`);
    }

    const tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "deb-"));
    const extdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "chrome-"));
    await exec.exec("ar", ["x", archive], { cwd: tmpdir });
    await exec.exec("tar", [
      "-xf",
      path.join(tmpdir, "data.tar.xz"),
      "--directory",
      extdir,
      "--strip-components",
      "4",
      "./opt/google",
    ]);

    // remove broken symlink
    await fs.promises.unlink(path.join(extdir, "google-chrome"));

    const root = await cache.cacheDir(extdir, "chromium", version);
    core.info(`Successfully Installed chromium to ${root}`);

    return { root, bin: "chrome" };
  }
}
