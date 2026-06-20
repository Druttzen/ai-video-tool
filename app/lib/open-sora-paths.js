/** Default Open-Sora install folder — matches host scan + Electron main. */
export function getDefaultOpenSoraInstallPath() {
  if (typeof process !== "undefined" && process.platform === "win32") {
    return "E:\\Open-Sora";
  }
  if (typeof process !== "undefined" && process.platform) {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    if (home) return `${home.replace(/\\/g, "/")}/Open-Sora`;
  }
  return "~/Open-Sora";
}
